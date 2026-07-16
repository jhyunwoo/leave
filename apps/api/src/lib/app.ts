/// <reference types="@cloudflare/workers-types" />
import { OpenAPIHono } from "@hono/zod-openapi";
import type { UserRow } from "../db/schema";

export type AppBindings = {
  DB: D1Database;
  BUCKET: R2Bucket;
  CORS_ORIGIN?: string;
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
