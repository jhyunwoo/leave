/**
 * 친구 라우트 — 요청·수락·거절·취소·삭제와 친구 달력.
 *
 * 마운트 위치: `/friends` (apps/api/src/index.ts). 명세는 ./friends.contract.ts,
 * 상태 기계와 차단 판정은 ../lib/social.ts.
 *
 * 이 라우터의 규칙 하나: **화면 상태를 믿지 않는다.** 친구 일정을 돌려주는 모든
 * 경로가 매 요청마다 DB에서 수락 상태와 양방향 차단을 다시 확인한다. 친구를
 * 끊은 다음 요청은 그 자리에서 403이 되고, 이미 열려 있던 화면이 남아 있어도
 * 다음 요청부터는 아무것도 받지 못한다.
 */

import {
  COUNTED_LEAVE_STATUSES,
  diffDays,
  isValidISODate,
  MAX_DATE_RANGE_DAYS,
  monthBounds,
  normalizeUsername,
  SOCIAL_ERROR_CODES,
} from "@leave/shared";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { friendships, leaves, userBlocks, users } from "../db/schema";
import { createApp } from "../lib/app";
import type { Db } from "../lib/db";
import { codedError } from "../lib/responses";
import { notifyFriendRequest } from "../lib/social-notify";
import {
  acceptFriendRequest,
  areBlocked,
  cancelFriendRequest,
  createFriendRequest,
  declineFriendRequest,
  removeFriendship,
} from "../lib/social";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";
import { rateLimit } from "../middleware/rate-limit";
import {
  acceptFriendRequestRoute,
  cancelFriendRequestRoute,
  declineFriendRequestRoute,
  friendCalendarRoute,
  friendCalendarsRoute,
  friendScheduleRoute,
  listFriendsRoute,
  listIncomingRoute,
  listOutgoingRoute,
  removeFriendRoute,
  sendFriendRequestRoute,
} from "./friends.contract";

function relationPeopleQuery(db: Db, viewerId: string) {
  return db
    .select({
      userAId: friendships.userAId,
      userBId: friendships.userBId,
      requestedByUserId: friendships.requestedByUserId,
      status: friendships.status,
      createdAt: friendships.createdAt,
      updatedAt: friendships.updatedAt,
      acceptedAt: friendships.acceptedAt,
      otherUserId: users.id,
      otherName: users.name,
      otherUsername: users.username,
    })
    .from(friendships)
    .innerJoin(
      users,
      or(
        and(
          eq(friendships.userAId, viewerId),
          eq(users.id, friendships.userBId),
        ),
        and(
          eq(friendships.userBId, viewerId),
          eq(users.id, friendships.userAId),
        ),
      ),
    )
    .where(
      or(eq(friendships.userAId, viewerId), eq(friendships.userBId, viewerId)),
    )
    .orderBy(asc(users.name));
}

function blockedCounterpartsQuery(db: Db, viewerId: string) {
  return db
    .select({
      userId: userBlocks.userId,
      blockedUserId: userBlocks.blockedUserId,
    })
    .from(userBlocks)
    .where(
      or(
        eq(userBlocks.userId, viewerId),
        eq(userBlocks.blockedUserId, viewerId),
      ),
    );
}

async function visibleRelations(db: Db, viewerId: string) {
  const [relations, blockedRows] = await db.batch([
    relationPeopleQuery(db, viewerId),
    blockedCounterpartsQuery(db, viewerId),
  ]);
  const blocked = new Set(
    blockedRows.map((row) =>
      row.userId === viewerId ? row.blockedUserId : row.userId,
    ),
  );
  return relations.filter((row) => !blocked.has(row.otherUserId));
}

