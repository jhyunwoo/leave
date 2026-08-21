/**
 * 알림함·알림 설정 라우트.
 *
 * 마운트 위치: `/notifications` (apps/api/src/index.ts).
 * 알림 본문은 서버가 만들고(lib/overage.ts) 여기서는 조회·읽음 처리·삭제·수신 설정만 한다.
 *
 * 삭제는 soft delete다 — `deletedAt`을 찍고 행은 남긴다. 그래서 여기의 모든 조회는
 * `isNull(notifications.deletedAt)`을 함께 걸어야 한다. 하나라도 빠뜨리면 지운 알림이
 * 목록에 되살아나거나 탭 배지의 안 읽음 수에 남는다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { notificationPrefsSchema } from "@leave/shared";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
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
import { onboardingMiddleware } from "../middleware/onboarding";

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

const summaryRoute = createRoute({
  method: "get",
  path: "/summary",
  tags: ["알림"],
  summary: "읽지 않은 알림 수",
  description:
    "상단 배지처럼 목록 본문이 필요 없는 화면에서 사용하는 경량 폴링 응답입니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ unreadCount: z.number() }),
      "읽지 않은 알림 수",
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

const deleteRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["알림"],
  summary: "알림 삭제",
  description: "내 알림함에서만 지웁니다. 되돌릴 수 없습니다.",
  security: [{ Bearer: [] }],
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
    404: errorResponse("알림 없음 또는 권한 없음"),
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

function parseDates(row: Pick<NotificationRow, "datesJson">): string[] {
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
app.use("*", onboardingMiddleware);

export const notificationRoutes = app
  .openapi(listRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    // 목록과 안 읽음 수는 서로를 기다릴 이유가 없다 — 한 번의 왕복으로 묶는다.
    const [rows, unread] = await db.batch([
      db
        .select({
          id: notifications.id,
          title: notifications.title,
          body: notifications.body,
          leaveId: notifications.leaveId,
          datesJson: notifications.datesJson,
          read: notifications.read,
          createdAt: notifications.createdAt,
        })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, user.id),
            isNull(notifications.deletedAt),
          ),
        )
        .orderBy(desc(notifications.createdAt))
        .limit(50),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(notifications)
        .where(
          and(
            eq(notifications.userId, user.id),
            eq(notifications.read, false),
            isNull(notifications.deletedAt),
          ),
        ),
    ]);
    const unreadCount = unread[0]?.count ?? 0;
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
  .openapi(summaryRoute, async (c) => {
    const user = c.get("user");
    const row = await drizzle(c.env.DB)
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.read, false),
          isNull(notifications.deletedAt),
        ),
      )
      .get();
    return c.json({ unreadCount: row?.count ?? 0 }, 200);
  })
  .openapi(readAllRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db
      .update(notifications)
      .set({ read: true })
      .where(
        and(
          eq(notifications.userId, user.id),
          eq(notifications.read, false),
          isNull(notifications.deletedAt),
        ),
      );
    return c.json({ ok: true as const }, 200);
  })
  .openapi(deleteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    // 남의 알림도 없는 알림과 똑같이 404로 답한다 — id의 존재 여부를 알려주지 않는다.
    const existing = await db
      .select({ id: notifications.id })
      .from(notifications)
      .where(
        and(
          eq(notifications.id, id),
          eq(notifications.userId, user.id),
          isNull(notifications.deletedAt),
        ),
      )
      .get();
    if (!existing) {
      return c.json({ error: "알림을 찾을 수 없습니다" }, 404);
    }
    await db
      .update(notifications)
      .set({ deletedAt: new Date().toISOString() })
      .where(eq(notifications.id, id));
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
