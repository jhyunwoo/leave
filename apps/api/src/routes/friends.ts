import {
  canonicalFriendPair,
  COUNTED_LEAVE_STATUSES,
  isValidISODate,
  monthBounds,
} from "@leave/shared";
import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { friendships, leaves, userBlocks, users } from "../db/schema";
import { createApp } from "../lib/app";
import type { Db } from "../lib/db";
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

function pairWhere(first: string, second: string) {
  const [userAId, userBId] = canonicalFriendPair(first, second);
  return and(
    eq(friendships.userAId, userAId),
    eq(friendships.userBId, userBId),
  );
}

async function areBlocked(
  db: Db,
  first: string,
  second: string,
): Promise<boolean> {
  const row = await db
    .select({ userId: userBlocks.userId })
    .from(userBlocks)
    .where(
      or(
        and(eq(userBlocks.userId, first), eq(userBlocks.blockedUserId, second)),
        and(eq(userBlocks.userId, second), eq(userBlocks.blockedUserId, first)),
      ),
    )
    .get();
  return Boolean(row);
}

async function buildFriendCalendars(input: {
  db: Db;
  viewer: { id: string; name: string };
  friendIds: string[];
  months: string[];
}) {
  const { db, viewer, friendIds, months } = input;
  const allowed = (await visibleRelations(db, viewer.id)).filter(
    (row) => row.status === "accepted" && friendIds.includes(row.otherUserId),
  );
  if (allowed.length !== friendIds.length) return null;

  const people = [
    { userId: viewer.id, name: viewer.name, isViewer: true },
    ...allowed
      .map((row) => ({
        userId: row.otherUserId,
        name: row.otherName,
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

export const friendRoutes = app
  .openapi(listFriendsRoute, async (c) => {
    const rows = (
      await visibleRelations(drizzle(c.env.DB), c.get("user").id)
    ).filter((row) => row.status === "accepted");
    return c.json(
      {
        friends: rows.map((row) => ({
          userId: row.otherUserId,
          name: row.otherName,
          since: row.acceptedAt!,
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
          createdAt: row.createdAt,
        })),
      },
      200,
    );
  })
  .openapi(sendFriendRequestRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const target = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, c.req.valid("json").email))
      .get();
    if (
      !target ||
      target.id === user.id ||
      (await areBlocked(db, user.id, target.id))
    )
      return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
    const existing = await db
      .select()
      .from(friendships)
      .where(pairWhere(user.id, target.id))
      .get();
    if (existing?.status === "accepted")
      return c.json({ error: "이미 친구입니다" }, 409);
    const now = new Date().toISOString();
    if (existing) {
      if (existing.requestedByUserId !== user.id) {
        await db
          .update(friendships)
          .set({ status: "accepted", acceptedAt: now, updatedAt: now })
          .where(pairWhere(user.id, target.id));
      }
      return c.json({ ok: true as const }, 200);
    }
    const [userAId, userBId] = canonicalFriendPair(user.id, target.id);
    await db
      .insert(friendships)
      .values({
        userAId,
        userBId,
        requestedByUserId: user.id,
        status: "pending",
        createdAt: now,
        updatedAt: now,
        acceptedAt: null,
      })
      .onConflictDoNothing();
    // If the inverse request won the unique-key race, converge on an accepted
    // friendship instead of leaving one side's request pending.
    const persisted = await db
      .select()
      .from(friendships)
      .where(pairWhere(user.id, target.id))
      .get();
    if (
      persisted?.status === "pending" &&
      persisted.requestedByUserId !== user.id
    ) {
      await db
        .update(friendships)
        .set({ status: "accepted", acceptedAt: now, updatedAt: now })
        .where(pairWhere(user.id, target.id));
    }
    return c.json({ ok: true as const }, 200);
  })
  .openapi(acceptFriendRequestRoute, async (c) => {
    const user = c.get("user");
    const otherId = c.req.valid("param").userId;
    const db = drizzle(c.env.DB);
    if (await areBlocked(db, user.id, otherId))
      return c.json({ error: "친구 요청을 찾을 수 없습니다" }, 404);
    const row = await db
      .select()
      .from(friendships)
      .where(pairWhere(user.id, otherId))
      .get();
    if (!row || row.requestedByUserId === user.id)
      return c.json({ error: "친구 요청을 찾을 수 없습니다" }, 404);
    if (row.status === "pending") {
      const now = new Date().toISOString();
      await db
        .update(friendships)
        .set({ status: "accepted", acceptedAt: now, updatedAt: now })
        .where(pairWhere(user.id, otherId));
    }
    return c.json({ ok: true as const }, 200);
  })
  .openapi(declineFriendRequestRoute, async (c) => {
    const user = c.get("user");
    const otherId = c.req.valid("param").userId;
    await drizzle(c.env.DB)
      .delete(friendships)
      .where(
        and(
          pairWhere(user.id, otherId),
          eq(friendships.status, "pending"),
          eq(friendships.requestedByUserId, otherId),
        ),
      );
    return c.json({ ok: true as const }, 200);
  })
  .openapi(cancelFriendRequestRoute, async (c) => {
    const user = c.get("user");
    const otherId = c.req.valid("param").userId;
    await drizzle(c.env.DB)
      .delete(friendships)
      .where(
        and(
          pairWhere(user.id, otherId),
          eq(friendships.status, "pending"),
          eq(friendships.requestedByUserId, user.id),
        ),
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
    if (!payloads)
      return c.json({ error: "선택한 친구의 달력을 볼 권한이 없습니다" }, 403);
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
    if (!calendars)
      return c.json({ error: "선택한 친구의 달력을 볼 권한이 없습니다" }, 403);
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
    const db = drizzle(c.env.DB);
    const allowed = (await visibleRelations(db, user.id)).find(
      (row) => row.otherUserId === otherId && row.status === "accepted",
    );
    if (!allowed)
      return c.json({ error: "친구의 일정을 볼 권한이 없습니다" }, 403);
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
        people: [{ userId: otherId, name: allowed.otherName, isViewer: false }],
        leaves: rows,
      },
      200,
    );
  })
  .openapi(removeFriendRoute, async (c) => {
    const user = c.get("user");
    await drizzle(c.env.DB)
      .delete(friendships)
      .where(
        and(
          pairWhere(user.id, c.req.valid("param").userId),
          eq(friendships.status, "accepted"),
        ),
      );
    return c.json({ ok: true as const }, 200);
  });
