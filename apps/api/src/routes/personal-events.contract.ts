import { createRoute, z } from "@hono/zod-openapi";
import {
  monthSchema,
  personalEventCreateSchema,
  personalEventUpdateSchema,
} from "@leave/shared";
import {
  errorResponse,
  jsonContent,
  okSchema,
  personalEventSchema,
} from "../lib/responses";

const TAGS = ["개인 일정"];
const idParam = z.object({ id: z.string().min(1).max(100) });
const monthsSchema = z.string().refine((value) => {
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
const errors = {
  400: errorResponse("입력값 오류"),
  401: errorResponse("인증 실패"),
  404: errorResponse("일정 없음 또는 권한 없음"),
};

export const listPersonalEventsRoute = createRoute({
  method: "get",
  path: "/",
  tags: TAGS,
  summary: "내 개인 일정 월별 조회",
  security: [{ Bearer: [] }],
  request: { query: z.object({ month: monthSchema }) },
  responses: {
    200: jsonContent(
      z.object({ events: z.array(personalEventSchema) }),
      "개인 일정",
    ),
    400: errors[400],
    401: errors[401],
  },
});
export const listPersonalEventCalendarsRoute = createRoute({
  method: "get",
  path: "/calendars",
  tags: TAGS,
  summary: "내 개인 일정 여러 달 조회",
  security: [{ Bearer: [] }],
  request: { query: z.object({ months: monthsSchema }) },
  responses: {
    200: jsonContent(
      z.object({ events: z.array(personalEventSchema) }),
      "개인 일정",
    ),
    400: errors[400],
    401: errors[401],
  },
});
export const getPersonalEventRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: TAGS,
  summary: "내 개인 일정 상세",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(z.object({ event: personalEventSchema }), "개인 일정"),
    401: errors[401],
    404: errors[404],
  },
});
export const createPersonalEventRoute = createRoute({
  method: "post",
  path: "/",
  tags: TAGS,
  summary: "개인 일정 등록",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: personalEventCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(z.object({ event: personalEventSchema }), "등록된 일정"),
    400: errors[400],
    401: errors[401],
  },
});
export const updatePersonalEventRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: TAGS,
  summary: "개인 일정 수정",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: personalEventUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ event: personalEventSchema }), "수정된 일정"),
    ...errors,
  },
});
export const deletePersonalEventRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: TAGS,
  summary: "개인 일정 삭제",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errors[401],
    404: errors[404],
  },
});
