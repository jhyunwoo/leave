import {
  allocationsForLeaves,
  assertAllocationsAvailable,
  bumpUnitVersion,
  checkOverageAndNotify,
  insertLeaveAllocations,
  leaveAllocations,
  leaves,
  notifications,
  pushLogs,
  sendExpoPush,
  unitJoinRequests,
  units,
  users,
} from "@leave/api/server";
import {
  inclusiveDays,
  isoDateSchema,
  leaveAllocationSchema,
} from "@leave/shared";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso, safeWaitUntil } from "../utils";

const leaveSchema = z
  .object({
    userId: z.string().min(1),
    title: z.string().trim().min(1).max(80),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    reason: z.string().trim().max(500).nullable().optional(),
    allocations: z.array(leaveAllocationSchema).min(1).max(10),
    sendNotifications: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    if (value.startDate > value.endDate) {
      ctx.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "종료일은 시작일과 같거나 뒤여야 합니다",
      });
      return;
    }
    const sum = value.allocations.reduce((total, item) => total + item.days, 0);
    if (sum !== inclusiveDays(value.startDate, value.endDate)) {
      ctx.addIssue({
        code: "custom",
        path: ["allocations"],
        message: "휴가 기간과 재원 일수 합계가 일치해야 합니다",
      });
    }
  });

const notificationCreateSchema = z.object({
  userId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(500),
  leaveId: z.string().nullable().optional(),
  dates: z.array(isoDateSchema).max(120).optional(),
  sendPush: z.boolean().optional().default(false),
});

const notificationUpdateSchema = notificationCreateSchema
  .omit({ userId: true, sendPush: true })
  .partial()
  .extend({ read: z.boolean().optional() });

async function getUser(
  db: ReturnType<typeof drizzle>,
  id: string,
): Promise<typeof users.$inferSelect | undefined> {
  return db.select().from(users).where(eq(users.id, id)).get();
}

