/**
 * 외부 캘린더 구독 링크 관리와 내보낼 일정 조회.
 *
 * 마운트 위치: `/calendar-feed` (apps/api/src/index.ts). 명세는 ./calendar-feed.contract.ts.
 */
import { todayInSeoul } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { calendarFeeds } from "../db/schema";
import { createApp } from "../lib/app";
import { feedUrlFor, loadFeedItems } from "../lib/calendar-feed";
import { generateSessionToken } from "../lib/crypto";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";
import {
  createCalendarFeedRoute,
  deleteCalendarFeedRoute,
  getCalendarFeedRoute,
  listCalendarFeedItemsRoute,
} from "./calendar-feed.contract";

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);

/**
 * 링크 주소. 인증 메일 링크와 같은 이유로 요청 주소가 아니라 `API_ORIGIN`을 쓴다 —
 * wrangler dev는 요청 주소를 커스텀 도메인으로 바꿔 보낸다.
 */
function originOf(env: { API_ORIGIN?: string }, requestUrl: string): string {
  return env.API_ORIGIN ?? new URL(requestUrl).origin;
}

export const calendarFeedRoutes = app
  .openapi(getCalendarFeedRoute, async (c) => {
    const [row] = await drizzle(c.env.DB)
      .select({ token: calendarFeeds.token })
      .from(calendarFeeds)
      .where(eq(calendarFeeds.userId, c.get("user").id))
      .limit(1);
    return c.json(
      {
        url: row ? feedUrlFor(originOf(c.env, c.req.url), row.token) : null,
      },
      200,
    );
  })
  .openapi(createCalendarFeedRoute, async (c) => {
    const token = generateSessionToken();
    const createdAt = new Date().toISOString();
    await drizzle(c.env.DB)
      .insert(calendarFeeds)
      .values({ userId: c.get("user").id, token, createdAt })
      .onConflictDoUpdate({
        target: calendarFeeds.userId,
        set: { token, createdAt },
      });
    return c.json({ url: feedUrlFor(originOf(c.env, c.req.url), token) }, 200);
  })
  .openapi(deleteCalendarFeedRoute, async (c) => {
    await drizzle(c.env.DB)
      .delete(calendarFeeds)
      .where(eq(calendarFeeds.userId, c.get("user").id));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(listCalendarFeedItemsRoute, async (c) => {
    const items = await loadFeedItems(
      drizzle(c.env.DB),
      c.get("user").id,
      todayInSeoul(),
    );
    return c.json({ items }, 200);
  });
