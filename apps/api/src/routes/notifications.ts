import { createRoute, z } from "@hono/zod-openapi";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { notifications, type NotificationRow } from "../db/schema";
import { createApp } from "../lib/app";
import {
  errorResponse,
  jsonContent,
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

function parseDates(row: NotificationRow): string[] {
  if (!row.datesJson) return [];
  try {
    const parsed: unknown = JSON.parse(row.datesJson);
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
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
  });
