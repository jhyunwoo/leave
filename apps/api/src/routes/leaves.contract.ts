/**
 * 휴가·보유 휴가 라우트의 OpenAPI 명세.
 *
 * 사용처: apps/api/src/routes/leaves.ts 가 여기 정의를 가져다 핸들러를 붙인다.
 * 같은 이유·같은 모양의 파일이 auth.contract.ts, units.contract.ts에도 있다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import {
  leaveBalanceUpdateSchema,
  leaveCreateSchema,
  leaveGrantCreateSchema,
  leaveGrantUpdateSchema,
  leaveStatusUpdateSchema,
  leaveUpdateSchema,
  regularOvernightConfigSchema,
} from "@leave/shared";
import {
  errorResponse,
  jsonContent,
  leaveBalanceSummarySchema,
  leaveGrantsPageSchema,
  leaveSchema,
  okSchema,
} from "../lib/responses";

export const idParam = z.object({ id: z.string() });

/** 등록/수정 응답: 휴가 + 그로 인해 최대 출타 인원이 초과된 날짜 목록. */
export const leaveResultSchema = z.object({
  leave: leaveSchema,
  exceededDates: z.array(z.string()),
});

export const mineRoute = createRoute({
  method: "get",
  path: "/mine",
  tags: ["휴가"],
  summary: "내 휴가 목록",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(z.object({ leaves: z.array(leaveSchema) }), "내 휴가"),
    401: errorResponse("인증 실패"),
  },
});

export const balancesRoute = createRoute({
  method: "get",
  path: "/balances",
  tags: ["휴가"],
  summary: "내 휴가 재원 총량·사용량·잔여량",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(leaveBalanceSummarySchema, "휴가 재원 현황"),
    401: errorResponse("인증 실패"),
  },
});

export const updateBalancesRoute = createRoute({
  method: "put",
  path: "/balances",
  tags: ["휴가"],
  summary: "내 휴가 재원 총량 수정 (구버전 앱 호환)",
  description:
    "만기 없는 기본 적립분 하나를 늘리고 줄인다. 만기가 있는 적립분은 /leaves/grants에서만 다룬다.",
  deprecated: true,
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: leaveBalanceUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveBalanceSummarySchema, "수정된 휴가 재원 현황"),
    400: errorResponse("이미 사용한 일수보다 작게 설정"),
    401: errorResponse("인증 실패"),
  },
});

export const regularOvernightRoute = createRoute({
  method: "put",
  path: "/regular-overnight",
  tags: ["휴가"],
  summary: "정기외박 자동 적립 설정",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        "application/json": { schema: regularOvernightConfigSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveBalanceSummarySchema, "정기외박 설정"),
    400: errorResponse("입력값 오류 또는 지원하지 않는 군종"),
    401: errorResponse("인증 실패"),
  },
});

export const grantsRoute = createRoute({
  method: "get",
  path: "/grants",
  tags: ["휴가"],
  summary: "보유 휴가 — 적립분·주기 현황",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(leaveGrantsPageSchema, "보유 휴가 현황"),
    401: errorResponse("인증 실패"),
  },
});

export const createGrantRoute = createRoute({
  method: "post",
  path: "/grants",
  tags: ["휴가"],
  summary: "적립분 추가",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: leaveGrantCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(leaveGrantsPageSchema, "추가 후 보유 휴가 현황"),
    400: errorResponse("입력값 오류 또는 자동 적립 재원"),
    401: errorResponse("인증 실패"),
  },
});

export const updateGrantRoute = createRoute({
  method: "patch",
  path: "/grants/{id}",
  tags: ["휴가"],
  summary: "적립분 수정",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: leaveGrantUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveGrantsPageSchema, "수정 후 보유 휴가 현황"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    404: errorResponse("적립분 없음 또는 권한 없음"),
  },
});

export const deleteGrantRoute = createRoute({
  method: "delete",
  path: "/grants/{id}",
  tags: ["휴가"],
  summary: "적립분 삭제",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(leaveGrantsPageSchema, "삭제 후 보유 휴가 현황"),
    401: errorResponse("인증 실패"),
    404: errorResponse("적립분 없음 또는 권한 없음"),
  },
});

export const createLeaveRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["휴가"],
  summary: "휴가 등록 (제목·시작일·종료일 필수, 사유 선택)",
  description:
    "등록으로 특정 날짜의 최대 출타 인원이 초과되면 해당 날짜에 휴가 중인 모든 부대원에게 알림이 전송됩니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: leaveCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(leaveResultSchema, "등록된 휴가 + 초과일"),
    400: errorResponse("입력값 오류 또는 소속 부대 없음"),
    401: errorResponse("인증 실패"),
  },
});

export const updateLeaveRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["휴가"],
  summary: "휴가 수정",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: leaveUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveResultSchema, "수정된 휴가 + 초과일"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    404: errorResponse("휴가 없음 또는 권한 없음"),
  },
});

export const updateLeaveStatusRoute = createRoute({
  method: "patch",
  path: "/{id}/status",
  tags: ["휴가"],
  summary: "내 휴가 상태 빠른 변경",
  description:
    "제목·기간·구간은 유지하고 사용자가 직접 고를 수 있는 진행 상태만 변경합니다.",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: leaveStatusUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveResultSchema, "상태가 변경된 휴가 + 초과일"),
    400: errorResponse("종료 상태 또는 휴가 규칙 위반"),
    401: errorResponse("인증 실패"),
    404: errorResponse("휴가 없음 또는 권한 없음"),
  },
});

export const deleteLeaveRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["휴가"],
  summary: "휴가 삭제",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
    404: errorResponse("휴가 없음 또는 권한 없음"),
  },
});
