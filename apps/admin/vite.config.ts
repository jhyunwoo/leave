/** 관리자 앱 빌드 설정. Cloudflare 플러그인이 worker/와 SPA를 한 워커로 묶는다. */

import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
});
