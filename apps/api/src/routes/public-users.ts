/**
 * 로그인 없이 읽는 최소 공개 프로필.
 *
 * 마운트 위치: `/public/users` (apps/api/src/index.ts). 인증된 사회 기능 라우터인
 * `/users`와 분리해, 익명 요청이 내부 id나 관계 상태를 얻지 못하게 한다.
 */

import { normalizeUsername, SOCIAL_ERROR_CODES } from "@leave/shared";
import { and, eq, isNotNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { users } from "../db/schema";
import { createApp } from "../lib/app";
import { codedError } from "../lib/responses";
import { publicUserProfileRoute } from "./public-users.contract";

const app = createApp();
// 성공·실패·rate-limit 응답 모두 공유 브라우저나 중간 캐시에 남기지 않는다.
// 사용자 이름은 바뀔 수 있어 이전 주소의 404/200을 재사용하면 엉뚱한 프로필을
// 보여줄 수 있다.
app.use("*", (c, next) => {
  c.header("Cache-Control", "no-store");
  return next();
});

export const publicUserRoutes = app.openapi(
  publicUserProfileRoute,
  async (c) => {
    // 주소창 입력도 저장 형식과 같은 소문자·NFC 정규형으로 조회한다.
    const username = normalizeUsername(c.req.valid("param").username);
    const row = username
      ? await drizzle(c.env.DB)
          .select({ name: users.name, username: users.username })
          .from(users)
          .where(
            and(
              eq(users.username, username),
              isNotNull(users.username),
              isNotNull(users.onboardingCompletedAt),
            ),
          )
          .get()
      : undefined;

    if (!row?.username) {
      return c.json(
        codedError(
          "사용자를 찾을 수 없습니다",
          SOCIAL_ERROR_CODES.userUnavailable,
        ),
        404,
      );
    }

    return c.json({ name: row.name, username: row.username }, 200);
  },
);
