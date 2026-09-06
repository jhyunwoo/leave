/**
 * 관리자용 알림 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 *
 * 알림은 인앱 알림함(notifications 행)과 Expo 푸시 두 갈래다. 사용자 앱과 달리
 * 여기서는 푸시 전송을 기다린다 — 관리자가 "보냈다"를 누른 그 자리에서 발송 결과를
 * 알아야 하기 때문이다(push_logs.status). 푸시가 실패해도 인앱 알림 행은 남는다.
 * 푸시 본문에는 민감 정보를 싣지 않는다 — 자세한 이유는 @leave/api의 push.ts.
 */

import {
  buildNotificationPushMessage,
  notifications,
  pushLogs,
  sendExpoPush,
  users,
} from "@leave/api/server";
import { isoDateSchema } from "@leave/shared";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso } from "../utils";

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

/** notifications.datesJson은 자유 형식 문자열이라 읽을 때마다 방어적으로 푼다. */
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

export const adminNotificationRoutes = new Hono<AdminAppEnv>()
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
      const results = await sendExpoPush(
        [user.expoPushToken],
        buildNotificationPushMessage(notification),
      );
      const result = results[0];
      await db.insert(pushLogs).values({
        id: crypto.randomUUID(),
        userId: user.id,
        notificationId: notification.id,
        direction: "send",
        status: result?.status ?? "skipped",
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
