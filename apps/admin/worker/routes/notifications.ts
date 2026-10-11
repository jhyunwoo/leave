/**
 * 관리자용 알림 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 *
 * 알림은 인앱 알림함(notifications 행)과 Expo 푸시 두 갈래다. 사용자 앱과 달리
 * 여기서는 푸시 전송을 기다린다 — 관리자가 "보냈다"를 누른 그 자리에서 발송 결과를
 * 알아야 하기 때문이다(push_logs.status). 푸시가 실패해도 인앱 알림 행은 남는다.
 * 푸시 본문에는 민감 정보를 싣지 않는다 — 자세한 이유는 @leave/api의 push.ts.
 *
 * 전체 공지(`/notifications/broadcast`)는 owner만 보낸다. 실수 한 번이 모든 사용자에게
 * 가기 때문이다. 운영 공지 수신을 끈 사용자(user_notification_prefs.announcement)는 뺀다.
 */

import {
  buildNotificationPushMessage,
  notifications,
  pushLogs,
  sendExpoPush,
  sendExpoPushMessages,
  userNotificationPrefs,
  users,
} from "@leave/api/server";
import { isoDateSchema } from "@leave/shared";
import { and, desc, eq, isNull, like, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../audit";
import { ownerMiddleware } from "../auth";
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

const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(500),
});

/** 운영 공지를 끄지 않은 사용자. 설정 행이 없으면 받는 것으로 본다. */
const announcementRecipient = or(
  isNull(userNotificationPrefs.userId),
  eq(userNotificationPrefs.announcement, true),
);

/**
 * 한 문장에 담는 행 수. 행을 JSON 한 덩어리로 넘겨 `json_each`로 펼치므로 바인딩
 * 수(D1 한도 100)와 무관하고, 사용자 수가 늘어도 문장 수가 거의 늘지 않는다.
 */
const BROADCAST_CHUNK = 500;

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += BROADCAST_CHUNK) {
    out.push(items.slice(i, i + BROADCAST_CHUNK));
  }
  return out;
}

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
  .get("/notifications/broadcast", ownerMiddleware, async (c) => {
    const db = drizzle(c.env.DB);
    const row = await db
      .select({
        recipients: sql<number>`cast(count(*) as integer)`,
        pushTargets: sql<number>`cast(coalesce(sum(${users.expoPushToken} like 'ExponentPushToken%'), 0) as integer)`,
      })
      .from(users)
      .leftJoin(
        userNotificationPrefs,
        eq(userNotificationPrefs.userId, users.id),
      )
      .where(announcementRecipient)
      .get();
    return c.json({
      recipients: row?.recipients ?? 0,
      pushTargets: row?.pushTargets ?? 0,
    });
  })
  .post("/notifications/broadcast", ownerMiddleware, async (c) => {
    const input = broadcastSchema.safeParse(
      await c.req.json().catch(() => null),
    );
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const { title, body } = input.data;
    const db = drizzle(c.env.DB);
    const recipients = await db
      .select({ userId: users.id, token: users.expoPushToken })
      .from(users)
      .leftJoin(
        userNotificationPrefs,
        eq(userNotificationPrefs.userId, users.id),
      )
      .where(announcementRecipient)
      .all();
    const createdAt = nowIso();
    const rows = recipients.map((recipient) => ({
      ...recipient,
      notificationId: crypto.randomUUID(),
    }));

    for (const chunk of chunks(rows)) {
      await c.env.DB.prepare(
        `INSERT INTO notifications (id, user_id, title, body, read, created_at)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.userId'), ?1, ?2, 0, ?3
         FROM json_each(?4)`,
      )
        .bind(
          title,
          body,
          createdAt,
          JSON.stringify(
            chunk.map((row) => ({
              id: row.notificationId,
              userId: row.userId,
            })),
          ),
        )
        .run();
    }

    const results = await sendExpoPushMessages(
      rows.map((row) => ({
        token: row.token,
        message: buildNotificationPushMessage({
          id: row.notificationId,
          title,
          body,
        }),
      })),
    );
    // 토큰은 한 사용자에게만 묶인다(push 라우트가 옮겨 붙인다) — 토큰으로 되짚어도 된다.
    const statusByToken = new Map(
      results.map((result) => [result.token, result.status]),
    );
    const logs = rows.map((row) => ({
      id: crypto.randomUUID(),
      userId: row.userId,
      notificationId: row.notificationId,
      status: (row.token && statusByToken.get(row.token)) || "skipped",
    }));
    for (const chunk of chunks(logs)) {
      await c.env.DB.prepare(
        `INSERT INTO push_logs (id, user_id, notification_id, direction, status, created_at)
         SELECT json_extract(value, '$.id'), json_extract(value, '$.userId'),
                json_extract(value, '$.notificationId'), 'send', json_extract(value, '$.status'), ?1
         FROM json_each(?2)`,
      )
        .bind(createdAt, JSON.stringify(chunk))
        .run();
    }

    const summary = {
      recipients: rows.length,
      pushed: logs.filter((log) => log.status === "ok").length,
      pushFailed: logs.filter((log) => log.status === "error").length,
    };
    await writeAudit(c, {
      action: "broadcast",
      entityType: "notification",
      after: { title, body, ...summary },
    });
    return c.json(summary, 201);
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
