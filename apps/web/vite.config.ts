/** 웹 앱 빌드 설정(Vite + React). 배포는 Cloudflare Workers(wrangler.jsonc). */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
