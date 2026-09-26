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
 *
 * 친구 사이라도 상대가 공유를 끈 항목은 싣지 않는다(../lib/friend-sharing.ts).
 * 관계 판정과 같은 조회에서 함께 읽으므로 이것도 매 요청 새로 판정된다.
 */

import {
  COUNTED_LEAVE_STATUSES,
  diffDays,
  isOutingSegments,
  isValidISODate,
  MAX_DATE_RANGE_DAYS,
  monthBounds,
  normalizeUsername,
  normalizeLegacyDischargeDate,
  settledLeaveStatus,
  SOCIAL_ERROR_CODES,
  todayInSeoul,
} from "@leave/shared";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  friendships,
  leaves,
  leaveSegments,
  userBlocks,
  userFriendSharing,
  users,
} from "../db/schema";
import { createApp } from "../lib/app";
import { readRemainingDutyDaysForUsers } from "../lib/duty-days";
import type { Db } from "../lib/db";
import {
  friendSharingColumns,
  readFriendSharing,
  resolveFriendSharing,
  updateFriendSharing,
} from "../lib/friend-sharing";
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
  getFriendSharingRoute,
  listFriendsRoute,
  listIncomingRoute,
  listOutgoingRoute,
  removeFriendRoute,
  sendFriendRequestRoute,
  updateFriendSharingRoute,
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
      enlistedAt: users.enlistedAt,
      dischargeAt: users.dischargeAt,
      branch: users.branch,
      unitId: users.unitId,
      // 상대가 친구에게 보여주기로 한 항목. 설정한 적이 없으면 null이다.
      sharing: friendSharingColumns,
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
    .leftJoin(userFriendSharing, eq(userFriendSharing.userId, users.id))
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
  return relations
    .filter((row) => !blocked.has(row.otherUserId))
    .map((row) => ({ ...row, sharing: resolveFriendSharing(row.sharing) }));
}

/**
 * 이 사람들의 이 기간 출타 중 **외출인 것**의 id.
 *
 * 친구에게 보이는 것은 휴가/외출 두 갈래뿐이고(`friendCalendarLeaveSchema.kind`),
 * 판정은 서버·앱이 함께 쓰는 `isOutingSegments`가 한다.
 *
 * 휴가 id를 먼저 모아 `IN(...)`에 넣지 않고 구간을 휴가와 조인해 읽는다 —
 * 왕복이 한 번 줄고, 바인드 파라미터 상한에 걸리지 않는다(`segmentsOfUnitDuring`이
 * 같은 이유로 조인을 쓴다). 여기 `userIds`는 최대 11명(나 + 친구 10)이다.
 */
async function outingLeaveIds(
  db: Db,
  input: { userIds: string[]; start: string; end: string },
) {
  const rows = await db
    .select({
      leaveId: leaveSegments.leaveId,
      category: leaveSegments.category,
    })
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .where(
      and(
        inArray(leaves.userId, input.userIds),
        inArray(leaves.status, COUNTED_LEAVE_STATUSES),
        lte(leaves.startDate, input.end),
        gte(leaves.endDate, input.start),
      ),
    )
    .all();
  const byLeave = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const segments = byLeave.get(row.leaveId) ?? [];
    segments.push(row);
    byLeave.set(row.leaveId, segments);
  }
  return new Set(
    [...byLeave]
      .filter(([, segments]) => isOutingSegments(segments))
      .map(([leaveId]) => leaveId),
  );
}

/**
 * 사람마다 끝나지 않은 가장 가까운 휴가 한 건 — 친구 목록의 "다음 휴가 D-day".
 *
 * 외출은 뺀다. 내 휴가 카드(`nextLeaveCountdowns`)가 휴가와 외출을 따로 세는 것과
 * 같은 이유다 — 내일 외출이 다음 주 연가를 가리면 정작 휴가가 언제인지 모른다.
 * 판정은 친구 달력의 `kind`와 같은 `isOutingSegments`다.
 *
 * 구간을 휴가와 조인해 읽으므로 행은 구간 단위로 온다. 사람 id는 D1 바인드 상한
 * (100) 안에서 문장을 나누되, 문장들은 batch 하나로 보낸다.
 */
