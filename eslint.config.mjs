/**
 * 워크스페이스 공용 ESLint 설정 (Flat Config).
 *
 * 적용 대상: apps/api, apps/web, apps/admin, packages/shared, packages/client.
 * apps/native는 Expo가 주는 규칙 묶음이 따로 있어 apps/native/eslint.config.js를 쓴다
 * (여기서는 무시 목록에 넣는다).
 *
 * 고르는 기준은 "형식"이 아니라 "정확성"이다.
 *  - 서식은 Prettier가 전담한다. 서식 규칙은 여기에 넣지 않는다.
 *  - 타입 정보를 쓰는 규칙(no-floating-promises 등)만 값이 있으므로 projectService를 켠다.
 *  - 규칙이 잡아내는 것이 실제 버그가 아니면(프레임워크 타이핑 한계 등) 끄고 이유를 적는다.
 *
 * 의존 방향은 no-restricted-imports로 강제한다. 자세한 배경은 docs/architecture.md.
 */

import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

/** 앱 패키지 — shared/client가 이쪽으로 의존하면 방향이 뒤집힌다. */
const APP_PACKAGES = ["@leave/web", "@leave/native", "@leave/admin"];

/**
 * 의존 방향 규칙 하나를 만든다.
 * @param {{ paths?: Array<{name: string, message: string, allowTypeImports?: boolean}>, patterns?: Array<{group: string[], message: string}> }} options
 */
