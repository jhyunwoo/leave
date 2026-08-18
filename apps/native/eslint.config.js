// https://docs.expo.dev/guides/using-eslint/
//
// 네이티브 앱은 Expo가 주는 규칙 묶음을 쓴다(React Native 전용 규칙과 Metro
// 해석 규칙이 들어 있다). 나머지 패키지는 워크스페이스 루트의 eslint.config.mjs.
//
// 여기에 더하는 것은 의존 방향 하나뿐이다 — 루트 설정이 다른 패키지에 거는 것과
// 같은 규칙을 네이티브에도 건다. 배경은 docs/architecture.md.
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", ".expo/*"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@leave/web",
              message:
                "웹과 네이티브는 화면을 공유하지 않는다. 공유할 것은 @leave/shared/@leave/client로 내린다.",
            },
            {
              name: "@leave/admin",
              message: "관리자 앱은 사용자 앱과 별개 배포물이다.",
            },
          ],
          patterns: [
            {
              group: ["react-dom", "react-dom/*"],
              message:
                "네이티브 번들에는 react-dom이 들어가지 않는다. react-native의 대응물을 쓴다.",
            },
          ],
        },
      ],
    },
  },
]);
