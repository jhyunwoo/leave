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
  // 세션 행에서 실제로 쓰는 값은 만료 시각 하나다. 나머지 컬럼(토큰 해시·생성 시각)은
  // 모든 인증 요청마다 읽을 이유가 없다. 사용자 행은 c.var.user로 그대로 쓰이므로 전부 읽는다.
  const row = await db
    .select({ expiresAt: sessions.expiresAt, user: users })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.tokenHash, tokenHash))
    .get();

  // 만료 판정을 SQL로 내리지 않는 이유: 없는 세션과 만료된 세션에 다른 안내를 줘야 한다.
  if (!row || row.expiresAt <= new Date().toISOString()) {
    return c.json({ error: "세션이 만료되었습니다. 다시 로그인해주세요" }, 401);
  }

  c.set("user", row.user);
  await next();
});
