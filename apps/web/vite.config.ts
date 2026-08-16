/** 웹 앱 빌드 설정(Vite + React). 배포는 Cloudflare Workers(wrangler.jsonc). */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  build: {
    rolldownOptions: {
      output: {
        // 화면 코드는 App.tsx의 `lazy()`가 쪼개고, 여기서는 node_modules를
        // 갈라 둔다. 노림수는 캐시다: 화면 코드는 배포마다 바뀌지만 react는
        // 거의 그대로라, 한 덩어리로 묶어 두면 배포할 때마다 재다운로드된다.
        codeSplitting: {
          groups: [
            // react/react-dom/scheduler. 가장 크고 가장 안 바뀐다.
            {
              name: "react",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            // 나머지 의존성(react-router, react-query, jotai, hono ...).
            { name: "vendor", test: /node_modules/, priority: 10 },
          ],
        },
      },
    },
  },
});
