/**
 * 알림함·알림 설정 라우트.
 *
 * 마운트 위치: `/notifications` (apps/api/src/index.ts).
 * 알림 본문은 서버가 만들고(lib/overage.ts) 여기서는 조회·읽음 처리·수신 설정만 한다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { notificationPrefsSchema } from "@leave/shared";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  notifications,
  userNotificationPrefs,
  type NotificationRow,
} from "../db/schema";
import { createApp } from "../lib/app";
import {
  errorResponse,
  jsonContent,
  notificationPrefsResponseSchema,
  notificationSchema,
  okSchema,
} from "../lib/responses";
import { authMiddleware } from "../middleware/auth";

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["알림"],
  summary: "내 알림 목록",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({
        notifications: z.array(notificationSchema),
        unreadCount: z.number(),
      }),
      "알림 목록",
    ),
    401: errorResponse("인증 실패"),
  },
});

const readAllRoute = createRoute({
  method: "post",
  path: "/read",
  tags: ["알림"],
  summary: "모든 알림 읽음 처리",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "처리 완료"),
    401: errorResponse("인증 실패"),
  },
});

const prefsRoute = createRoute({
  method: "get",
  path: "/preferences",
  tags: ["알림"],
  summary: "알림 종류별 수신 설정",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ preferences: notificationPrefsResponseSchema }),
      "수신 설정",
    ),
    401: errorResponse("인증 실패"),
  },
});

const updatePrefsRoute = createRoute({
  method: "patch",
  path: "/preferences",
  tags: ["알림"],
  summary: "알림 종류별 수신 설정 변경",
  description:
    "보낸 항목만 바꿉니다. 전부 꺼도 앱은 그대로 이용할 수 있습니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: notificationPrefsSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(
      z.object({ preferences: notificationPrefsResponseSchema }),
      "변경된 설정",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

/** 행이 없으면 전부 켜진 것으로 본다 — 기존 사용자의 동작을 바꾸지 않는다. */
const DEFAULT_PREFS = { overage: true, blackout: true, unitNotice: true };

function parseDates(row: NotificationRow): string[] {
  if (!row.datesJson) return [];
  try {
    const parsed: unknown = JSON.parse(row.datesJson);
    return Array.isArray(parsed)
      ? parsed.filter((d) => typeof d === "string")
      : [];
  } catch {
    return [];
  }
}

const app = createApp();
app.use("*", authMiddleware);

export const notificationRoutes = app
  .openapi(listRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, user.id))
      .orderBy(desc(notifications.createdAt))
      .limit(50)
      .all();
    const unreadCount = await db.$count(
      notifications,
      and(eq(notifications.userId, user.id), eq(notifications.read, false)),
    );
    return c.json(
      {
        notifications: rows.map((row) => ({
          id: row.id,
          title: row.title,
          body: row.body,
          leaveId: row.leaveId,
          dates: parseDates(row),
          read: row.read,
          createdAt: row.createdAt,
        })),
        unreadCount,
      },
      200,
    );
  })
  .openapi(readAllRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(eq(notifications.userId, user.id), eq(notifications.read, false)),
      );
    return c.json({ ok: true as const }, 200);
  })
  .openapi(prefsRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const row = await db
      .select()
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, user.id))
      .get();
    return c.json(
      {
        preferences: row
          ? {
              overage: row.overage,
              blackout: row.blackout,
              unitNotice: row.unitNotice,
            }
          : DEFAULT_PREFS,
      },
      200,
    );
  })
  .openapi(updatePrefsRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const now = new Date().toISOString();
    const existing = await db
      .select()
      .from(userNotificationPrefs)
      .where(eq(userNotificationPrefs.userId, user.id))
      .get();
    const next = {
      overage: input.overage ?? existing?.overage ?? DEFAULT_PREFS.overage,
      blackout: input.blackout ?? existing?.blackout ?? DEFAULT_PREFS.blackout,
      unitNotice:
        input.unitNotice ?? existing?.unitNotice ?? DEFAULT_PREFS.unitNotice,
    };
    await db
      .insert(userNotificationPrefs)
      .values({ userId: user.id, ...next, updatedAt: now })
      .onConflictDoUpdate({
        target: userNotificationPrefs.userId,
        set: { ...next, updatedAt: now },
      });
    return c.json({ preferences: next }, 200);
  });