function parseDates(datesJson: string | null): string[] {
  if (!datesJson) return [];
  try {
    const value: unknown = JSON.parse(datesJson);
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export const leaveContentRoutes = new Hono<AdminAppEnv>()
  .get("/leaves", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const conditions: SQL<unknown>[] = [];
    const userId = c.req.query("userId");
    const unitId = c.req.query("unitId");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (q) {
      conditions.push(
        or(
          like(leaves.title, `%${q}%`),
          like(leaves.reason, `%${q}%`),
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
        )!,
      );
    }
    if (userId) conditions.push(eq(leaves.userId, userId));
    if (unitId) conditions.push(eq(users.unitId, unitId));
    if (from) conditions.push(sql`${leaves.endDate} >= ${from}`);
    if (to) conditions.push(sql`${leaves.startDate} <= ${to}`);
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: leaves.id,
          userId: leaves.userId,
          userName: users.name,
          userEmail: users.email,
          unitId: users.unitId,
          unitName: units.name,
          title: leaves.title,
          startDate: leaves.startDate,
          endDate: leaves.endDate,
          reason: leaves.reason,
          createdAt: leaves.createdAt,
        })
        .from(leaves)
        .innerJoin(users, eq(leaves.userId, users.id))
        .leftJoin(units, eq(users.unitId, units.id))
        .where(where)
        .orderBy(desc(leaves.startDate))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(leaves)
        .innerJoin(users, eq(leaves.userId, users.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    const allocationMap = await allocationsForLeaves(
      db,
      items.map((item) => item.id),
    );
    return c.json({
      items: items.map((item) => ({
        ...item,
        allocations: allocationMap.get(item.id) ?? [],
      })),
      meta: listMeta(page, pageSize, total),
    });
  })
  .post("/leaves", async (c) => {
    const input = leaveSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const user = await getUser(db, input.data.userId);
    if (!user) return c.json({ error: "사용자를 찾을 수 없습니다" }, 400);
    try {
      await assertAllocationsAvailable(db, user, input.data.allocations);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "잔여량이 부족합니다",
        },
        400,
      );
    }
    const leave: typeof leaves.$inferInsert = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: input.data.title,
      startDate: input.data.startDate,
      endDate: input.data.endDate,
      reason: input.data.reason ?? null,
      createdAt: nowIso(),
    };
    await db.insert(leaves).values(leave);
    await insertLeaveAllocations(db, leave.id, input.data.allocations);
    if (user.unitId) {
      await bumpUnitVersion(c.env.CACHE, user.unitId);
      if (input.data.sendNotifications) {
        safeWaitUntil(
          c,
          checkOverageAndNotify({
            db,
            unitId: user.unitId,
            changedLeave: leave as typeof leaves.$inferSelect,
            waitUntil: (promise) => safeWaitUntil(c, promise),
          }),
        );
      }
    }
    await writeAudit(c, {
      action: "create",
      entityType: "leave",
      entityId: leave.id,
      after: { ...leave, sendNotifications: input.data.sendNotifications },
    });
    return c.json(
      { item: { ...leave, allocations: input.data.allocations } },
      201,
    );
  })
  .patch("/leaves/:id", async (c) => {
    const input = leaveSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(leaves)
      .where(eq(leaves.id, id))
      .get();
    if (!before) return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    const [oldUser, newUser] = await Promise.all([
      getUser(db, before.userId),
      getUser(db, input.data.userId),
    ]);
    if (!newUser) return c.json({ error: "사용자를 찾을 수 없습니다" }, 400);
    try {
      await assertAllocationsAvailable(
        db,
        newUser,
        input.data.allocations,
        newUser.id === before.userId ? id : undefined,
      );
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "잔여량이 부족합니다",
        },
        400,
      );
    }
    const patch = {
      userId: newUser.id,
      title: input.data.title,
      startDate: input.data.startDate,
      endDate: input.data.endDate,
      reason: input.data.reason ?? null,
    };
    await db.batch([
      db.update(leaves).set(patch).where(eq(leaves.id, id)),
      db.delete(leaveAllocations).where(eq(leaveAllocations.leaveId, id)),
      db.insert(leaveAllocations).values(
        input.data.allocations.map((allocation) => ({
          id: crypto.randomUUID(),
          leaveId: id,
          category: allocation.category,
          days: allocation.days,
          overnightKind: allocation.overnightKind ?? null,
        })),
      ),
    ]);
    if (oldUser?.unitId) await bumpUnitVersion(c.env.CACHE, oldUser.unitId);
    if (newUser.unitId) {
      await bumpUnitVersion(c.env.CACHE, newUser.unitId);
      if (input.data.sendNotifications) {
        safeWaitUntil(
          c,
          checkOverageAndNotify({
            db,
            unitId: newUser.unitId,
            changedLeave: { ...before, ...patch },
            waitUntil: (promise) => safeWaitUntil(c, promise),
          }),
        );
      }
    }
    const after = { ...before, ...patch, allocations: input.data.allocations };
    await writeAudit(c, {
      action: "update",
      entityType: "leave",
      entityId: id,
      before,
      after: { ...after, sendNotifications: input.data.sendNotifications },
    });
    return c.json({ item: after });
  })
  .delete("/leaves/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(leaves)
      .where(eq(leaves.id, id))
      .get();
    if (!before) return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    const user = await getUser(db, before.userId);
    await db.delete(leaves).where(eq(leaves.id, id));
    if (user?.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    await writeAudit(c, {
      action: "delete",
      entityType: "leave",
      entityId: id,
      before,
    });
    return c.json({ ok: true as const });
  })
  .get("/join-requests", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const where = q
      ? or(
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
          like(units.name, `%${q}%`),
        )
      : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: unitJoinRequests.id,
          unitId: unitJoinRequests.unitId,
          unitName: units.name,
          userId: unitJoinRequests.userId,
          userName: users.name,
          userEmail: users.email,
          createdAt: unitJoinRequests.createdAt,
        })
        .from(unitJoinRequests)
        .innerJoin(users, eq(unitJoinRequests.userId, users.id))
        .innerJoin(units, eq(unitJoinRequests.unitId, units.id))
        .where(where)
        .orderBy(desc(unitJoinRequests.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(unitJoinRequests)
        .innerJoin(users, eq(unitJoinRequests.userId, users.id))
        .innerJoin(units, eq(unitJoinRequests.unitId, units.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    return c.json({ items, meta: listMeta(page, pageSize, total) });
  })
  .post("/join-requests", async (c) => {
    const input = z
      .object({ userId: z.string().min(1), unitId: z.string().min(1) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success)
      return c.json({ error: "사용자와 부대를 선택해주세요" }, 400);
    const db = drizzle(c.env.DB);
    const [user, unit] = await Promise.all([
      getUser(db, input.data.userId),
      db.select().from(units).where(eq(units.id, input.data.unitId)).get(),
    ]);
    if (!user || !unit)
      return c.json({ error: "사용자 또는 부대를 찾을 수 없습니다" }, 404);
    await db
      .delete(unitJoinRequests)
      .where(eq(unitJoinRequests.userId, user.id));
    const request = {
      id: crypto.randomUUID(),
      userId: user.id,
      unitId: unit.id,
      createdAt: nowIso(),
    };
    await db.insert(unitJoinRequests).values(request);
    await writeAudit(c, {
      action: "create",
      entityType: "join_request",
      entityId: request.id,
      after: request,
    });
    return c.json({ item: request }, 201);
  })
  .post("/join-requests/:id/approve", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const request = await db
      .select()
      .from(unitJoinRequests)
      .where(eq(unitJoinRequests.id, id))
      .get();
    if (!request) return c.json({ error: "가입 요청을 찾을 수 없습니다" }, 404);
    const user = await getUser(db, request.userId);
    await db
      .update(users)
      .set({ unitId: request.unitId })
      .where(eq(users.id, request.userId));
    await db
      .delete(unitJoinRequests)
      .where(eq(unitJoinRequests.userId, request.userId));
    if (user?.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    await bumpUnitVersion(c.env.CACHE, request.unitId);
    await writeAudit(c, {
      action: "approve",
      entityType: "join_request",
      entityId: id,
      before: request,
      after: { userId: request.userId, unitId: request.unitId },
    });
    return c.json({ ok: true as const });
  })
  .post("/join-requests/:id/reject", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const request = await db
      .select()
      .from(unitJoinRequests)
      .where(eq(unitJoinRequests.id, id))
      .get();
    if (!request) return c.json({ error: "가입 요청을 찾을 수 없습니다" }, 404);
    await db.delete(unitJoinRequests).where(eq(unitJoinRequests.id, id));
    await writeAudit(c, {
      action: "reject",
      entityType: "join_request",
      entityId: id,
      before: request,
    });
    return c.json({ ok: true as const });
  })
  .delete("/join-requests/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const request = await db
      .select()
      .from(unitJoinRequests)
      .where(eq(unitJoinRequests.id, id))
      .get();
    if (!request) return c.json({ error: "가입 요청을 찾을 수 없습니다" }, 404);
    await db.delete(unitJoinRequests).where(eq(unitJoinRequests.id, id));
    await writeAudit(c, {
      action: "delete",
      entityType: "join_request",
      entityId: id,
      before: request,
    });
    return c.json({ ok: true as const });
  })
  .get("/notifications", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const userId = c.req.query("userId");
    const conditions: SQL<unknown>[] = [];
    if (q) {
      conditions.push(
        or(
          like(notifications.title, `%${q}%`),
          like(notifications.body, `%${q}%`),
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
        )!,
      );
    }
    if (userId) conditions.push(eq(notifications.userId, userId));
    const where = conditions.length ? and(...conditions) : undefined;
    const [rows, total] = await Promise.all([
      db
        .select({
          notification: notifications,
          userName: users.name,
          userEmail: users.email,
        })
        .from(notifications)
        .innerJoin(users, eq(notifications.userId, users.id))
        .where(where)
        .orderBy(desc(notifications.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(notifications)
        .innerJoin(users, eq(notifications.userId, users.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    return c.json({
      items: rows.map(({ notification, ...rest }) => ({
        ...notification,
        ...rest,
        dates: parseDates(notification.datesJson),
        datesJson: undefined,
      })),
      meta: listMeta(page, pageSize, total),
    });
  })
  .post("/notifications", async (c) => {
    const input = notificationCreateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const user = await getUser(db, input.data.userId);
    if (!user) return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);
    const notification = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: input.data.title,
      body: input.data.body,
      leaveId: input.data.leaveId ?? null,
      datesJson: input.data.dates?.length
        ? JSON.stringify(input.data.dates)
        : null,
      read: false,
      createdAt: nowIso(),
    };
    await db.insert(notifications).values(notification);
    if (input.data.sendPush) {
      const results = await sendExpoPush([user.expoPushToken], {
        title: notification.title,
        body: notification.body,
        data: { notificationId: notification.id },
      });
      const result = results[0];
      await db.insert(pushLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        notificationId: notification.id,
        direction: "send",
        title: notification.title,
        body: notification.body,
        dataJson: JSON.stringify({ notificationId: notification.id }),
        status: result?.status ?? "skipped",
        detail:
          result?.detail ??
          (user.expoPushToken ? "유효하지 않은 Expo 토큰" : "토큰 없음"),
        createdAt: nowIso(),
      });
    }
    await writeAudit(c, {
      action: input.data.sendPush ? "create_and_send" : "create",
      entityType: "notification",
      entityId: notification.id,
      after: { ...notification, sendPush: input.data.sendPush },
    });
    return c.json({ item: notification }, 201);
  })
  .patch("/notifications/:id", async (c) => {
    const input = notificationUpdateSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .get();
    if (!before) return c.json({ error: "알림을 찾을 수 없습니다" }, 404);
    const patch: Partial<typeof notifications.$inferInsert> = {};
    if (input.data.title !== undefined) patch.title = input.data.title;
    if (input.data.body !== undefined) patch.body = input.data.body;
    if (input.data.leaveId !== undefined) patch.leaveId = input.data.leaveId;
    if (input.data.dates !== undefined) {
      patch.datesJson = input.data.dates.length
        ? JSON.stringify(input.data.dates)
        : null;
    }
    if (input.data.read !== undefined) patch.read = input.data.read;
    await db.update(notifications).set(patch).where(eq(notifications.id, id));
    const after = { ...before, ...patch };
    await writeAudit(c, {
      action: "update",
      entityType: "notification",
      entityId: id,
      before,
      after,
    });
    return c.json({ item: after });
  })
  .delete("/notifications/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id))
      .get();
    if (!before) return c.json({ error: "알림을 찾을 수 없습니다" }, 404);
    await db.delete(notifications).where(eq(notifications.id, id));
    await writeAudit(c, {
      action: "delete",
      entityType: "notification",
      entityId: id,
      before,
    });
    return c.json({ ok: true as const });
  });
