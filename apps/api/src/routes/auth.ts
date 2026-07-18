import { createRoute, z } from "@hono/zod-openapi";
import { loginSchema, signupSchema } from "@leave/shared";
import { desc, eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import {
  accessLogs,
  leaves,
  notifications,
  pushLogs,
  sessions,
  units,
  users,
  type UserRow,
} from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import {
  generateSessionToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "../lib/crypto";
import {
  activitySchema,
  authResponseSchema,
  errorResponse,
  jsonContent,
  okSchema,
  unitSchema,
  userSchema,
} from "../lib/responses";
import { serializeUnit, serializeUser } from "../lib/serialize";
import { authMiddleware } from "../middleware/auth";

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

async function createSession(
  db: DrizzleD1Database,
  userId: string,
): Promise<string> {
  const token = generateSessionToken();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await sha256Hex(token),
    expiresAt: new Date(Date.now() + SESSION_TTL_MS).toISOString(),
    createdAt: new Date().toISOString(),
  });
  return token;
}

const signupRoute = createRoute({
  method: "post",
  path: "/signup",
  tags: ["인증"],
  summary: "회원가입",
  request: {
    body: {
      content: { "application/json": { schema: signupSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(authResponseSchema, "가입 성공 (세션 토큰 포함)"),
    400: errorResponse("입력값 오류"),
    409: errorResponse("이미 가입된 이메일"),
  },
});

const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["인증"],
  summary: "로그인",
  request: {
    body: {
      content: { "application/json": { schema: loginSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(authResponseSchema, "로그인 성공"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("이메일 또는 비밀번호 불일치"),
  },
});

const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["인증"],
  summary: "로그아웃",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "로그아웃 완료"),
    401: errorResponse("인증 실패"),
  },
});

const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["인증"],
  summary: "내 정보 (계산된 현재 계급, 소속 부대 포함)",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ user: userSchema, unit: unitSchema.nullable() }),
      "내 정보",
    ),
    401: errorResponse("인증 실패"),
  },
});

const activityRoute = createRoute({
  method: "get",
  path: "/activity",
  tags: ["인증"],
  summary: "내 접속·푸시 기록 열람 (개인정보 열람권)",
  description:
    "동의 하에 수집된 내 접속 기록과 푸시 발송·수신 로그를 최근 순으로 최대 50건씩 돌려줍니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(activitySchema, "내 기록"),
    401: errorResponse("인증 실패"),
  },
});

const deleteAccountRoute = createRoute({
  method: "delete",
  path: "/account",
  tags: ["인증"],
  summary: "계정 삭제 (관련 데이터 전체 삭제)",
  description:
    "내 계정과 등록한 휴가·알림·세션·접속/푸시 기록·프로필 이미지를 모두 삭제합니다. 되돌릴 수 없습니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
  },
});

const app = createApp();
app.use("/logout", authMiddleware);
app.use("/me", authMiddleware);
app.use("/activity", authMiddleware);
app.use("/account", authMiddleware);

export const authRoutes = app
  .openapi(signupRoute, async (c) => {
    const input = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, input.email))
      .get();
    if (existing) {
      return c.json({ error: "이미 가입된 이메일입니다" }, 409);
    }

    const { hash, salt } = await hashPassword(input.password);
    const user: UserRow = {
      id: crypto.randomUUID(),
      email: input.email,
      passwordHash: hash,
      passwordSalt: salt,
      name: input.name,
      branch: input.branch,
      enlistedAt: input.enlistedAt,
      dischargeAt: input.dischargeAt,
      signupRank: input.rank,
      profileImageKey: null,
      unitId: null,
      expoPushToken: null,
      // 가입 시 개인정보 수집·이용에 동의했음을 기록 (동의는 스키마에서 필수)
      consentedAt: input.dataConsent ? new Date().toISOString() : null,
      createdAt: new Date().toISOString(),
    };
    await db.insert(users).values(user);
    const token = await createSession(db, user.id);
    return c.json({ token, user: serializeUser(user) }, 201);
  })
  .openapi(loginRoute, async (c) => {
    const input = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, input.email))
      .get();
    if (
      !user ||
      !(await verifyPassword(input.password, user.passwordSalt, user.passwordHash))
    ) {
      return c.json({ error: "이메일 또는 비밀번호가 올바르지 않습니다" }, 401);
    }

    const token = await createSession(db, user.id);
    return c.json({ token, user: serializeUser(user) }, 200);
  })
  .openapi(logoutRoute, async (c) => {
    const header = c.req.header("Authorization");
    const token = header?.startsWith("Bearer ") ? header.slice(7) : "";
    const db = drizzle(c.env.DB);
    await db
      .delete(sessions)
      .where(eq(sessions.tokenHash, await sha256Hex(token)));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(meRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    let unit = null;
    if (user.unitId) {
      const row = await db
        .select()
        .from(units)
        .where(eq(units.id, user.unitId))
        .get();
      if (row) {
        const memberCount = await db.$count(users, eq(users.unitId, row.id));
        unit = serializeUnit(row, memberCount);
      }
    }
    return c.json({ user: serializeUser(user), unit }, 200);
  })
  .openapi(activityRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const [access, push] = await Promise.all([
      db
        .select()
        .from(accessLogs)
        .where(eq(accessLogs.userId, user.id))
        .orderBy(desc(accessLogs.createdAt))
        .limit(50)
        .all(),
      db
        .select()
        .from(pushLogs)
        .where(eq(pushLogs.userId, user.id))
        .orderBy(desc(pushLogs.createdAt))
        .limit(50)
        .all(),
    ]);
    return c.json(
      {
        accessLogs: access.map((r) => ({
          id: r.id,
          method: r.method,
          path: r.path,
          status: r.status,
          platform: r.platform,
          appVersion: r.appVersion,
          ip: r.ip,
          country: r.country,
          durationMs: r.durationMs,
          createdAt: r.createdAt,
        })),
        pushLogs: push.map((r) => ({
          id: r.id,
          notificationId: r.notificationId,
          direction: r.direction,
          title: r.title,
          body: r.body,
          status: r.status,
          createdAt: r.createdAt,
        })),
      },
      200,
    );
  })
  .openapi(deleteAccountRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    // R2에 저장된 프로필 이미지 삭제
    if (user.profileImageKey) {
      await c.env.BUCKET.delete(user.profileImageKey).catch(() => {});
    }

    // 관련 데이터를 명시적으로 모두 삭제한다.
    // (Cloudflare D1은 외래키 ON DELETE CASCADE 적용을 보장하지 않으므로 직접 지운다.)
    await db.delete(leaves).where(eq(leaves.userId, user.id));
    await db.delete(notifications).where(eq(notifications.userId, user.id));
    await db.delete(sessions).where(eq(sessions.userId, user.id));
    await db.delete(accessLogs).where(eq(accessLogs.userId, user.id));
    await db.delete(pushLogs).where(eq(pushLogs.userId, user.id));
    await db.delete(users).where(eq(users.id, user.id));

    // 부대원 수 변동 → 해당 부대 달력 통계 캐시 무효화
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);

    return c.json({ ok: true as const }, 200);
  });
