/**
 * 세션 토큰 발급.
 *
 * 사용처: 가입·로그인·비밀번호 변경 (routes/auth.ts).
 *
 * 토큰 원문은 저장하지 않는다 — DB에는 SHA-256 해시만 남기고 원문은 응답으로만
 * 나간다. DB가 통째로 새더라도 그 내용으로 남의 세션을 흉내 낼 수 없다.
 * 검증하는 쪽은 middleware/auth.ts.
 */

import { sessions } from "../db/schema";
import { generateSessionToken, sha256Hex } from "./crypto";
import type { Db } from "./db";

/** 세션 유효 기간. 이 기간이 지나면 미들웨어가 401로 끊는다. */
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 새 세션을 만들고 클라이언트가 보관할 토큰 원문을 돌려준다. */
export async function createSession(db: Db, userId: string): Promise<string> {
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
