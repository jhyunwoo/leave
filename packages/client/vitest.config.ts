import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // 훅 테스트(renderHook)는 DOM이 필요하다. 순수 함수 테스트에는 영향이 없다.
    environment: "jsdom",
  },
});
