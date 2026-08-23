/**
 * 사용자(공개 프로필·검색·이름 설정) 라우트의 OpenAPI 명세.
 *
 * 사용처: apps/api/src/routes/users.ts.
 *
 * 미들웨어를 `app.use(경로, ...)`가 아니라 라우트별 `middleware`로 다는 이유는
 * 경로가 겹치기 때문이다. `/{username}`은 한 세그먼트라 `/search`·`/availability`와
 * 같은 모양이고, `app.use("/:username", ...)`은 그 둘까지 함께 잡는다. 그러면
 * 온보딩 관문이 이름 설정 화면(아직 온보딩 중이다)까지 막아 버린다.
 * 라우트에 직접 달면 무엇이 무엇에 걸리는지가 이 파일에서 그대로 읽힌다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import {
  usernameQuerySchema,
  usernameSchema,
  usernameSetSchema,
} from "@leave/shared";
import {
  errorResponse,
  jsonContent,
  userProfileSchema,
} from "../lib/responses";
import { onboardingMiddleware } from "../middleware/onboarding";
import { rateLimit } from "../middleware/rate-limit";

const TAGS = ["사용자"];

/**
 * 이름 설정은 온보딩 **중에** 일어난다 — 여기에 온보딩 관문을 걸면 아무도
 * 이름을 정할 수 없다. 대신 대량 시도를 막는 쓰기 제한만 건다.
 *
 * 상한이 10이 아니라 30인 것은, 이 카운터가 규칙 위반까지 함께 센다는 사정 때문이다.
 * 미들웨어는 본문 검증보다 먼저 돌아 "마침표를 잘못 찍었다"도 한 번으로 세는데,
 * 처음 이름을 정하는 사람은 몇 번씩 고쳐 넣는다. 10이면 정상 사용자가 먼저 막힌다.
 */
export const setUsernameRoute = createRoute({
  method: "put",
  path: "/me/username",
  tags: TAGS,
  summary: "내 공개 사용자 이름 설정·변경",
  description:
    "정규형(소문자·NFC)으로 저장합니다. 이름을 바꿔도 사용자 id는 그대로라 친구 관계와 휴가 소유권은 유지되며, 이전 이름의 프로필 주소는 더 이상 열리지 않습니다.",
  security: [{ Bearer: [] }],
  middleware: [
    rateLimit({ name: "username-set", limit: 30, windowSeconds: 600 }),
  ] as const,
  request: {
    body: {
      content: { "application/json": { schema: usernameSetSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ username: z.string() }), "설정된 사용자 이름"),
    400: errorResponse("사용자 이름 규칙 위반"),
    401: errorResponse("인증 실패"),
    409: errorResponse("이미 사용 중인 사용자 이름"),
    429: errorResponse("요청이 너무 잦음"),
  },
});

/**
 * 중복 확인. 답은 조언일 뿐이라 최종 판정이 아니다 — 확인과 저장 사이에 남이
 * 가져갈 수 있고, 진짜 판정은 유니크 인덱스가 내린다(lib/username.ts).
 */
export const usernameAvailabilityRoute = createRoute({
  method: "get",
  path: "/availability",
  tags: TAGS,
  summary: "사용자 이름 사용 가능 여부",
  security: [{ Bearer: [] }],
  middleware: [
    rateLimit({ name: "username-check", limit: 60, windowSeconds: 60 }),
  ] as const,
  request: { query: z.object({ username: usernameSchema }) },
  responses: {
    200: jsonContent(
      z.object({ username: z.string(), available: z.boolean() }),
      "정규형 이름과 사용 가능 여부",
    ),
    400: errorResponse("사용자 이름 규칙 위반"),
    401: errorResponse("인증 실패"),
    429: errorResponse("요청이 너무 잦음"),
  },
});

export const searchUsersRoute = createRoute({
  method: "get",
  path: "/search",
  tags: TAGS,
  summary: "사용자 이름으로 검색",
  description:
    "앞에 붙은 @는 무시합니다. 정확히 일치하는 이름이 먼저 오고 나머지는 접두어 일치입니다. 차단한/차단당한 사용자는 결과에 나오지 않습니다.",
  security: [{ Bearer: [] }],
  middleware: [
    onboardingMiddleware,
    rateLimit({ name: "user-search", limit: 60, windowSeconds: 60 }),
  ] as const,
  request: { query: z.object({ q: usernameQuerySchema }) },
  responses: {
    200: jsonContent(
      z.object({ results: z.array(userProfileSchema) }),
      "검색 결과 (최대 20건)",
    ),
    400: errorResponse("검색어 오류"),
    401: errorResponse("인증 실패"),
    428: errorResponse("온보딩 미완료"),
    429: errorResponse("요청이 너무 잦음"),
  },
});

export const userProfileRoute = createRoute({
  method: "get",
  path: "/{username}",
  tags: TAGS,
  summary: "공개 프로필 조회",
  description:
    "이메일·소속 그룹·군 종류·계급·복무 날짜는 담기지 않습니다. 차단 관계이거나 없는 이름이면 구분 없이 404입니다.",
  security: [{ Bearer: [] }],
  middleware: [
    onboardingMiddleware,
    rateLimit({ name: "user-profile", limit: 120, windowSeconds: 60 }),
  ] as const,
  request: { params: z.object({ username: z.string().min(1).max(200) }) },
  responses: {
    200: jsonContent(userProfileSchema, "공개 프로필"),
    401: errorResponse("인증 실패"),
    404: errorResponse("대상 없음"),
    428: errorResponse("온보딩 미완료"),
    429: errorResponse("요청이 너무 잦음"),
  },
});
