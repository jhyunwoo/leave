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
 * 접속 기록 미들웨어 — 모든 요청(프리플라이트 제외)의 메타데이터를 D1 access_logs에 저장한다.
 * 가장 바깥에서 실행되므로 next() 이후에는 인증 미들웨어가 설정한 c.var.user를 읽을 수 있다.
 * 수집 범위는 접속 시각·경로·상태·플랫폼 등으로 한정하며, 요청 본문이나 비밀번호는 담지 않는다.
 */
export const accessLogMiddleware = createMiddleware<AppEnv>(async (c, next) => {
  const startedAt = Date.now();
  await next();

  // CORS 프리플라이트는 실제 접속이 아니므로 기록하지 않는다.
  if (c.req.method === "OPTIONS") return;

  const durationMs = Date.now() - startedAt;
  const req = c.req;
  const user = c.get("user") as UserRow | undefined;

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
        userAgent: req.header("User-Agent") ?? null,
        ip: req.header("CF-Connecting-IP") ?? null,
        country: req.header("CF-IPCountry") ?? null,
        durationMs,
        createdAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error("access log 저장 실패", err);
    }
  });
});
