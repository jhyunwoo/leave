/**
 * 웹 앱의 단위 테스트 설정.
 *
 * `include`를 좁히는 이유: 기본값은 `e2e/*.spec.ts`(Playwright)까지 집어삼킨다.
 * 브라우저 e2e는 `pnpm test:e2e`가 따로 돌린다.
 */
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
  },
});
