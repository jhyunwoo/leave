/** 관리자 e2e 테스트 설정. 실행: `pnpm --filter @leave/admin test:e2e`. */

import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "/tmp/leave-admin-playwright-results",
  timeout: 45_000,
  fullyParallel: false,
  reporter: "line",
  use: {
    baseURL: "http://[::1]:5174",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "node scripts/test-server.mjs",
    url: "http://[::1]:5174/api/health",
    timeout: 60_000,
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1024 },
      },
    },
  ],
});
