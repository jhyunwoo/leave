import { defineConfig, devices } from "@playwright/test";

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
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  // API(8787)와 웹(5173)을 함께 기동. 이미 떠 있으면 재사용.
  webServer: [
    {
      command:
        "pnpm --filter @leave/api exec wrangler dev --port 8787 --var CORS_ORIGIN:http://localhost:5173",
      url: "http://localhost:8787/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "pnpm --filter @leave/web dev",
      url: "http://localhost:5173/",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
