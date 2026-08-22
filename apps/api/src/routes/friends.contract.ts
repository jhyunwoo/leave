import { createRoute, z } from "@hono/zod-openapi";
import {
  friendIdsSchema,
  friendRequestCreateSchema,
  monthSchema,
} from "@leave/shared";
import {
  errorResponse,
  friendCalendarSchema,
  friendRequestSchema,
  friendSummarySchema,
  jsonContent,
  okSchema,
} from "../lib/responses";

const TAGS = ["친구"];
const userIdParam = z.object({ userId: z.string().min(1).max(100) });
const friendIdsQuerySchema = z
  .string()
  .transform((value) => value.split(","))
  .pipe(friendIdsSchema);
const monthsQuerySchema = z.string().refine((value) => {
  const months = value.split(",");
  const ordinals = months
    .map((month) => monthSchema.safeParse(month))
    .filter((result) => result.success)
    .map((result) => {
      const [year, month] = result.data.split("-").map(Number);
      return year! * 12 + month!;
    });
  return (
    months.length >= 1 &&
    months.length <= 9 &&
    new Set(months).size === months.length &&
    ordinals.length === months.length &&
    Math.max(...ordinals) - Math.min(...ordinals) <= 8
  );
}, "months는 9개월 범위 안의 중복 없는 YYYY-MM 목록이어야 합니다");

const authErrors = {
  400: errorResponse("입력값 오류"),
  401: errorResponse("인증 실패"),
  403: errorResponse("친구 권한 없음"),
  404: errorResponse("대상 없음"),
};

export const listFriendsRoute = createRoute({
  method: "get",
  path: "/",
  tags: TAGS,
  summary: "친구 목록",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ friends: z.array(friendSummarySchema) }),
      "친구 목록",
    ),
    401: authErrors[401],
  },
});
export const listIncomingRoute = createRoute({
  method: "get",
  path: "/requests/incoming",
  tags: TAGS,
  summary: "받은 친구 요청",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ requests: z.array(friendRequestSchema) }),
      "받은 요청",
    ),
    401: authErrors[401],
  },
});
export const listOutgoingRoute = createRoute({
  method: "get",
  path: "/requests/outgoing",
  tags: TAGS,
  summary: "보낸 친구 요청",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ requests: z.array(friendRequestSchema) }),
      "보낸 요청",
    ),
    401: authErrors[401],
  },
});
export const sendFriendRequestRoute = createRoute({
  method: "post",
  path: "/requests",
  tags: TAGS,
  summary: "정확한 이메일로 친구 요청",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: friendRequestCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "요청 또는 상호 요청 수락 완료"),
    ...authErrors,
    409: errorResponse("이미 친구임"),
  },
});
export const acceptFriendRequestRoute = createRoute({
  method: "post",
  path: "/requests/{userId}/accept",
  tags: TAGS,
  summary: "친구 요청 수락",
  security: [{ Bearer: [] }],
  request: { params: userIdParam },
  responses: { 200: jsonContent(okSchema, "수락 완료"), ...authErrors },
});
export const declineFriendRequestRoute = createRoute({
  method: "delete",
  path: "/requests/incoming/{userId}",
  tags: TAGS,
  summary: "받은 친구 요청 거절",
  security: [{ Bearer: [] }],
  request: { params: userIdParam },
  responses: { 200: jsonContent(okSchema, "거절 완료"), ...authErrors },
});
export const cancelFriendRequestRoute = createRoute({
  method: "delete",
  path: "/requests/outgoing/{userId}",
  tags: TAGS,
  summary: "보낸 친구 요청 취소",
  security: [{ Bearer: [] }],
  request: { params: userIdParam },
  responses: { 200: jsonContent(okSchema, "취소 완료"), ...authErrors },
});
export const removeFriendRoute = createRoute({
  method: "delete",
  path: "/{userId}",
  tags: TAGS,
  summary: "친구 삭제",
  security: [{ Bearer: [] }],
  request: { params: userIdParam },
  responses: { 200: jsonContent(okSchema, "삭제 완료"), ...authErrors },
});
export const friendScheduleRoute = createRoute({
  method: "get",
  path: "/{userId}/schedule",
  tags: TAGS,
  summary: "친구의 공유 가능한 휴가 일정",
  security: [{ Bearer: [] }],
  request: {
    params: userIdParam,
    query: z.object({ startDate: z.string(), endDate: z.string() }),
  },
  responses: {
    200: jsonContent(friendCalendarSchema.omit({ month: true }), "친구 일정"),
    ...authErrors,
  },
});
export const friendCalendarRoute = createRoute({
  method: "get",
  path: "/calendar",
  tags: TAGS,
  summary: "나와 선택한 친구들의 월 달력",
  security: [{ Bearer: [] }],
  request: {
    query: z.object({ friendIds: friendIdsQuerySchema, month: monthSchema }),
  },
  responses: {
    200: jsonContent(friendCalendarSchema, "친구 달력"),
    ...authErrors,
  },
});
export const friendCalendarsRoute = createRoute({
  method: "get",
  path: "/calendars",
  tags: TAGS,
  summary: "나와 선택한 친구들의 월 달력 묶음",
  security: [{ Bearer: [] }],
  request: {
    query: z.object({
      friendIds: friendIdsQuerySchema,
      months: monthsQuerySchema,
    }),
  },
  responses: {
    200: jsonContent(
      z.object({ calendars: z.array(friendCalendarSchema) }),
      "친구 달력 묶음",
    ),
    ...authErrors,
  },
});
