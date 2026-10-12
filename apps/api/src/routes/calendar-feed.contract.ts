/**
 * 외부 캘린더 구독 링크 라우트의 OpenAPI 명세.
 *
 * 사용처: apps/api/src/routes/calendar-feed.ts. 무인증 피드 자체는
 * routes/calendar-public.ts에 있다 — 캘린더 앱이 받아 가는 iCalendar라 이 명세의
 * JSON 계약에 들지 않는다.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { errorResponse, jsonContent, okSchema } from "../lib/responses";
import { rateLimit } from "../middleware/rate-limit";

const TAGS = ["외부 캘린더"];

const feedItemSchema = z
  .object({
    uid: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    startDate: z.string(),
    endDate: z.string(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
  })
  .openapi("CalendarFeedItem");

export const getCalendarFeedRoute = createRoute({
  method: "get",
  path: "/",
  tags: TAGS,
  summary: "내 구독 링크",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ url: z.string().nullable() }),
      "구독 링크. 꺼져 있으면 null",
    ),
    401: errorResponse("인증 실패"),
  },
});

export const createCalendarFeedRoute = createRoute({
  method: "post",
  path: "/",
  tags: TAGS,
  summary: "구독 링크 만들기·재발급",
  description:
    "이미 있으면 토큰을 새로 만들어 덮어씁니다. 예전 링크는 즉시 더 이상 열리지 않습니다.",
  security: [{ Bearer: [] }],
  middleware: [
    rateLimit({ name: "calendar-feed-rotate", limit: 10, windowSeconds: 600 }),
  ] as const,
  responses: {
    200: jsonContent(z.object({ url: z.string() }), "새 구독 링크"),
    401: errorResponse("인증 실패"),
    429: errorResponse("요청이 너무 잦음"),
  },
});

export const deleteCalendarFeedRoute = createRoute({
  method: "delete",
  path: "/",
  tags: TAGS,
  summary: "구독 링크 끄기",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "꺼짐"),
    401: errorResponse("인증 실패"),
  },
});

export const listCalendarFeedItemsRoute = createRoute({
  method: "get",
  path: "/items",
  tags: TAGS,
  summary: "외부 캘린더로 내보낼 내 일정",
  description:
    "구독 피드와 같은 항목입니다. 안드로이드 앱이 기기 캘린더에 쓸 때 사용합니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(z.object({ items: z.array(feedItemSchema) }), "일정"),
    401: errorResponse("인증 실패"),
  },
});
