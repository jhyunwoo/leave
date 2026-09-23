/** 웹 e2e 테스트 설정. 실행: `pnpm --filter @leave/web test:e2e`. */

import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

const reuseTestServers =
  loadEnv("test", false, "LEAVE_E2E_").LEAVE_E2E_REUSE_SERVERS === "1";

/**
 * 웹 e2e 설정.
 *
 * 실행 전 준비:
 *   1) `pnpm add -D @playwright/test` 후 `npx playwright install chromium`
 *   2) API가 로컬에 필요 — 아래 webServer가 자동 기동하지만, 최초 1회
 *      `pnpm --filter @leave/api db:migrate:local`로 로컬 D1 마이그레이션이 필요하다.
 *
 * 실행: `pnpm --filter @leave/web test:e2e`
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // 실제 메일을 보내는 개발 API를 실수로 재사용하지 않는다. 테스트 서버만 명시적으로 재사용한다.
  webServer: [
    {
      command: "node e2e/mail-server.mjs",
      url: "http://127.0.0.1:8790/",
      reuseExistingServer: reuseTestServers,
    },
    {
      command:
        'pnpm --filter @leave/api exec wrangler dev --port 8787 --var RESEND_API_KEY:test-resend-key --var EMAIL_CODE_SECRET:test-email-code-secret --var RESEND_API_URL:http://127.0.0.1:8790 --var CORS_ORIGIN:http://localhost:5173 --var \'RATE_LIMITS:{"signup":100000,"login":100000}\'',
      url: "http://localhost:8787/",
      reuseExistingServer: reuseTestServers,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @leave/web dev",
      url: "http://localhost:5173/",
      reuseExistingServer: reuseTestServers,
      timeout: 60_000,
    },
  ],
});
