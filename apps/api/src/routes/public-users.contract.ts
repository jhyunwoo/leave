/**
 * 로그인 없이 읽는 공개 프로필 라우트의 OpenAPI 명세.
 *
 * 인증된 `/users/{username}`은 관계 상태와 내부 사용자 id가 필요하지만, 웹의
 * 공개 프로필에는 그 둘이 필요 없다. 두 계약을 분리해 익명 응답에 새 필드가
 * 우연히 따라 나가지 않게 한다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { errorResponse, jsonContent } from "../lib/responses";
import { rateLimit } from "../middleware/rate-limit";

const publicUserProfileSchema = z
  .object({
    name: z.string(),
    username: z.string(),
  })
  .openapi("PublicUserProfile");

export const publicUserProfileRoute = createRoute({
  method: "get",
  path: "/{username}",
  tags: ["사용자"],
  summary: "로그인 없는 공개 프로필 조회",
  description:
    "웹 프로필에 필요한 별칭과 사용자 이름만 반환합니다. 내부 사용자 id, 관계, 이메일, 소속·복무 정보는 포함하지 않습니다.",
  // 이 라우터에는 인증 미들웨어가 없으므로 공통 제한기가 접속 IP로만 센다.
  middleware: [
    rateLimit({
      name: "public-user-profile",
      limit: 60,
      windowSeconds: 60,
    }),
  ] as const,
  request: {
    params: z.object({ username: z.string().min(1).max(200) }),
  },
  responses: {
    200: jsonContent(publicUserProfileSchema, "익명 공개 프로필"),
    404: errorResponse("대상 없음"),
    429: errorResponse("요청이 너무 잦음"),
  },
});
