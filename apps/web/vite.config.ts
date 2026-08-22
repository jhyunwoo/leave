/** 웹 앱 빌드 설정(Vite + React). 배포는 Cloudflare Workers(wrangler.jsonc). */

import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/**
 * 접속 기록의 `X-Client-Version`에 실릴 값. 이게 없으면 운영 로그가 전부 "dev"로
 * 남아 어느 배포에서 온 요청인지 구분할 수 없다.
 *
 * `.env.production`에 적지 않고 빌드 시점 커밋 해시를 읽는 이유: 사람이 손으로
 * 올려야 하는 값은 결국 안 올라간다. git을 못 부르는 환경(소스 아카이브만 있는
 * 빌더 등)에서는 "dev"로 물러난다.
 */
function resolveAppVersion(): string {
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(resolveAppVersion()),
  },
  build: {
    rolldownOptions: {
      output: {
        // 화면 코드는 App.tsx의 `lazy()`가 쪼갠다. node_modules 전체를 한
        // vendor로 묶으면 지연 화면에서만 쓰는 zod까지 첫 화면에 따라오므로,
        // 앱보다 훨씬 덜 바뀌는 React 런타임만 장기 캐시 경계로 남긴다.
        codeSplitting: {
          groups: [
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
          ],
        },
      },
    },
  },
});
