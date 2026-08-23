/**
 * 사용자 라우트 — 공개 이름 설정, 중복 확인, 검색, 공개 프로필.
 *
 * 마운트 위치: `/users` (apps/api/src/index.ts). 명세는 ./users.contract.ts.
 *
 * 이 라우터의 응답은 전부 "남에 대한 것"이라 담는 필드를 의도적으로 줄였다.
 * 이메일·소속 그룹·군 종류·계급·입대일/전역일은 users 표에 있지만 여기로 나가지
 * 않는다 — 표에 있다는 것이 공개해도 된다는 뜻은 아니다.
 *
 * 차단은 "없는 사람"으로 보이게 처리한다. `403 차단됨`처럼 이유를 알려주면
 * 차단 사실 자체가 정보가 되어, 차단당한 쪽이 그것을 확인하는 수단이 된다.
 */

import {
  normalizeUsername,
  SOCIAL_ERROR_CODES,
  USER_SEARCH_LIMIT,
} from "@leave/shared";
import {
  and,
  asc,
  eq,
  gte,
  isNotNull,
  lt,
  notExists,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { friendships, userBlocks, users } from "../db/schema";
import { createApp } from "../lib/app";
import type { Db } from "../lib/db";
import { codedError } from "../lib/responses";
import { relationshipFrom } from "../lib/social";
import {
  claimUsername,
  isUsernameAvailable,
  usernamePrefixUpperBound,
} from "../lib/username";
import { authMiddleware } from "../middleware/auth";
import {
  searchUsersRoute,
  setUsernameRoute,
  usernameAvailabilityRoute,
  userProfileRoute,
} from "./users.contract";

/** 어느 방향으로든 차단이 걸린 사용자를 SQL 단계에서 지운다. */
function notBlockedWith(db: Db, viewerId: string) {
  return notExists(
    db
      .select({ blocked: sql`1` })
      .from(userBlocks)
      .where(
        or(
          and(
            eq(userBlocks.userId, viewerId),
            eq(userBlocks.blockedUserId, users.id),
          ),
          and(
            eq(userBlocks.userId, users.id),
            eq(userBlocks.blockedUserId, viewerId),
          ),
        ),
      ),
  );
}

/**
 * 조회자 관점의 사용자 조회.
 *
 * 관계(friendships)를 LEFT JOIN으로 함께 읽는다. 사용자와 관계를 따로 두 번 읽으면
 * 목록 길이만큼 N+1이 되거나, 이어붙이려고 id 목록을 다시 바인딩해야 한다.
 * 차단은 NOT EXISTS로 SQL 안에서 거른다 — JS에서 거르면 20건을 받아 몇 건만
 * 남는 일이 생겨 결과 수가 조용히 줄어든다.
 */
function visibleUsersQuery(db: Db, viewerId: string, narrow: SQL | undefined) {
  return db
    .select({
      userId: users.id,
      username: users.username,
      name: users.name,
      status: friendships.status,
      requestedByUserId: friendships.requestedByUserId,
    })
    .from(users)
    .leftJoin(
      friendships,
      or(
        and(
          eq(friendships.userAId, viewerId),
          eq(friendships.userBId, users.id),
        ),
        and(
          eq(friendships.userBId, viewerId),
          eq(friendships.userAId, users.id),
        ),
      ),
    )
    .where(
      and(
        narrow,
        isNotNull(users.username),
        // 온보딩을 마치지 않은 계정은 아직 서비스를 쓰는 사람이 아니다.
        isNotNull(users.onboardingCompletedAt),
        notBlockedWith(db, viewerId),
      ),
    );
}

type VisibleUserRow = {
  userId: string;
  username: string | null;
  name: string;
  status: "pending" | "accepted" | null;
  requestedByUserId: string | null;
};

function toProfile(row: VisibleUserRow, viewerId: string) {
  return {
    userId: row.userId,
    // 위 쿼리가 `username IS NOT NULL`로 좁히므로 이 자리에서는 항상 값이 있다.
    username: row.username!,
    name: row.name,
    relationship: relationshipFrom(
      row.status && row.requestedByUserId
        ? { status: row.status, requestedByUserId: row.requestedByUserId }
        : null,
      viewerId,
      row.userId,
    ),
  };
}

const app = createApp();
app.use("*", authMiddleware);

export const userRoutes = app
  .openapi(setUsernameRoute, async (c) => {
    const { username } = c.req.valid("json");
    const db = drizzle(c.env.DB);
    const claim = await claimUsername(db, c.get("user").id, username);
    if (!claim.ok) {
      return c.json(
        codedError(
          "이미 사용 중인 사용자 이름이에요",
          SOCIAL_ERROR_CODES.usernameTaken,
        ),
        409,
      );
    }
    return c.json({ username }, 200);
  })
  .openapi(usernameAvailabilityRoute, async (c) => {
    const { username } = c.req.valid("query");
    const available = await isUsernameAvailable(
      drizzle(c.env.DB),
      username,
      c.get("user").id,
    );
    // 이 응답은 조회자마다 다르고 몇 초 만에 낡는다. 중간 캐시에 남기지 않는다.
    c.header("Cache-Control", "no-store");
    return c.json({ username, available }, 200);
  })
  .openapi(searchUsersRoute, async (c) => {
    const prefix = c.req.valid("query").q;
    const viewerId = c.get("user").id;
    const db = drizzle(c.env.DB);
    /**
     * 접두어 범위 조회. `users_username_idx`의 정렬을 그대로 타므로
     * `ORDER BY username`에 TEMP B-TREE가 붙지 않는다. 접두어 P를 가진 문자열
     * 중 P 자신이 가장 짧아 사전순으로 가장 앞이라, **정확히 일치하는 이름이
     * 항상 첫 줄**이 된다 — 따로 정렬 키를 만들 필요가 없다.
     */
    const rows = await visibleUsersQuery(
      db,
      viewerId,
      and(
        gte(users.username, prefix),
        lt(users.username, usernamePrefixUpperBound(prefix)),
      ),
    )
      .orderBy(asc(users.username))
      .limit(USER_SEARCH_LIMIT)
      .all();
    c.header("Cache-Control", "no-store");
    return c.json(
      { results: rows.map((row) => toProfile(row, viewerId)) },
      200,
    );
  })
  .openapi(userProfileRoute, async (c) => {
    const viewerId = c.get("user").id;
    // 주소창의 값은 사람이 손으로 고칠 수 있다. 조회에 쓰기 전에 저장 형식과
    // 같은 정규형으로 만든다 — `/u/HyunWoo`도 같은 사람을 가리켜야 한다.
    const username = normalizeUsername(c.req.valid("param").username);
    const db = drizzle(c.env.DB);
    const row = username
      ? await visibleUsersQuery(
          db,
          viewerId,
          eq(users.username, username),
        ).get()
      : undefined;
    c.header("Cache-Control", "no-store");
    if (!row) {
      return c.json(
        codedError(
          "사용자를 찾을 수 없습니다",
          SOCIAL_ERROR_CODES.userUnavailable,
        ),
        404,
      );
    }
    return c.json(toProfile(row, viewerId), 200);
  });