async function buildFriendCalendars(input: {
  db: Db;
  viewer: { id: string; name: string; username: string | null };
  friendIds: string[];
  months: string[];
}) {
  const { db, viewer, friendIds, months } = input;
  const allowed = (await visibleRelations(db, viewer.id)).filter(
    (row) => row.status === "accepted" && friendIds.includes(row.otherUserId),
  );
  if (allowed.length !== friendIds.length) return null;

  const people = [
    {
      userId: viewer.id,
      name: viewer.name,
      username: viewer.username,
      isViewer: true,
    },
    ...allowed
      .map((row) => ({
        userId: row.otherUserId,
        name: row.otherName,
        username: row.otherUsername,
        isViewer: false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ];
  const ranges = months.map((month) => ({ month, ...monthBounds(month) }));
  const rangeStart = ranges.reduce(
    (value, range) => (range.start < value ? range.start : value),
    ranges[0]!.start,
  );
  const rangeEnd = ranges.reduce(
    (value, range) => (range.end > value ? range.end : value),
    ranges[0]!.end,
  );
  const userIds = [viewer.id, ...friendIds];
  const rows = await db
    .select({
      leaveId: leaves.id,
      userId: leaves.userId,
      startDate: leaves.startDate,
      endDate: leaves.endDate,
      status: leaves.status,
    })
    .from(leaves)
    .where(
      and(
        inArray(leaves.userId, userIds),
        inArray(leaves.status, COUNTED_LEAVE_STATUSES),
        lte(leaves.startDate, rangeEnd),
        gte(leaves.endDate, rangeStart),
      ),
    )
    .all();

  return ranges.map(({ month, start, end }) => ({
    month,
    people,
    leaves: rows.filter((row) => row.startDate <= end && row.endDate >= start),
  }));
}

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);
app.use(
  "/requests",
  rateLimit({ name: "friend-request", limit: 10, windowSeconds: 600 }),
);
app.use(
  "/calendar",
  rateLimit({ name: "friend-calendar", limit: 120, windowSeconds: 60 }),
);
app.use(
  "/calendars",
  rateLimit({ name: "friend-calendar", limit: 120, windowSeconds: 60 }),
);
app.use(
  "/:userId/schedule",
  rateLimit({ name: "friend-calendar", limit: 120, windowSeconds: 60 }),
);

/**
 * 친구 일정·달력 응답에 `no-store`를 붙인다.
 *
 * 권한이 사라진 뒤(친구 삭제·차단) 서버는 곧바로 403을 주지만, 중간 캐시나
 * 브라우저 디스크 캐시에 남은 본문은 그 판정을 거치지 않는다. 이 응답은 조회자
 * 한 사람에게만 뜻이 있고 몇 초 만에 낡으므로 어디에도 남기지 않는 편이 맞다.
 * (네이티브의 디스크 쿼리 캐시도 `friends` 키를 저장하지 않는다 —
 *  apps/native/src/lib/query-persistence.ts)
 */
function noStore(c: { header: (name: string, value: string) => void }) {
  c.header("Cache-Control", "no-store");
}

export const friendRoutes = app
  .openapi(listFriendsRoute, async (c) => {
    // `acceptedAt`은 nullable 컬럼이지만 수락된 행에서는 반드시 채워져 있다 —
    // `friendships_acceptance_check`가 그것을 DB에서 보장한다(db/schema.ts).
    // 그래도 `!`로 눌러 두지 않고 좁히는 필터를 쓴다. 단정은 보장이 사라진 뒤에도
    // 그대로 통과하고, 그러면 `since: null`이 `z.string()` 응답으로 새어 나간다.
    const rows = (
      await visibleRelations(drizzle(c.env.DB), c.get("user").id)
    ).filter(
      (row): row is typeof row & { acceptedAt: string } =>
        row.status === "accepted" && row.acceptedAt !== null,
    );
    return c.json(
      {
        friends: rows.map((row) => ({
          userId: row.otherUserId,
          name: row.otherName,
          username: row.otherUsername,
          since: row.acceptedAt,
        })),
      },
      200,
    );
  })
  .openapi(listIncomingRoute, async (c) => {
    const user = c.get("user");
    const rows = (await visibleRelations(drizzle(c.env.DB), user.id)).filter(
      (row) => row.status === "pending" && row.requestedByUserId !== user.id,
    );
    return c.json(
      {
        requests: rows.map((row) => ({
          userId: row.otherUserId,
          name: row.otherName,
          username: row.otherUsername,
          createdAt: row.createdAt,
        })),
      },
      200,
    );
  })
  .openapi(listOutgoingRoute, async (c) => {
    const user = c.get("user");
    const rows = (await visibleRelations(drizzle(c.env.DB), user.id)).filter(
      (row) => row.status === "pending" && row.requestedByUserId === user.id,
    );
    return c.json(
      {
        requests: rows.map((row) => ({
          userId: row.otherUserId,
          name: row.otherName,
          username: row.otherUsername,
          createdAt: row.createdAt,
        })),
      },
      200,
    );
  })
  .openapi(sendFriendRequestRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const username = normalizeUsername(c.req.valid("json").username);

    // 자기 자신은 이름을 대조하기 전에 걸러 낸다. "없는 사람"으로 답하면
    // 사용자가 자기 이름을 잘못 알고 있다고 오해한다.
    if (user.username && username === user.username) {
      return c.json(
        codedError(
          "자기 자신에게는 요청할 수 없어요",
          SOCIAL_ERROR_CODES.selfRequest,
        ),
        400,
      );
    }

    const target = await db
      .select({ id: users.id, onboardedAt: users.onboardingCompletedAt })
      .from(users)
      .where(eq(users.username, username))
      .get();
    // 없는 이름·온보딩 미완료·차단을 한 응답으로 합친다. 셋을 구분해 주면
    // 그 차이가 곧 "이 사람이 나를 차단했는가"에 대한 답이 된다.
    if (
      !target ||
      !target.onboardedAt ||
      target.id === user.id ||
      (await areBlocked(db, user.id, target.id))
    ) {
      return c.json(
        codedError(
          "사용자를 찾을 수 없습니다",
          SOCIAL_ERROR_CODES.userUnavailable,
        ),
        404,
      );
    }

    const outcome = await createFriendRequest(db, user.id, target.id);
    if (outcome === "friends") {
      return c.json(
        codedError("이미 친구입니다", SOCIAL_ERROR_CODES.alreadyFriends),
        409,
      );
    }
    if (outcome === "incoming") {
      // 반대 방향 요청을 수락으로 수렴시키지 않는다 — 받는 사람이 수락을 누른
      // 적 없이 일정이 공개되는 일을 막는다(lib/social.ts 머리주석).
      return c.json(
        codedError(
          "상대가 이미 친구 요청을 보냈어요. 받은 요청에서 수락해주세요",
          SOCIAL_ERROR_CODES.incomingRequestExists,
        ),
        409,
      );
    }
    // 새로 만들어진 요청만 알린다. `unchanged`(같은 요청 재전송)까지 알리면
    // 보낸 쪽이 버튼을 여러 번 눌러 받는 쪽 알림함을 채울 수 있다.
    if (outcome === "created") {
      await notifyFriendRequest(db, {
        requester: { name: user.name },
        recipientId: target.id,
        waitUntil: (promise) => c.executionCtx.waitUntil(promise),
      });
    }
    return c.json({ ok: true as const }, 200);
  })
  .openapi(acceptFriendRequestRoute, async (c) => {
    const user = c.get("user");
    const otherId = c.req.valid("param").userId;
    const db = drizzle(c.env.DB);
    if (await areBlocked(db, user.id, otherId)) {
      return c.json(
        codedError(
          "친구 요청을 찾을 수 없습니다",
          SOCIAL_ERROR_CODES.requestNotFound,
        ),
        404,
      );
    }
    const accepted = await acceptFriendRequest(db, user.id, otherId);
    if (accepted) return c.json({ ok: true as const }, 200);

    // 한 번 더 눌렀거나(이미 친구) 사라진 요청이거나 둘 중 하나다. 이미 친구면
    // 재수락은 멱등 성공으로 둔다 — 화면이 두 번 눌린 것뿐이다.
    const row = await db
      .select({ status: friendships.status })
      .from(friendships)
      .where(
        or(
          and(
            eq(friendships.userAId, user.id),
            eq(friendships.userBId, otherId),
          ),
          and(
            eq(friendships.userAId, otherId),
            eq(friendships.userBId, user.id),
          ),
        ),
      )
      .get();
    if (row?.status === "accepted") return c.json({ ok: true as const }, 200);
    return c.json(
      codedError(
        "친구 요청을 찾을 수 없습니다",
        SOCIAL_ERROR_CODES.requestNotFound,
      ),
      404,
    );
  })
  .openapi(declineFriendRequestRoute, async (c) => {
    await declineFriendRequest(
      drizzle(c.env.DB),
      c.get("user").id,
      c.req.valid("param").userId,
    );
    // 없던 요청을 거절해도 결과 상태(관계 없음)는 같다 — 멱등으로 둔다.
    return c.json({ ok: true as const }, 200);
  })
  .openapi(cancelFriendRequestRoute, async (c) => {
    await cancelFriendRequest(
      drizzle(c.env.DB),
      c.get("user").id,
      c.req.valid("param").userId,
    );
    return c.json({ ok: true as const }, 200);
  })
  .openapi(friendCalendarRoute, async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const payloads = await buildFriendCalendars({
      db: drizzle(c.env.DB),
      viewer: user,
      friendIds: query.friendIds,
      months: [query.month],
    });
    noStore(c);
    if (!payloads) {
      return c.json(
        codedError(
          "선택한 친구의 달력을 볼 권한이 없습니다",
          SOCIAL_ERROR_CODES.notFriends,
        ),
        403,
      );
    }
    return c.json(payloads[0]!, 200);
  })
  .openapi(friendCalendarsRoute, async (c) => {
    const user = c.get("user");
    const query = c.req.valid("query");
    const calendars = await buildFriendCalendars({
      db: drizzle(c.env.DB),
      viewer: user,
      friendIds: query.friendIds,
      months: query.months.split(","),
    });
    noStore(c);
    if (!calendars) {
      return c.json(
        codedError(
          "선택한 친구의 달력을 볼 권한이 없습니다",
          SOCIAL_ERROR_CODES.notFriends,
        ),
        403,
      );
    }
    return c.json({ calendars }, 200);
  })
  .openapi(friendScheduleRoute, async (c) => {
    const user = c.get("user");
    const otherId = c.req.valid("param").userId;
    const { startDate, endDate } = c.req.valid("query");
    if (
      !isValidISODate(startDate) ||
      !isValidISODate(endDate) ||
      startDate > endDate
    )
      return c.json({ error: "조회 기간이 올바르지 않습니다" }, 400);
    // 다른 모든 범위 조회에는 상한이 있다(달력은 9개월, 휴가는 366일). 여기만
    // 비어 있어서 `0001-01-01~9999-12-31`이 그대로 통과했다.
    if (diffDays(startDate, endDate) + 1 > MAX_DATE_RANGE_DAYS)
      return c.json(
        {
          error: `조회 기간은 최대 ${MAX_DATE_RANGE_DAYS}일까지 지정할 수 있습니다`,
        },
        400,
      );
    const db = drizzle(c.env.DB);
    // 매 요청마다 다시 판정한다. 캐시된 친구 목록은 권한이 아니다.
    const allowed = (await visibleRelations(db, user.id)).find(
      (row) => row.otherUserId === otherId && row.status === "accepted",
    );
    noStore(c);
    if (!allowed) {
      return c.json(
        codedError(
          "친구의 일정을 볼 권한이 없습니다",
          SOCIAL_ERROR_CODES.notFriends,
        ),
        403,
      );
    }
    const rows = await db
      .select({
        leaveId: leaves.id,
        userId: leaves.userId,
        startDate: leaves.startDate,
        endDate: leaves.endDate,
        status: leaves.status,
      })
      .from(leaves)
      .where(
        and(
          eq(leaves.userId, otherId),
          inArray(leaves.status, COUNTED_LEAVE_STATUSES),
          lte(leaves.startDate, endDate),
          gte(leaves.endDate, startDate),
        ),
      )
      .orderBy(asc(leaves.startDate))
      .all();
    return c.json(
      {
        people: [
          {
            userId: otherId,
            name: allowed.otherName,
            username: allowed.otherUsername,
            isViewer: false,
          },
        ],
        leaves: rows,
      },
      200,
    );
  })
  .openapi(removeFriendRoute, async (c) => {
    await removeFriendship(
      drizzle(c.env.DB),
      c.get("user").id,
      c.req.valid("param").userId,
    );
    return c.json({ ok: true as const }, 200);
  });
