/**
 * 관리자 계정 관리와 이미지(R2) 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 *
 * 관리자 계정 조작은 owner 역할만 할 수 있다(ownerMiddleware).
 * 새 계정과 비밀번호 초기화는 임시 비밀번호를 발급하며, 그 원문은 응답에 한 번만
 * 실려 나가고 저장되지 않는다.
 */

import {
  adminAccounts,
  adminSessions,
  hashPassword,
  units,
  users,
} from "@leave/api/server";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { adminDto, ownerMiddleware } from "../auth";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { nowIso } from "../utils";

const adminCreateSchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(50),
  role: z.enum(["owner", "admin"]).default("admin"),
});

const adminUpdateSchema = z.object({
  name: z.string().trim().min(1).max(50).optional(),
  role: z.enum(["owner", "admin"]).optional(),
  active: z.boolean().optional(),
});

function randomTemporaryPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  const encoded = btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  return `L!${encoded}`;
}

async function activeOwnerCount(
  db: ReturnType<typeof drizzle>,
): Promise<number> {
  return db.$count(
    adminAccounts,
    and(eq(adminAccounts.role, "owner"), eq(adminAccounts.active, true)),
  );
}

async function readImageFile(c: {
  req: { parseBody: () => Promise<Record<string, string | File>> };
}): Promise<File | null> {
  const body = await c.req.parseBody();
  const image = body.image;
  if (!(image instanceof File)) return null;
  if (!image.type.startsWith("image/")) return null;
  if (image.size > 5 * 1024 * 1024) return null;
  return image;
}

function extensionFor(type: string): string {
  const extensions: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
  };
  return extensions[type] ?? "bin";
}

