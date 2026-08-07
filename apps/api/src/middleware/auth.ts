/**
 * 세션 인증 미들웨어.
 *
 * 사용처: 인증이 필요한 모든 라우터가 `app.use("*", authMiddleware)`로 건다.
 *
 * 토큰 원문은 저장하지 않고 SHA-256 해시로만 조회한다. DB가 새더라도 그 값으로
 * 남의 세션을 흉내 낼 수 없다. 통과하면 `c.var.user`에 사용자 행이 들어간다.
 */

import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { sessions, users } from "../db/schema";
import type { AppEnv } from "../lib/app";
import { sha256Hex } from "../lib/crypto";

/** Authorization: Bearer <token> 세션 검증. 성공 시 c.var.user 설정. */
export const authMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return c.json({ error: "로그인이 필요합니다" }, 401);
  }

  const db = drizzle(c.env.DB);
  const tokenHash = await sha256Hex(token);
  const row = await db
    .select()
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .get();

  if (!row || row.sessions.expiresAt <= new Date().toISOString()) {
    return c.json({ error: "세션이 만료되었습니다. 다시 로그인해주세요" }, 401);
  }

  c.set("user", row.users);
  await next();
});
