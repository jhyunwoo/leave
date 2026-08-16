/**
 * 관리자용 사용자·부대 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 * 다루는 것: 목록·검색·생성·수정·삭제, 초대코드 조회/폐기, 사용자 세션 만료.
 *
 * 사용자나 그룹을 바꾸면 그 그룹의 달력 집계가 달라지므로
 * `bumpUnitVersion`으로 캐시를 무효화해야 한다.
 */

import {
  bumpUnitVersion,
  hashPassword,
  leaves,
  notifications,
  sessions,
  unitInvites,
  units,
  users,
} from "@leave/api/server";
import { BRANCHES, RANKS, isoDateSchema } from "@leave/shared";
import { and, asc, desc, eq, like, ne, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso, parseBoolean } from "../utils";

const nullableId = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .nullable()
  .optional();

const userCreateSchema = z
  .object({
    email: z.email("올바른 이메일 주소를 입력해주세요"),
    password: z
      .string()
      .min(12, "임시 비밀번호는 12자 이상이어야 합니다")
      .max(100),
    name: z.string().trim().min(1).max(50),
    branch: z.enum(BRANCHES),
    enlistedAt: isoDateSchema,
    dischargeAt: isoDateSchema,
    signupRank: z.enum(RANKS),
    unitId: nullableId,
    dataConsent: z.literal(true, {
      error: "개인정보 수집 동의가 확인되어야 합니다",
    }),
  })
  .refine((value) => value.enlistedAt < value.dischargeAt, {
    path: ["dischargeAt"],
    message: "전역 예정일은 입대일보다 뒤여야 합니다",
  });

const userUpdateSchema = z
  .object({
    email: z.email().optional(),
    password: z.string().min(12).max(100).optional(),
    name: z.string().trim().min(1).max(50).optional(),
    branch: z.enum(BRANCHES).optional(),
    enlistedAt: isoDateSchema.optional(),
    dischargeAt: isoDateSchema.optional(),
    signupRank: z.enum(RANKS).optional(),
    unitId: nullableId,
    consented: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.enlistedAt === undefined ||
      value.dischargeAt === undefined ||
      value.enlistedAt < value.dischargeAt,
    {
      path: ["dischargeAt"],
      message: "전역 예정일은 입대일보다 뒤여야 합니다",
    },
  );

const unitBaseSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(200).nullable().optional(),
  maxLeaveCount: z.int().min(0).max(100_000),
  creatorId: z.string().min(1),
  adminId: z.string().min(1),
});

const unitCreateSchema = unitBaseSchema;

const unitUpdateSchema = unitBaseSchema.omit({ creatorId: true }).partial();

function userDto(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    branch: user.branch,
    enlistedAt: user.enlistedAt,
    dischargeAt: user.dischargeAt,
    signupRank: user.signupRank,
    unitId: user.unitId,
    pushTokenRegistered: Boolean(user.expoPushToken),
    consentedAt: user.consentedAt,
    createdAt: user.createdAt,
  };
}

async function ensureUser(
  db: ReturnType<typeof drizzle>,
  id: string,
): Promise<typeof users.$inferSelect | null> {
  return (await db.select().from(users).where(eq(users.id, id)).get()) ?? null;
}

async function ensureUnit(
  db: ReturnType<typeof drizzle>,
  id: string | null | undefined,
): Promise<boolean> {
  if (!id) return true;
  return Boolean(
    await db.select({ id: units.id }).from(units).where(eq(units.id, id)).get(),
  );
}

