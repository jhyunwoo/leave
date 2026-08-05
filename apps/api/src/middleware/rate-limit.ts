/// <reference types="@cloudflare/workers-types" />
import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../lib/app";
import { sha256Hex } from "../lib/crypto";

/**
 * KV 고정 창(fixed window) rate limit.
 *
 * 키는 **해시된** 식별자다. 접속 IP는 카운터 키를 만드는 데만 쓰고 원문을 저장하지
 * 않는다 — access_logs에서 IP를 물리적으로 제거한 결정과 어긋나지 않는다.
 * 카운터 자체도 창이 끝나면 TTL로 사라진다.
 *
 * KV는 최종 일관성이라 동시 요청이 같은 창에서 몇 건 새어나갈 수 있다. 이 미들웨어의
 * 목적은 정밀한 과금 제어가 아니라 무차별 대입과 대량 수집의 비용을 올리는 것이다.
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
): Promise<string | null> {
  const user = c.get("user") as { id?: string } | undefined;
  const identity = user?.id ?? c.req.header("CF-Connecting-IP");
  if (!identity) return null;
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  return `rl:${name}:${await sha256Hex(identity)}:${window}`;
}

export function rateLimit(options: RateLimitOptions) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const key = await bucketKey(c, options.name, options.windowSeconds);
    if (key === null) return next();
    const limit = resolveLimit(c.env, options);
    let used = 0;
    try {
      used = Number((await c.env.CACHE.get(key)) ?? "0");
    } catch (err) {
      // KV 장애로 서비스를 막지는 않는다. 제한이 없는 편이 전면 차단보다 낫다.
      console.error("rate limit 조회 실패", err);
      return next();
    }

    if (used >= limit) {
      c.header("Retry-After", String(options.windowSeconds));
      return c.json(
        { error: "요청이 너무 잦습니다. 잠시 후 다시 시도해주세요" },
        429,
      );
    }

    try {
      await c.env.CACHE.put(key, String(used + 1), {
        // 창이 끝나면 카운터가 스스로 사라진다.
        expirationTtl: Math.max(60, options.windowSeconds),
      });
    } catch (err) {
      console.error("rate limit 저장 실패", err);
    }
    return next();
  });
}
