/** 웹 앱 빌드 설정(Vite + React). 배포는 Cloudflare Workers(wrangler.jsonc). */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
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