async function readNextLeavesForUsers(
  db: Db,
  userIds: readonly string[],
  today: string,
) {
  const result = new Map<string, { startDate: string; endDate: string }>();
  if (!userIds.length) return result;
  // 사람 id 90개 + 상태 4개 + 오늘 1개로 한 문장이 100을 넘지 않는다.
  const chunks: string[][] = [];
  for (let offset = 0; offset < userIds.length; offset += 90) {
    chunks.push(userIds.slice(offset, offset + 90));
  }
  const statements = chunks.map((chunk) =>
    db
      .select({
        leaveId: leaves.id,
        userId: leaves.userId,
        startDate: leaves.startDate,
        endDate: leaves.endDate,
        category: leaveSegments.category,
      })
      .from(leaveSegments)
      .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
      .where(
        and(
          inArray(leaves.userId, chunk),
          inArray(leaves.status, COUNTED_LEAVE_STATUSES),
          gte(leaves.endDate, today),
        ),
      ),
  );
  const [first, ...rest] = statements;
  const rows = (await db.batch([first!, ...rest])).flat();

  const byLeave = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const segments = byLeave.get(row.leaveId) ?? [];
    segments.push(row);
    byLeave.set(row.leaveId, segments);
  }
  for (const segments of byLeave.values()) {
    if (isOutingSegments(segments)) continue;
    const { userId, startDate, endDate } = segments[0]!;
    const current = result.get(userId);
    if (
      !current ||
      startDate < current.startDate ||
      (startDate === current.startDate && endDate < current.endDate)
    ) {
      result.set(userId, { startDate, endDate });
    }
  }
  return result;
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
      // 남에게 숨기는 설정이 내 달력에서 나를 지우지는 않는다.
      leaveScheduleShared: true,
    },
    ...allowed
      .map((row) => ({
        userId: row.otherUserId,
        name: row.otherName,
        username: row.otherUsername,
        isViewer: false,
        leaveScheduleShared: row.sharing.leaveSchedule,
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
  // 휴가 일정을 끈 친구는 조회 대상에서 뺀다. 받아 온 뒤 거르면 거르는 자리를
  // 하나만 빠뜨려도 새지만, 읽지 않은 것은 어디로도 새지 않는다.
  const userIds = people
    .filter((person) => person.leaveScheduleShared)
    .map((person) => person.userId);
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
  const outings = await outingLeaveIds(db, {
    userIds,
    start: rangeStart,
    end: rangeEnd,
  });

  // 상태 표기는 내 휴가·부대 달력과 같은 규칙을 쓴다 — 복귀일이 지난 계획은
  // "복귀 완료"다. 친구 화면만 옛 상태를 말하면 같은 휴가가 두 이름을 갖는다.
  const today = todayInSeoul();

  return ranges.map(({ month, start, end }) => ({
    month,
    people,
    leaves: rows
      .filter((row) => row.startDate <= end && row.endDate >= start)
      .map((row) => ({
        ...row,
        status: settledLeaveStatus(row.status, row.endDate, today),
        kind: outings.has(row.leaveId)
          ? ("outing" as const)
          : ("leave" as const),
      })),
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
    // 공유하지 않는 사람의 일과일·휴가는 읽지도 않는다 — 보내지 않을 값에 D1 왕복을
    // 쓰지 않고, 읽지 않은 것은 어디로도 새지 않는다.
    const db = drizzle(c.env.DB);
    const [dutyDays, nextLeaves] = await Promise.all([
      readRemainingDutyDaysForUsers(
        db,
        rows
          .filter((row) => row.sharing.dutyDays)
          .map((row) => ({ ...row, id: row.otherUserId })),
      ),
      readNextLeavesForUsers(
        db,
        rows
          .filter((row) => row.sharing.leaveSchedule)
          .map((row) => row.otherUserId),
        todayInSeoul(),
      ),
    ]);
    noStore(c);
    return c.json(
      {
        friends: rows.map((row) => ({
          userId: row.otherUserId,
          name: row.otherName,
          username: row.otherUsername,
          since: row.acceptedAt,
          ...(row.sharing.serviceProgress
            ? {
                enlistedAt: row.enlistedAt,
                dischargeAt: normalizeLegacyDischargeDate(
                  row.enlistedAt,
                  row.branch,
                  row.dischargeAt,
                ),
              }
            : { enlistedAt: null, dischargeAt: null }),
          dutyDays: row.sharing.dutyDays
            ? dutyDays.get(row.otherUserId)!.dutyDays
            : null,
          leaveScheduleShared: row.sharing.leaveSchedule,
          nextLeave: nextLeaves.get(row.otherUserId) ?? null,
        })),
      },
      200,
    );
  })
  .openapi(getFriendSharingRoute, async (c) => {
    const sharing = await readFriendSharing(
      drizzle(c.env.DB),
      c.get("user").id,
    );
    return c.json({ sharing }, 200);
  })
  .openapi(updateFriendSharingRoute, async (c) => {
    const sharing = await updateFriendSharing(
      drizzle(c.env.DB),
      c.get("user").id,
      c.req.valid("json"),
    );
    return c.json({ sharing }, 200);
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
    const person = {
      userId: otherId,
      name: allowed.otherName,
      username: allowed.otherUsername,
      isViewer: false,
      leaveScheduleShared: allowed.sharing.leaveSchedule,
    };
    // 공유를 끈 친구의 휴가는 읽지도 않는다. 403으로 답하지 않는 이유: 관계는 그대로라
    // 화면의 캐시를 지울 일이 아니고(@leave/client의 watchFriendAccessRevocation),
    // 화면은 빈 목록을 "휴가 없음"이 아니라 "비공개"로 그려야 한다.
    if (!person.leaveScheduleShared) {
      return c.json({ people: [person], leaves: [] }, 200);
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
    const outings = await outingLeaveIds(db, {
      userIds: [otherId],
      start: startDate,
      end: endDate,
    });
    // 목록 전체가 같은 오늘을 본다.
    const today = todayInSeoul();
    return c.json(
      {
        people: [person],
        leaves: rows.map((row) => ({
          ...row,
          status: settledLeaveStatus(row.status, row.endDate, today),
          kind: outings.has(row.leaveId)
            ? ("outing" as const)
            : ("leave" as const),
        })),
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
