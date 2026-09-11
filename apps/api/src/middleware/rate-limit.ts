/// <reference types="@cloudflare/workers-types" />
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { rateLimitCounters } from "../db/schema";
import type { AppEnv } from "../lib/app";
import { sha256Hex } from "../lib/crypto";

/**
 * D1 고정 창(fixed window) rate limit.
 *
 * 키는 **해시된** 식별자다. 접속 IP는 카운터 키를 만드는 데만 쓰고 원문을 저장하지
 * 않는다 — access_logs에서 IP를 물리적으로 제거한 결정과 어긋나지 않는다.
 *
 * ## KV가 아닌 이유
 *
 * 예전에는 KV에 "읽고 더해 쓰기"였다. KV에는 원자적 증가가 없어 **같이 도착한 요청이
 * 모두 같은 값을 읽고 같은 값을 써서 카운터가 한 번만 올라갔다.** 병렬로 두드리면
 * 상한이 사실상 무력해지는 것이고, 6자 초대코드의 안전이 `3회/15분`에 기대고 있어서
 * (`routes/units.ts`) 그 자리에서는 정밀도 문제가 아니라 실제 보안 구멍이었다.
 *
 * D1의 `INSERT ... ON CONFLICT DO UPDATE SET count = count + 1 RETURNING`은 한 문장이라
 * 원자적이고, 돌려받은 값이 곧 이 요청의 순번이다. 창 번호가 키에 들어 있어 지난 창의
 * 행은 다시 읽히지 않으므로 읽을 때 만료를 볼 필요가 없고, 정리는 보관 기간 cron이
 * 맡는다(`lib/retention.ts`).
 *
 * 한 요청에 D1 쓰기 하나가 늘지만, 이 미들웨어가 붙은 경로는 이미 D1을 두드린다.
 */
export interface RateLimitOptions {
  /** 카운터 이름. 경로마다 다른 이름을 줘야 서로 소진시키지 않는다. */
  name: string;
  limit: number;
  windowSeconds: number;
}

/**
 * `RATE_LIMITS` 환경변수로 카운터별 상한을 덮어쓴다 (예: `{"signup":10000}`).
 *
 * 통합 테스트는 한 IP에서 수백 번 가입하므로 IP 버킷을 쓰는 signup/login은
 * 실제 값으로 두면 스위트 중간부터 전부 막힌다. 인증 뒤 라우트는 사용자별
 * 버킷이라 이 덮어쓰기가 필요 없다.
 */
function resolveLimit(env: AppEnv["Bindings"], options: RateLimitOptions) {
  if (!env.RATE_LIMITS) return options.limit;
  try {
    const parsed: unknown = JSON.parse(env.RATE_LIMITS);
    const value =
      parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)[options.name]
        : undefined;
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : options.limit;
  } catch {
    console.error("RATE_LIMITS 파싱 실패 — 기본 상한을 사용합니다");
    return options.limit;
  }
}

/**
 * 로그인한 사용자는 계정 단위로, 아니면 접속 IP 단위로 센다.
 *
 * 둘 다 없으면 `null`을 돌려주고 제한하지 않는다. 식별할 수 없는 요청을 하나의
 * 공용 버킷에 몰아넣으면 한 명이 모든 사용자의 로그인·가입을 막을 수 있어,
 * 제한이 아니라 DoS 수단이 된다. 프로덕션 Worker는 Cloudflare 뒤에 있어
 * CF-Connecting-IP가 항상 채워지고, 이 분기는 로컬·테스트에서만 걸린다.
 */
async function bucketKey(
  c: Parameters<Parameters<typeof createMiddleware<AppEnv>>[0]>[0],
  name: string,
  windowSeconds: number,
): Promise<{ key: string; expiresAt: string } | null> {
  const user = c.get("user") as { id?: string } | undefined;
  const identity = user?.id ?? c.req.header("CF-Connecting-IP");
  if (!identity) return null;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  return {
    key: `rl:${name}:${await sha256Hex(identity)}:${window}`,
    // 이 창이 끝나는 시각. 판정에는 쓰지 않고 정리 대상을 고르는 데만 쓴다.
    expiresAt: new Date((window + 1) * windowSeconds * 1000).toISOString(),
  };
}

export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const bucket = await bucketKey(c, options.name, options.windowSeconds);
    if (bucket === null) return next();
    const limit = resolveLimit(c.env, options);

    let used: number;
    try {
      // 한 문장으로 더하고 그 결과를 돌려받는다. 이 값이 이 요청의 순번이므로
      // 동시에 도착한 요청들이 서로의 증가를 덮어쓸 수 없다.
      const [row] = await drizzle(c.env.DB)
        .insert(rateLimitCounters)
        .values({ key: bucket.key, count: 1, expiresAt: bucket.expiresAt })
        .onConflictDoUpdate({
          target: rateLimitCounters.key,
          set: { count: sql`${rateLimitCounters.count} + 1` },
        })
        .returning({ count: rateLimitCounters.count });
      used = row?.count ?? 1;
    } catch (err) {
      // 저장소 장애로 서비스를 막지는 않는다. 제한이 없는 편이 전면 차단보다 낫다.
      console.error("rate limit 집계 실패", err);
      return next();
    }

    if (used > limit) {
      c.header("Retry-After", String(options.windowSeconds));
      return c.json(
        { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요" },
        429,
      );
    }
    return next();
  });
}
