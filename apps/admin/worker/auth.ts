/**
 * 관리자 인증 — 로그인, 세션 쿠키, CSRF, 비밀번호 변경 강제.
 *
 * 사용처: apps/admin/worker/index.ts.
 *
 * 사용자 앱과 달리 관리자 세션은 Bearer 토큰이 아니라 HttpOnly 쿠키를 쓴다.
 * 브라우저 전용 화면이라 XSS로 토큰이 읽히는 경로를 없애는 편이 낫기 때문이다.
 * 대신 쿠키는 자동 전송되므로 CSRF 검사가 필수다(csrfMiddleware).
 *
 * 로그인 실패는 15분 창 안에서 5회로 제한하고, 임시 비밀번호로 만든 계정은
 * 비밀번호를 바꾸기 전까지 운영 API에 닿지 못한다.
 */

import {
  adminAccounts,
  adminSessions,
  generateSessionToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
  verifyPasswordOrDecoy,
} from "@leave/api/server";
import { and, eq, ne } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { writeAudit, writeAuditForActor } from "./audit";
import type { AdminAppEnv } from "./types";
import { clientIp, nowIso, safeWaitUntil, userAgent } from "./utils";

export const ADMIN_SESSION_COOKIE = "leave_admin_session";
const SESSION_TTL_SECONDS = 12 * 60 * 60;
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000;
const LOGIN_WINDOW_SECONDS = 15 * 60;
const MAX_LOGIN_ATTEMPTS = 5;

export const loginInputSchema = z.object({
  email: z.email("올바른 이메일 주소를 입력해주세요"),
  // 관리자 비밀번호는 변경 화면에서 100자로 막힌다. 그보다 긴 입력은 어떤 계정과도
  // 맞을 수 없으므로, PBKDF2까지 들여보내지 않고 여기서 끊는다.
  password: z
    .string()
    .min(1, "비밀번호를 입력해주세요")
    .max(200, "비밀번호가 너무 깁니다"),
});

export const changePasswordInputSchema = z.object({
  currentPassword: z.string().min(1, "현재 비밀번호를 입력해주세요"),
  newPassword: z
    .string()
    .min(12, "새 비밀번호는 12자 이상이어야 합니다")
    .max(100, "새 비밀번호는 100자 이하여야 합니다"),
});

export function adminDto(admin: typeof adminAccounts.$inferSelect) {
  return {
    id: admin.id,
    email: admin.email,
    name: admin.name,
    role: admin.role,
    mustChangePassword: admin.mustChangePassword,
    active: admin.active,
    createdAt: admin.createdAt,
    updatedAt: admin.updatedAt,
  };
}

function cookieOptions(maxAge = SESSION_TTL_SECONDS) {
  return {
    httpOnly: true,
    secure: true,
    sameSite: "Strict" as const,
    path: "/",
    maxAge,
  };
}

async function attemptKey(ip: string | null, email: string): Promise<string> {
  const digest = await sha256Hex(`${ip ?? "unknown"}:${email.toLowerCase()}`);
  return `admin-login:${digest}`;
}

export const csrfMiddleware = createMiddleware<AdminAppEnv>(async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    if (c.req.header("X-Admin-Request") !== "1") {
      return c.json({ error: "유효하지 않은 요청입니다" }, 403);
    }
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin) {
      return c.json({ error: "교차 출처 요청은 허용되지 않습니다" }, 403);
    }
    if (c.req.header("Sec-Fetch-Site") === "cross-site") {
      return c.json({ error: "교차 사이트 요청은 허용되지 않습니다" }, 403);
    }
  }
  await next();
});

export const adminAuthMiddleware = createMiddleware<AdminAppEnv>(
  async (c, next) => {
    const token = getCookie(c, ADMIN_SESSION_COOKIE);
    if (!token) return c.json({ error: "관리자 로그인이 필요합니다" }, 401);

    const db = drizzle(c.env.DB);
    const tokenHash = await sha256Hex(token);
    const row = await db
      .select({ admin: adminAccounts, session: adminSessions })
      .from(adminSessions)
      .innerJoin(adminAccounts, eq(adminSessions.adminId, adminAccounts.id))
      .where(
        and(
          eq(adminSessions.tokenHash, tokenHash),
          eq(adminAccounts.active, true),
        ),
      )
      .get();

    if (!row || row.session.expiresAt <= nowIso()) {
      if (row) {
        await db
          .delete(adminSessions)
          .where(eq(adminSessions.id, row.session.id));
      }
      deleteCookie(c, ADMIN_SESSION_COOKIE, cookieOptions(0));
      return c.json({ error: "관리자 세션이 만료되었습니다" }, 401);
    }

    c.set("admin", row.admin);
    c.set("adminSessionId", row.session.id);

    const lastSeen = Date.parse(row.session.lastSeenAt);
    if (Date.now() - lastSeen >= SESSION_TOUCH_INTERVAL_MS) {
      safeWaitUntil(
        c,
        db
          .update(adminSessions)
          .set({ lastSeenAt: nowIso() })
          .where(eq(adminSessions.id, row.session.id)),
      );
    }
    await next();
  },
);

