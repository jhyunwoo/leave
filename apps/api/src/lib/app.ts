/// <reference types="@cloudflare/workers-types" />
import { OpenAPIHono } from "@hono/zod-openapi";
import type { UserRow } from "../db/schema";

export type AppBindings = {
  DB: D1Database;
  // 성능 최적화용 캐시(부대 달력·검색 결과 등). 로컬 dev는 자동으로 로컬 KV를 사용.
  CACHE: KVNamespace;
  CORS_ORIGIN?: string;
  /** 이 버전 미만의 앱은 426으로 막는다. 비우면 차단하지 않는다. */
  MIN_APP_VERSION?: string;
  /** 스토어에 올라간 최신 앱 버전. 업데이트 안내 문구에만 쓴다. */
  LATEST_APP_VERSION?: string;
  /** 카운터별 rate limit 상한 덮어쓰기 JSON (예: `{"signup":10000}`). */
  RATE_LIMITS?: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: {
    /** authMiddleware가 설정. 보호된 라우트에서만 존재. */
    user: UserRow;
  };
};

/** 입력 검증 실패 시 첫 번째 오류 메시지를 400으로 반환하는 공통 훅. */
export function createApp() {
  return new OpenAPIHono<AppEnv>({
    defaultHook: (result, c) => {
      if (!result.success) {
        const issue = result.error.issues[0];
        return c.json(
          { error: issue?.message ?? "입력값이 올바르지 않습니다" },
          400,
        );
      }
    },
  });
}
