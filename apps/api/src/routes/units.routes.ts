/**
 * 그룹(부대) 라우트의 OpenAPI 명세.
 *
 * 사용처: apps/api/src/routes/units.ts 가 여기 정의를 가져다 핸들러를 붙인다.
 *
 * 명세(경로·입력 스키마·응답 코드)와 구현(핸들러)을 한 파일에 두면, 한쪽을 읽는
 * 동안 다른 쪽을 계속 건너뛰게 된다. "이 API가 무엇을 약속하는가"만 모아 두면
 * 문서(/docs)와 클라이언트 타입의 출처를 한눈에 확인할 수 있다.
 */
import { createRoute, z } from "@hono/zod-openapi";
import {
  blackoutCreateSchema,
  monthSchema,
  unitCreateSchema,
  unitInviteCreateSchema,
  unitJoinSchema,
  unitTransferSchema,
  unitUpdateSchema,
} from "@leave/shared";
import {
  blackoutSchema,
  calendarSchema,
  errorResponse,
  issuedUnitInviteSchema,
  jsonContent,
  memberSchema,
  okSchema,
  unitSchema,
} from "../lib/responses";

const TAGS = ["부대"];

/** /units/{id} 형태의 경로 파라미터. */
const idParam = z.object({ id: z.string() });
/** /units/{id}/members/{userId} 형태의 경로 파라미터. */
const memberParam = z.object({ id: z.string(), userId: z.string() });

export const createUnitRoute = createRoute({
  method: "post",
  path: "/",
  tags: TAGS,
  summary: "비식별 그룹 생성 (생성자는 자동 가입·관리자)",
  description:
    "이름과 설명에 실제 부대명·부대번호·주소·위치, 병력 현황, 작전·훈련 정보를 입력하면 안 됩니다. 그룹 이름은 검색·색인되지 않으며 중복될 수 있습니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: unitCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(
      z.object({ unit: unitSchema, invite: issuedUnitInviteSchema }),
      "생성된 그룹과 한 번만 노출되는 초대코드",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    409: errorResponse("이미 다른 그룹 소속"),
  },
});

export const getUnitRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: TAGS,
  summary: "부대 상세",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "부대 정보"),
    401: errorResponse("인증 실패"),
    403: errorResponse("현재 부대원만 조회 가능"),
    404: errorResponse("부대 없음"),
  },
});

export const updateUnitRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: TAGS,
  summary: "부대 정보 수정 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: unitUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "수정된 부대"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 수정 가능"),
    404: errorResponse("부대 없음"),
  },
});

export const joinRoute = createRoute({
  method: "post",
  path: "/join",
  tags: TAGS,
  summary: "초대코드로 그룹에 즉시 가입",
  description:
    "그룹 이름이나 UUID로는 가입할 수 없습니다. 유효하고 만료·소진·폐기되지 않은 초대코드만 사용할 수 있습니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: unitJoinSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(
      z.object({ joined: z.literal(true), unit: unitSchema }),
      "즉시 가입 완료",
    ),
    400: errorResponse("유효하지 않은 초대코드"),
    401: errorResponse("인증 실패"),
    409: errorResponse("이미 다른 그룹 소속"),
  },
});

export const rotateInviteRoute = createRoute({
  method: "post",
  path: "/{id}/invite",
  tags: TAGS,
  summary: "초대코드 회전·재발급 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: unitInviteCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(
      z.object({ invite: issuedUnitInviteSchema }),
      "재발급된 초대코드",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("현재 그룹 관리자만 가능"),
  },
});

export const removeMemberRoute = createRoute({
  method: "post",
  path: "/{id}/members/{userId}/remove",
  tags: TAGS,
  summary: "부대원 제거 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: { params: memberParam },
  responses: {
    200: jsonContent(okSchema, "제거 완료"),
    400: errorResponse("자기 자신은 제거 불가"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 가능"),
    404: errorResponse("부대원 없음"),
  },
});

export const transferRoute = createRoute({
  method: "post",
  path: "/{id}/transfer",
  tags: TAGS,
  summary: "관리자 이관 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: unitTransferSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "이관 완료"),
    400: errorResponse("대상이 부대원이 아님"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 가능"),
    404: errorResponse("부대 없음"),
  },
});

export const leaveUnitRoute = createRoute({
  method: "post",
  path: "/leave",
  tags: TAGS,
  summary: "부대 탈퇴",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "탈퇴 완료"),
    401: errorResponse("인증 실패"),
    409: errorResponse("관리자는 이관 후 나갈 수 있음"),
  },
});

export const membersRoute = createRoute({
  method: "get",
  path: "/{id}/members",
  tags: TAGS,
  summary: "부대원 목록 (자동 계산된 계급 포함)",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(z.object({ members: z.array(memberSchema) }), "부대원"),
    401: errorResponse("인증 실패"),
    403: errorResponse("부대원만 조회 가능"),
  },
});

export const calendarRoute = createRoute({
  method: "get",
  path: "/{id}/calendar",
  tags: TAGS,
  summary: "부대 월별 휴가 달력 (일별 출타 인원·초과 여부 포함)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    query: z.object({ month: monthSchema }),
  },
  responses: {
    200: jsonContent(calendarSchema, "달력 데이터"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("부대원만 조회 가능"),
    404: errorResponse("부대 없음"),
  },
});

export const blackoutsRoute = createRoute({
  method: "get",
  path: "/{id}/blackouts",
  tags: TAGS,
  summary: "블랙아웃 기간 목록",
  description:
    "검열·훈련 등으로 출타율과 무관하게 휴가가 제한될 수 있는 기간입니다.",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(
      z.object({ blackouts: z.array(blackoutSchema) }),
      "블랙아웃 목록",
    ),
    401: errorResponse("인증 실패"),
    403: errorResponse("부대원만 조회 가능"),
  },
});

export const createBlackoutRoute = createRoute({
  method: "post",
  path: "/{id}/blackouts",
  tags: TAGS,
  summary: "블랙아웃 기간 등록 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: blackoutCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(z.object({ blackout: blackoutSchema }), "등록된 기간"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 등록 가능"),
  },
});

export const deleteBlackoutRoute = createRoute({
  method: "delete",
  path: "/{id}/blackouts/{blackoutId}",
  tags: TAGS,
  summary: "블랙아웃 기간 삭제 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string(), blackoutId: z.string() }),
  },
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 삭제 가능"),
    404: errorResponse("기간 없음"),
  },
});