export const passwordChangedMiddleware = createMiddleware<AdminAppEnv>(
  async (c, next) => {
    if (c.get("admin").mustChangePassword) {
      return c.json(
        {
          error: "임시 비밀번호를 변경해야 합니다",
          code: "PASSWORD_CHANGE_REQUIRED",
        },
        403,
      );
    }
    await next();
  },
);

export const ownerMiddleware = createMiddleware<AdminAppEnv>(
  async (c, next) => {
    if (c.get("admin").role !== "owner") {
      return c.json({ error: "owner 권한이 필요합니다" }, 403);
    }
    await next();
  },
);

export async function loginAdmin(c: Context<AdminAppEnv>) {
  const input = loginInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
      400,
    );
  }

  const email = input.data.email.trim().toLowerCase();
  const rateKey = await attemptKey(clientIp(c), email);
  const attempts = Number((await c.env.CACHE.get(rateKey)) ?? 0);
  if (attempts >= MAX_LOGIN_ATTEMPTS) {
    return c.json(
      { error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요" },
      429,
    );
  }

  const db = drizzle(c.env.DB);
  const admin = await db
    .select()
    .from(adminAccounts)
    .where(eq(adminAccounts.email, email))
    .get();
  // 계정이 없거나 비활성이어도 PBKDF2를 한 번 돌린다. 조건을 먼저 보고 빠져나가면
  // 응답 시간이 "그 주소의 관리자 계정이 있는가"를 알려준다
  // (@leave/api/server의 verifyPasswordOrDecoy 참고).
  const passwordMatches = await verifyPasswordOrDecoy(
    input.data.password,
    admin ? { salt: admin.passwordSalt, hash: admin.passwordHash } : null,
  );
  const valid = admin?.active === true && passwordMatches;

  if (!admin || !valid) {
    await c.env.CACHE.put(rateKey, String(attempts + 1), {
      expirationTtl: LOGIN_WINDOW_SECONDS,
    });
    await writeAuditForActor(
      c,
      { id: admin?.id ?? null, email },
      {
        action: "login_failed",
        entityType: "admin_session",
        entityId: admin?.id ?? null,
      },
    );
    return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
  }

  await c.env.CACHE.delete(rateKey);
  const token = generateSessionToken();
  const now = nowIso();
  const session = {
    id: crypto.randomUUID(),
    adminId: admin.id,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_SECONDS * 1000).toISOString(),
    lastSeenAt: now,
    ip: clientIp(c),
    userAgent: userAgent(c),
    createdAt: now,
  };
  await db.insert(adminSessions).values(session);
  c.set("admin", admin);
  c.set("adminSessionId", session.id);
  await writeAudit(c, {
    action: "login",
    entityType: "admin_session",
    entityId: session.id,
  });
  setCookie(c, ADMIN_SESSION_COOKIE, token, cookieOptions());
  return c.json({ admin: adminDto(admin) }, 200);
}

export async function changeAdminPassword(c: Context<AdminAppEnv>) {
  const input = changePasswordInputSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!input.success) {
    return c.json(
      { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
      400,
    );
  }
  const admin = c.get("admin");
  if (
    !(await verifyPassword(
      input.data.currentPassword,
      admin.passwordSalt,
      admin.passwordHash,
    ))
  ) {
    return c.json({ error: "현재 비밀번호가 올바르지 않습니다" }, 400);
  }
  const { hash, salt } = await hashPassword(input.data.newPassword);
  const db = drizzle(c.env.DB);
  await db
    .update(adminAccounts)
    .set({
      passwordHash: hash,
      passwordSalt: salt,
      mustChangePassword: false,
      updatedAt: nowIso(),
    })
    .where(eq(adminAccounts.id, admin.id));
  await db
    .delete(adminSessions)
    .where(
      and(
        eq(adminSessions.adminId, admin.id),
        ne(adminSessions.id, c.get("adminSessionId")),
      ),
    );
  const updated = {
    ...admin,
    passwordHash: hash,
    passwordSalt: salt,
    mustChangePassword: false,
    updatedAt: nowIso(),
  };
  c.set("admin", updated);
  await writeAudit(c, {
    action: "change_password",
    entityType: "admin_account",
    entityId: admin.id,
    before: { mustChangePassword: admin.mustChangePassword },
    after: { mustChangePassword: false },
  });
  return c.json({ admin: adminDto(updated) }, 200);
}

export async function logoutAdmin(c: Context<AdminAppEnv>) {
  const db = drizzle(c.env.DB);
  await writeAudit(c, {
    action: "logout",
    entityType: "admin_session",
    entityId: c.get("adminSessionId"),
  });
  await db
    .delete(adminSessions)
    .where(eq(adminSessions.id, c.get("adminSessionId")));
  deleteCookie(c, ADMIN_SESSION_COOKIE, cookieOptions(0));
  return c.json({ ok: true as const }, 200);
}