function restrictImports(options) {
  return {
    "@typescript-eslint/no-restricted-imports": ["error", options],
  };
}

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.wrangler/**",
      "**/.turbo/**",
      "**/.expo/**",
      // Wrangler가 생성하는 파일. 손으로 고치지 않으므로 검사하지 않는다.
      "**/worker-configuration.d.ts",
      "**/worker-env.d.ts",
      // Expo 전용 규칙 묶음을 쓴다 (apps/native/eslint.config.js).
      "apps/native/**",
      // 스토어 자산 생성 스크립트 — 워크스페이스 패키지가 아니다.
      "store/**",
      "design/**",
    ],
  },

  // ── 타입 정보를 쓰는 TypeScript 검사 ────────────────────────────────
  {
    files: ["apps/*/**/*.{ts,tsx}", "packages/*/**/*.{ts,tsx}"],
    // stylisticTypeChecked는 넣지 않는다. 서식·취향 규칙이 섞이면 진짜 신호가 묻히고,
    // 서식은 Prettier가 이미 전담한다.
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // ── 실수로 안 기다린 Promise가 가장 흔한 사고다 (D1 write, 캐시 무효화, 푸시).
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",
      // try/finally 안에서 await를 빠뜨리면 catch가 실제 오류를 못 잡는다.
      // 그 밖의 `return promise`는 동작이 같으므로 강제하지 않는다.
      "@typescript-eslint/return-await": [
        "error",
        "error-handling-correctness-only",
      ],

      // ── switch 누락은 재원 종류·휴가 상태가 늘어날 때마다 조용히 틀린다.
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: true },
      ],

      // ── 죽은 코드 / 안 쓰는 것.
      "no-unreachable": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // ── 타입 경계.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
    },
  },

  // ── React 훅 규칙 (웹·관리자 화면) ───────────────────────────────────
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/admin/src/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: {
      globals: globals.browser,
    },
  },

  // ── 의존 방향: @leave/shared는 아무것도 위로 의존하지 않는다 ──────────
  {
    files: ["packages/shared/**/*.ts"],
    rules: restrictImports({
      paths: [
        ...["@leave/api", "@leave/client", ...APP_PACKAGES].map((name) => ({
          name,
          message:
            "@leave/shared는 도메인 커널이다. 앱/클라이언트 패키지에 의존하면 방향이 뒤집힌다.",
        })),
      ],
      patterns: [
        {
          group: [
            "react",
            "react-*",
            "expo",
            "expo-*",
            "hono",
            "hono/*",
            "drizzle-orm",
            "drizzle-orm/*",
            "@cloudflare/*",
          ],
          message:
            "@leave/shared는 플랫폼 독립적인 순수 함수만 담는다. 프레임워크/런타임 의존은 앱 쪽에 둔다.",
        },
      ],
    }),
  },

  // ── 의존 방향: @leave/client는 웹/네이티브 구현을 모른다 ──────────────
  {
    files: ["packages/client/**/*.ts"],
    rules: restrictImports({
      paths: [
        ...APP_PACKAGES.map((name) => ({
          name,
          message:
            "@leave/client는 웹/네이티브 공용 계층이다. 특정 앱 구현에 의존하면 공용이 아니게 된다.",
        })),
        {
          name: "@leave/api",
          // Hono RPC는 서버 라우트 타입(AppType)을 그대로 가져와야 성립한다.
          // 값을 가져오면 서버 코드가 클라이언트 번들에 딸려 들어간다.
          allowTypeImports: true,
          message:
            "@leave/api에서는 타입만 가져온다 (Hono RPC의 AppType). 값 import는 서버 코드를 번들에 끌어온다.",
        },
      ],
      patterns: [
        {
          group: [
            "react-native",
            "react-native/*",
            "react-dom",
            "expo-*",
            "drizzle-orm",
            "drizzle-orm/*",
          ],
          message:
            "@leave/client는 플랫폼 API를 직접 부르지 않는다. 차이는 LeaveApiAdapter로 주입받는다.",
        },
      ],
    }),
  },

  // src는 Node API를 쓰지 않는다 (번들이 웹·네이티브 양쪽에 들어간다).
  // test는 설치 레이아웃 검사 때문에 node:fs가 필요해 예외다.
  {
    files: ["packages/client/src/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message:
                "@leave/client는 웹·네이티브 번들에 함께 들어간다. Node 전용 모듈을 쓸 수 없다.",
            },
          ],
        },
      ],
    },
  },

  // ── 의존 방향: API 워커는 클라이언트/화면 패키지를 모른다 ─────────────
  {
    files: ["apps/api/**/*.ts"],
    rules: restrictImports({
      paths: [
        ...["@leave/client", ...APP_PACKAGES].map((name) => ({
          name,
          message:
            "API 워커는 클라이언트/화면 패키지에 의존하지 않는다. 공용 규칙은 @leave/shared에 둔다.",
        })),
      ],
      patterns: [
        {
          group: ["react", "react-*"],
          message: "API 워커에 React를 가져올 일은 없다.",
        },
      ],
    }),
  },

  // ── 의존 방향: 관리자 앱은 사용자 앱 구현을 모른다 ────────────────────
  {
    files: ["apps/admin/**/*.{ts,tsx}"],
    rules: restrictImports({
      paths: [
        ...["@leave/client", "@leave/web", "@leave/native"].map((name) => ({
          name,
          message:
            "관리자 앱은 사용자 앱/클라이언트 계층과 별개다. 공용 규칙은 @leave/shared, 서버 공용 경계는 @leave/api/server를 쓴다.",
        })),
      ],
    }),
  },

  // ── 의존 방향: 웹은 네이티브/관리자 구현을 모른다 ─────────────────────
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: restrictImports({
      paths: [
        ...["@leave/native", "@leave/admin"].map((name) => ({
          name,
          message:
            "웹과 네이티브는 화면을 공유하지 않는다. 공유할 것은 @leave/shared/@leave/client로 내린다.",
        })),
      ],
      patterns: [
        {
          group: ["react-native", "react-native/*", "expo-*"],
          message: "웹 번들에 네이티브 모듈을 가져올 수 없다.",
        },
      ],
    }),
  },

  // ── 관리자 워커: 서버 코드지만 브라우저 전역이 없다 ───────────────────
  {
    files: ["apps/admin/worker/**/*.ts"],
    languageOptions: {
      globals: globals.worker,
    },
  },

  // ── 테스트: 통합 테스트는 실제 응답을 그대로 다루므로 타입 단정이 잦다 ──
  {
    files: [
      "packages/*/test/**/*.ts",
      "apps/*/e2e/**/*.ts",
      "apps/api/test/**/*.mjs",
    ],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
      "@typescript-eslint/no-unsafe-call": "off",
    },
  },

  // ── 빌드/운영 스크립트 (.mjs): Node에서 돌고 타입 정보가 없다 ─────────
  // 타입 기반 규칙은 위 블록의 files(.ts/.tsx)에 걸리지 않으므로 애초에 적용되지 않는다.
  {
    files: ["**/*.mjs", "**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { ...globals.node, ...globals.es2022 },
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
);
