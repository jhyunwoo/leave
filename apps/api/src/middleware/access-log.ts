/**
 * 접속 기록 미들웨어.
 *
 * 사용처: apps/api/src/index.ts 에서 가장 바깥에 건다.
 *
 * 기록은 응답을 보낸 뒤 waitUntil로 처리해 사용자 지연을 만들지 않는다.
 * 기록 자체가 실패해도 요청은 성공한다(로그 때문에 서비스가 멈추면 안 된다).
 */

import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { accessLogs, type UserRow } from "../db/schema";
import type { AppEnv } from "../lib/app";

/** 응답을 막지 않도록 백그라운드 작업으로 실행 (executionCtx가 없으면 그냥 흘려보냄). */
function runAfter(
  ctx: { waitUntil?: (p: Promise<unknown>) => void } | undefined,
  task: () => Promise<unknown>,
): void {
  try {
    if (ctx?.waitUntil) {
      ctx.waitUntil(task());
      return;
    }
  } catch {
    // executionCtx 접근 자체가 실패하는 환경(직접 호출 등)에서는 아래로 폴백
  }
  void task().catch(() => {});
}

/**
 * 접속 기록 미들웨어 — 요청(프리플라이트 제외)의 메타데이터를 D1 access_logs에 저장한다.
 * 가장 바깥에서 실행되므로 next() 이후에는 인증 미들웨어가 설정한 c.var.user를 읽을 수 있다.
 * 수집 범위는 접속 시각·경로·상태·명시적 앱 플랫폼/버전으로 한정한다.
 * IP·국가·User-Agent·요청 본문은 저장하지 않는다.
 *
 * **동의하지 않은 사용자의 요청은 기록하지 않는다.** 가입 시 동의가 필수이므로 보통은
 * 모두 동의 상태지만, 관리자 화면에서 동의를 내릴 수 있고 그때 수집도 함께 멈춰야 한다.
 * 동의 여부를 화면에서만 표시하고 수집은 계속했다면 그 토글은 거짓말이 된다.
 * 비로그인 요청은 사용자 식별자 없이(user_id = null) 남긴다 — 붙일 사람이 없는 기록이라
 * 개인정보가 아니고, 가입·로그인 경로의 오류율을 볼 유일한 수단이다.
 */
export const accessLogMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const startedAt = Date.now();
  await next();

  // CORS 프리플라이트는 실제 접속이 아니므로 기록하지 않는다.
  if (c.req.method === "OPTIONS") return;

  const durationMs = Date.now() - startedAt;
  const req = c.req;
  const user = c.get("user") as UserRow | undefined;

  // 동의를 내린 사용자의 요청은 아예 남기지 않는다(익명 요청은 위 주석 참고).
  if (user && !user.consentedAt) return;

  // executionCtx는 접근 자체가 예외를 던질 수 있어 방어적으로 읽는다.
  let executionCtx: { waitUntil?: (p: Promise<unknown>) => void } | undefined;
  try {
    executionCtx = c.executionCtx;
  } catch {
    executionCtx = undefined;
  }

  runAfter(executionCtx, async () => {
    try {
      const db = drizzle(c.env.DB);
      await db.insert(accessLogs).values({
        id: crypto.randomUUID(),
        userId: user?.id ?? null,
        method: req.method,
        path: req.path,
        status: c.res.status,
        platform: req.header("X-Client-Platform") ?? null,
        appVersion: req.header("X-Client-Version") ?? null,
        durationMs,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("access log 저장 실패", err);
    }
  });
});