export const userUnitRoutes = new Hono<AdminAppEnv>()
  .get("/users", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const conditions: SQL<unknown>[] = [];
    const unitId = c.req.query("unitId");
    const branch = c.req.query("branch");
    const consented = parseBoolean(c.req.query("consented"));
    if (q) {
      conditions.push(
        or(
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
          like(users.id, `%${q}%`),
        )!,
      );
    }
    if (unitId) conditions.push(eq(users.unitId, unitId));
    if (branch) conditions.push(eq(users.branch, branch as never));
    if (consented === true)
      conditions.push(sql`${users.consentedAt} is not null`);
    if (consented === false) conditions.push(sql`${users.consentedAt} is null`);
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, total] = await Promise.all([
      db
        .select({ user: users, unitName: units.name })
        .from(users)
        .leftJoin(units, eq(users.unitId, units.id))
        .where(where)
        .orderBy(desc(users.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db.$count(users, where),
    ]);
    return c.json({
      items: rows.map(({ user, unitName }) => ({ ...userDto(user), unitName })),
      meta: listMeta(page, pageSize, total),
    });
  })
  .post("/users", async (c) => {
    const input = userCreateSchema.safeParse(
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
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))
        .get()
    ) {
      return c.json({ error: "이미 가입된 이메일입니다" }, 409);
    }
    if (!(await ensureUnit(db, input.data.unitId))) {
      return c.json({ error: "부대를 찾을 수 없습니다" }, 400);
    }
    const { hash, salt } = await hashPassword(input.data.password);
    const now = nowIso();
    const user: typeof users.$inferInsert = {
      id: crypto.randomUUID(),
      email,
      passwordHash: hash,
      passwordSalt: salt,
      name: input.data.name,
      branch: input.data.branch,
      enlistedAt: input.data.enlistedAt,
      dischargeAt: input.data.dischargeAt,
      signupRank: input.data.signupRank,
      unitId: input.data.unitId ?? null,
      expoPushToken: null,
      consentedAt: now,
      createdAt: now,
    };
    await db.insert(users).values(user);
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    const after = userDto(user as typeof users.$inferSelect);
    await writeAudit(c, {
      action: "create",
      entityType: "user",
      entityId: user.id,
      after,
    });
    return c.json({ item: after }, 201);
  })
  .patch("/users/:id", async (c) => {
    const input = userUpdateSchema.safeParse(
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
    const before = await ensureUser(db, id);
    if (!before) return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
    if (!(await ensureUnit(db, input.data.unitId))) {
      return c.json({ error: "부대를 찾을 수 없습니다" }, 400);
    }
    if (input.data.email && input.data.email.toLowerCase() !== before.email) {
      const duplicate = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.email, input.data.email.toLowerCase()),
            ne(users.id, id),
          ),
        )
        .get();
      if (duplicate) return c.json({ error: "이미 가입된 이메일입니다" }, 409);
    }
    const patch: Partial<typeof users.$inferInsert> = {};
    if (input.data.email !== undefined) {
      patch.email = input.data.email.toLowerCase();
    }
    if (input.data.name !== undefined) patch.name = input.data.name;
    if (input.data.branch !== undefined) patch.branch = input.data.branch;
    if (input.data.enlistedAt !== undefined) {
      patch.enlistedAt = input.data.enlistedAt;
    }
    if (input.data.dischargeAt !== undefined) {
      patch.dischargeAt = input.data.dischargeAt;
    }
    if (input.data.signupRank !== undefined) {
      patch.signupRank = input.data.signupRank;
    }
    if (input.data.unitId !== undefined) patch.unitId = input.data.unitId;
    if (input.data.consented !== undefined) {
      patch.consentedAt = input.data.consented ? nowIso() : null;
    }
    if (input.data.password) {
      const { hash, salt } = await hashPassword(input.data.password);
      patch.passwordHash = hash;
      patch.passwordSalt = salt;
    }
    if (Object.keys(patch).length) {
      await db.update(users).set(patch).where(eq(users.id, id));
    }
    if (input.data.unitId !== undefined) {
      if (before.unitId) await bumpUnitVersion(c.env.CACHE, before.unitId);
      if (input.data.unitId) {
        await bumpUnitVersion(c.env.CACHE, input.data.unitId);
      }
    }
    if (input.data.password) {
      await db.delete(sessions).where(eq(sessions.userId, id));
    }
    const updated = (await ensureUser(db, id))!;
    const after = userDto(updated);
    await writeAudit(c, {
      action: "update",
      entityType: "user",
      entityId: id,
      before: userDto(before),
      after,
    });
    return c.json({ item: after });
  })
  .delete("/users/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await ensureUser(db, id);
    if (!before) return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
    const managedUnits = await db
      .select({ id: units.id, name: units.name })
      .from(units)
      .where(eq(units.adminId, id))
      .all();
    if (managedUnits.length) {
      return c.json(
        {
          error: "관리 중인 부대를 먼저 다른 사용자에게 이관해주세요",
          units: managedUnits,
        },
        409,
      );
    }
    await db.delete(leaves).where(eq(leaves.userId, id));
    await db.delete(notifications).where(eq(notifications.userId, id));
    await db.delete(sessions).where(eq(sessions.userId, id));
    // 접속·푸시 로그는 운영 감사 기록이므로 보존한다.
    await db.delete(users).where(eq(users.id, id));
    if (before.unitId) await bumpUnitVersion(c.env.CACHE, before.unitId);
    await writeAudit(c, {
      action: "delete",
      entityType: "user",
      entityId: id,
      before: userDto(before),
    });
    return c.json({ ok: true as const });
  })
  .get("/units", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const where = q
      ? or(like(units.name, `%${q}%`), like(units.id, `%${q}%`))
      : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          unit: units,
          memberCount: sql<number>`cast(count(${users.id}) as integer)`,
        })
        .from(units)
        .leftJoin(users, eq(users.unitId, units.id))
        .where(where)
        .groupBy(units.id)
        .orderBy(asc(units.name))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db.$count(units, where),
    ]);
    return c.json({
      items: items.map(({ unit, memberCount }) => ({ ...unit, memberCount })),
      meta: listMeta(page, pageSize, total),
    });
  })
  .post("/units", async (c) => {
    const input = unitCreateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    // 그룹 표시명은 검색·색인되지 않는 내부 라벨이라 중복을 허용한다.
    // 이름으로 그룹을 특정할 수 있으면 부대 식별 경로가 다시 열린다.
    const [creator, admin] = await Promise.all([
      ensureUser(db, input.data.creatorId),
      ensureUser(db, input.data.adminId),
    ]);
    if (!creator || !admin) {
      return c.json({ error: "생성자 또는 관리자를 찾을 수 없습니다" }, 400);
    }
    const unit: typeof units.$inferInsert = {
      id: crypto.randomUUID(),
      name: input.data.name,
      description: input.data.description ?? null,
      maxLeaveCount: input.data.maxLeaveCount,
      creatorId: creator.id,
      adminId: admin.id,
      createdAt: nowIso(),
    };
    await db.insert(units).values(unit);
    await db
      .update(users)
      .set({ unitId: unit.id })
      .where(eq(users.id, admin.id));
    await bumpUnitVersion(c.env.CACHE, unit.id);
    await writeAudit(c, {
      action: "create",
      entityType: "unit",
      entityId: unit.id,
      after: unit,
    });
    return c.json({ item: { ...unit, memberCount: 1 } }, 201);
  })
  .patch("/units/:id", async (c) => {
    const input = unitUpdateSchema.safeParse(
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
    const before = await db.select().from(units).where(eq(units.id, id)).get();
    if (!before) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (input.data.adminId && !(await ensureUser(db, input.data.adminId))) {
      return c.json({ error: "관리자를 찾을 수 없습니다" }, 400);
    }
    await db.update(units).set(input.data).where(eq(units.id, id));
    if (input.data.adminId) {
      await db
        .update(users)
        .set({ unitId: id })
        .where(eq(users.id, input.data.adminId));
    }
    await bumpUnitVersion(c.env.CACHE, id);
    const after = (await db
      .select()
      .from(units)
      .where(eq(units.id, id))
      .get())!;
    await writeAudit(c, {
      action: "update",
      entityType: "unit",
      entityId: id,
      before,
      after,
    });
    return c.json({ item: after });
  })
  .delete("/units/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db.select().from(units).where(eq(units.id, id)).get();
    if (!before) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    // 그룹이 사라진 뒤에도 유효한 초대코드가 남지 않도록 함께 폐기한다.
    await db.delete(unitInvites).where(eq(unitInvites.unitId, id));
    await db.update(users).set({ unitId: null }).where(eq(users.unitId, id));
    await db.delete(units).where(eq(units.id, id));
    await bumpUnitVersion(c.env.CACHE, id);
    await writeAudit(c, {
      action: "delete",
      entityType: "unit",
      entityId: id,
      before,
    });
    return c.json({ ok: true as const });
  });
