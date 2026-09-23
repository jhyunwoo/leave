import { createRoute, z } from "@hono/zod-openapi";
import {
  friendIdsSchema,
  friendRequestCreateSchema,
  friendSharingSchema,
  monthSchema,
} from "@leave/shared";
import {
  errorResponse,
  friendCalendarSchema,
  friendRequestSchema,
  friendSharingResponseSchema,
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
export const getFriendSharingRoute = createRoute({
  method: "get",
  path: "/sharing",
  tags: TAGS,
  summary: "친구에게 보여줄 항목",
  description:
    "설정한 적이 없으면 전부 공유한 것으로 답합니다. 모든 친구에게 같게 적용됩니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ sharing: friendSharingResponseSchema }),
      "공유 설정",
    ),
    401: authErrors[401],
  },
});
export const updateFriendSharingRoute = createRoute({
  method: "patch",
  path: "/sharing",
  tags: TAGS,
  summary: "친구에게 보여줄 항목 변경",
  description:
    "보낸 항목만 바꿉니다. 끈 항목은 친구 목록·달력·일정 응답에서 빠지고, 휴가 일정을 끄면 친구에게 가는 새 휴가 알림도 멈춥니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: friendSharingSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(
      z.object({ sharing: friendSharingResponseSchema }),
      "변경된 공유 설정",
    ),
    400: authErrors[400],
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

/**
 * 공개 사용자 이름으로 친구 요청.
 *
 * 이메일로 받던 것을 0023에서 바꿨다. 이메일로 요청할 수 있으면 응답이 곧
 * "이 주소로 가입했는가"에 대한 답이 되어 친구 찾기가 이메일 열거 수단이 된다.
 *
 * 반대 방향 요청이 이미 있으면 **친구로 만들지 않고** 409를 준다
 * (`incoming_request_exists`). 받는 사람이 수락을 누른 적 없이 일정이 공개되는
 * 일을 막기 위해서다 — 자세한 배경은 lib/social.ts 머리주석에 있다.
 */
export const sendFriendRequestRoute = createRoute({
  method: "post",
  path: "/requests",
  tags: TAGS,
  summary: "사용자 이름으로 친구 요청",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: friendRequestCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "요청 완료 (같은 방향 재요청은 멱등)"),
    ...authErrors,
    409: errorResponse("이미 친구이거나, 상대가 보낸 요청이 대기 중"),
  },
});
export const acceptFriendRequestRoute = createRoute({
  method: "post",
  path: "/requests/{userId}/accept",
  tags: TAGS,
  summary: "받은 친구 요청 수락",
  description:
    "받은 사람만 수락할 수 있습니다. 대기 중인 요청이 pending에서 accepted로 가는 유일한 경로입니다.",
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
  description:
    "관계는 사용자 쌍 한 행이라 어느 쪽이 지우든 양쪽 모두에게서 사라집니다. 삭제 직후의 일정 조회는 곧바로 403이 됩니다.",
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
