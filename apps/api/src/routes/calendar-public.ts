/**
 * 외부 캘린더 구독 피드 — 로그인 없이 토큰 주소로 받는 iCalendar.
 *
 * 마운트 위치: `/calendar` (apps/api/src/index.ts). 링크 관리는 routes/calendar-feed.ts.
 *
 * 토큰이 곧 열쇠다. 모르는 토큰은 이유를 붙이지 않고 404로 돌려보낸다.
 *
 * rate limit을 토큰 주인 단위로 거는 이유: `rateLimit`은 비로그인 요청을 IP로 세는데,
 * 구글 캘린더는 모든 사용자의 피드를 같은 구글 IP 대역에서 받아 간다. IP로 세면 한
 * 사람의 피드가 모두의 갱신을 막는다. 그래서 토큰으로 주인을 먼저 찾아 `user`에 넣고
 * 같은 미들웨어를 건다 — 접속 기록도 그 사용자의 동의 여부를 그대로 따른다.
 */
import { renderIcs, todayInSeoul } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { calendarFeeds, users } from "../db/schema";
import { createApp, type AppEnv } from "../lib/app";
import { loadFeedItems } from "../lib/calendar-feed";
import { rateLimit } from "../middleware/rate-limit";

const FEED_FILE_RE = /^([A-Za-z0-9_-]{20,100})\.ics$/;
const NOT_FOUND = { error: "요청한 리소스를 찾을 수 없습니다" } as const;

const resolveFeedOwner = createMiddleware<AppEnv>(async (c, next) => {
  const match = FEED_FILE_RE.exec(c.req.param("file") ?? "");
  if (!match) return c.json(NOT_FOUND, 404);
  const [row] = await drizzle(c.env.DB)
    .select({ user: users })
    .from(calendarFeeds)
    .innerJoin(users, eq(users.id, calendarFeeds.userId))
    .where(eq(calendarFeeds.token, match[1]!))
    .limit(1);
  if (!row) return c.json(NOT_FOUND, 404);
  c.set("user", row.user);
  return next();
});

const app = createApp();

export const calendarPublicRoutes = app.get(
  "/:file",
  resolveFeedOwner,
  rateLimit({ name: "calendar-feed", limit: 60, windowSeconds: 600 }),
  async (c) => {
    const items = await loadFeedItems(
      drizzle(c.env.DB),
      c.get("user").id,
      todayInSeoul(),
    );
    return c.body(
      renderIcs(items, { calendarName: "리브", now: new Date() }),
      200,
      {
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "private, max-age=300",
      },
    );
  },
);
