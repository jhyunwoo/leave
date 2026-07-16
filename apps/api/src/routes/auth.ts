import { createRoute, z } from "@hono/zod-openapi";
import { loginSchema, signupSchema } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import { sessions, units, users, type UserRow } from "../db/schema";
import { createApp } from "../lib/app";
import {
  generateSessionToken,
  hashPassword,
  sha256Hex,
  verifyPassword,
} from "../lib/crypto";
import {
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

const app = createApp();
app.use("/logout", authMiddleware);
app.use("/me", authMiddleware);

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
  });