export const adminImageRoutes = new Hono<AdminAppEnv>()
  .get("/admins", ownerMiddleware, async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(adminAccounts)
      .orderBy(desc(adminAccounts.createdAt))
      .all();
    return c.json({ items: rows.map(adminDto) });
  })
  .post("/admins", ownerMiddleware, async (c) => {
    const input = adminCreateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const email = input.data.email.toLowerCase();
    if (
      await db
        .select({ id: adminAccounts.id })
        .from(adminAccounts)
        .where(eq(adminAccounts.email, email))
        .get()
    ) {
      return c.json({ error: "이미 등록된 관리자 이메일입니다" }, 409);
    }
    const temporaryPassword = randomTemporaryPassword();
    const { hash, salt } = await hashPassword(temporaryPassword);
    const now = nowIso();
    const account: typeof adminAccounts.$inferInsert = {
      id: crypto.randomUUID(),
      email,
      name: input.data.name,
      role: input.data.role,
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: true,
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    await db.insert(adminAccounts).values(account);
    await writeAudit(c, {
      action: "create",
      entityType: "admin_account",
      entityId: account.id,
      after: adminDto(account as typeof adminAccounts.$inferSelect),
    });
    return c.json(
      {
        item: adminDto(account as typeof adminAccounts.$inferSelect),
        temporaryPassword,
      },
      201,
    );
  })
  .patch("/admins/:id", ownerMiddleware, async (c) => {
    const input = adminUpdateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.id, id))
      .get();
    if (!before) return c.json({ error: "관리자를 찾을 수 없습니다" }, 404);
    if (
      id === c.get("admin").id &&
      (input.data.active === false || input.data.role === "admin")
    ) {
      return c.json(
        { error: "현재 로그인한 owner의 권한이나 상태는 변경할 수 없습니다" },
        409,
      );
    }
    if (
      before.role === "owner" &&
      before.active &&
      (input.data.active === false || input.data.role === "admin") &&
      (await activeOwnerCount(db)) <= 1
    ) {
      return c.json({ error: "마지막 활성 owner는 변경할 수 없습니다" }, 409);
    }
    const patch = { ...input.data, updatedAt: nowIso() };
    await db.update(adminAccounts).set(patch).where(eq(adminAccounts.id, id));
    if (input.data.active === false) {
      await db
        .delete(adminSessions)
        .where(eq(adminSessions.adminId, before.id));
    }
    const after = {
      ...before,
      ...patch,
    };
    await writeAudit(c, {
      action: "update",
      entityType: "admin_account",
      entityId: id,
      before: adminDto(before),
      after: adminDto(after),
    });
    return c.json({ item: adminDto(after) });
  })
  .post("/admins/:id/reset-password", ownerMiddleware, async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(adminAccounts)
      .where(eq(adminAccounts.id, id))
      .get();
    if (!before) return c.json({ error: "관리자를 찾을 수 없습니다" }, 404);
    if (id === c.get("admin").id) {
      return c.json(
        { error: "현재 계정은 내 비밀번호 변경 화면을 사용해주세요" },
        409,
      );
    }
    const temporaryPassword = randomTemporaryPassword();
    const { hash, salt } = await hashPassword(temporaryPassword);
    await db
      .update(adminAccounts)
      .set({
        passwordHash: hash,
        passwordSalt: salt,
        mustChangePassword: true,
        active: true,
        updatedAt: nowIso(),
      })
      .where(eq(adminAccounts.id, id));
    await db.delete(adminSessions).where(eq(adminSessions.adminId, id));
    await writeAudit(c, {
      action: "reset_password",
      entityType: "admin_account",
      entityId: id,
      before: adminDto(before),
      after: { ...adminDto(before), active: true, mustChangePassword: true },
    });
    return c.json({ ok: true as const, temporaryPassword });
  })
  .get("/admin-sessions", ownerMiddleware, async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: adminSessions.id,
        adminId: adminSessions.adminId,
        adminEmail: adminAccounts.email,
        adminName: adminAccounts.name,
        expiresAt: adminSessions.expiresAt,
        lastSeenAt: adminSessions.lastSeenAt,
        ip: adminSessions.ip,
        userAgent: adminSessions.userAgent,
        createdAt: adminSessions.createdAt,
      })
      .from(adminSessions)
      .innerJoin(adminAccounts, eq(adminSessions.adminId, adminAccounts.id))
      .orderBy(desc(adminSessions.createdAt))
      .all();
    return c.json({ items: rows });
  })
  .delete("/admin-sessions/:id", ownerMiddleware, async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    if (id === c.get("adminSessionId")) {
      return c.json({ error: "현재 세션은 로그아웃으로 종료해주세요" }, 409);
    }
    const before = await db
      .select({
        id: adminSessions.id,
        adminId: adminSessions.adminId,
        expiresAt: adminSessions.expiresAt,
        createdAt: adminSessions.createdAt,
      })
      .from(adminSessions)
      .where(eq(adminSessions.id, id))
      .get();
    if (!before)
      return c.json({ error: "관리자 세션을 찾을 수 없습니다" }, 404);
    await db.delete(adminSessions).where(eq(adminSessions.id, id));
    await writeAudit(c, {
      action: "revoke",
      entityType: "admin_session",
      entityId: id,
      before,
    });
    return c.json({ ok: true as const });
  })
  .get("/image", async (c) => {
    const key = c.req.query("key");
    if (!key || key.includes("..") || key.length > 512) {
      return c.json({ error: "유효하지 않은 이미지 키입니다" }, 400);
    }
    const object = await c.env.BUCKET.get(key);
    if (!object) return c.json({ error: "이미지를 찾을 수 없습니다" }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Cache-Control", "private, no-store");
    headers.set("X-Content-Type-Options", "nosniff");
    return new Response(object.body, { headers });
  })
  .put("/users/:id/image", async (c) => {
    const image = await readImageFile(c);
    if (!image) {
      return c.json(
        {
          error: "5MB 이하의 JPEG, PNG, WebP, GIF, AVIF 이미지를 선택해주세요",
        },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db.select().from(users).where(eq(users.id, id)).get();
    if (!before) return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
    const key = `profiles/${id}/${crypto.randomUUID()}.${extensionFor(image.type)}`;
    await c.env.BUCKET.put(key, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: {
        uploadedBy: c.get("admin").email,
        source: "admin",
      },
    });
    await db
      .update(users)
      .set({ profileImageKey: key })
      .where(eq(users.id, id));
    if (before.profileImageKey) {
      await c.env.BUCKET.delete(before.profileImageKey).catch(() => undefined);
    }
    await writeAudit(c, {
      action: "update_image",
      entityType: "user",
      entityId: id,
      before: { profileImageKey: before.profileImageKey },
      after: { profileImageKey: key },
    });
    return c.json({ key });
  })
  .delete("/users/:id/image", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db.select().from(users).where(eq(users.id, id)).get();
    if (!before) return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
    await db
      .update(users)
      .set({ profileImageKey: null })
      .where(eq(users.id, id));
    if (before.profileImageKey) {
      await c.env.BUCKET.delete(before.profileImageKey).catch(() => undefined);
    }
    await writeAudit(c, {
      action: "delete_image",
      entityType: "user",
      entityId: id,
      before: { profileImageKey: before.profileImageKey },
      after: { profileImageKey: null },
    });
    return c.json({ ok: true as const });
  })
  .put("/units/:id/image", async (c) => {
    const image = await readImageFile(c);
    if (!image) {
      return c.json(
        {
          error: "5MB 이하의 JPEG, PNG, WebP, GIF, AVIF 이미지를 선택해주세요",
        },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db.select().from(units).where(eq(units.id, id)).get();
    if (!before) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    const key = `units/${id}/${crypto.randomUUID()}.${extensionFor(image.type)}`;
    await c.env.BUCKET.put(key, image.stream(), {
      httpMetadata: { contentType: image.type },
      customMetadata: {
        uploadedBy: c.get("admin").email,
        source: "admin",
      },
    });
    await db.update(units).set({ imageKey: key }).where(eq(units.id, id));
    if (before.imageKey) {
      await c.env.BUCKET.delete(before.imageKey).catch(() => undefined);
    }
    await writeAudit(c, {
      action: "update_image",
      entityType: "unit",
      entityId: id,
      before: { imageKey: before.imageKey },
      after: { imageKey: key },
    });
    return c.json({ key });
  })
  .delete("/units/:id/image", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db.select().from(units).where(eq(units.id, id)).get();
    if (!before) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    await db.update(units).set({ imageKey: null }).where(eq(units.id, id));
    if (before.imageKey) {
      await c.env.BUCKET.delete(before.imageKey).catch(() => undefined);
    }
    await writeAudit(c, {
      action: "delete_image",
      entityType: "unit",
      entityId: id,
      before: { imageKey: before.imageKey },
      after: { imageKey: null },
    });
    return c.json({ ok: true as const });
  });
