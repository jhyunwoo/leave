/**
 * 인증·프로필 라우트의 OpenAPI 명세.
 *
 * 사용처: apps/api/src/routes/auth.ts 가 여기 정의를 가져다 핸들러를 붙인다.
 *
 * 명세(경로·입력 스키마·응답 코드)와 구현(핸들러)을 한 파일에 두면, 한쪽을 읽는
 * 동안 다른 쪽을 계속 건너뛰게 된다. "이 API가 무엇을 약속하는가"만 모아 두면
 * 문서(/docs)와 클라이언트 타입의 출처를 한눈에 확인할 수 있다.
 * (같은 이유로 units.contract.ts, leaves.contract.ts도 같은 모양이다.)
 */

import { createRoute, z } from "@hono/zod-openapi";
import {
  loginSchema,
  onboardingProfileSchema,
  passwordChangeSchema,
  profileUpdateSchema,
  regularOvernightConfigSchema,
  signupSchema,
} from "@leave/shared";
import {
  activitySchema,
  authResponseSchema,
  errorResponse,
  jsonContent,
  myJoinRequestSchema,
  okSchema,
  unitSchema,
  userSchema,
} from "../lib/responses";

export const signupRoute = createRoute({
  method: "post",
  path: "/signup",
  tags: ["인증"],
  summary: "회원가입",
  request: {
    body: {
      content: { "application/json": { schema: signupSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(authResponseSchema, "가입 성공 (세션 토큰 포함)"),
    400: errorResponse("입력값 오류"),
    409: errorResponse("이미 가입된 이메일"),
  },
});

export const loginRoute = createRoute({
  method: "post",
  path: "/login",
  tags: ["인증"],
  summary: "로그인",
  request: {
    body: {
      content: { "application/json": { schema: loginSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(authResponseSchema, "로그인 성공"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("이메일 또는 비밀번호 불일치"),
  },
});

const onboardingStatusSchema = z.object({
  completed: z.boolean(),
  profile: z
    .object({
      name: z.string(),
      branch: z.enum(["army", "navy", "air_force"]),
      enlistedAt: z.string(),
      dischargeAt: z.string(),
      rank: z.enum(["private", "private_first", "corporal", "sergeant"]),
    })
    .nullable(),
  regularOvernight: z
    .object({
      enabled: z.boolean(),
      startDate: z.string().nullable(),
      intervalDays: z.number().nullable(),
      daysPerGrant: z.number().nullable(),
    })
    .nullable(),
  unitId: z.string().nullable(),
});

const meResponseSchema = z.object({
  user: userSchema,
  unit: unitSchema.nullable(),
  joinRequest: myJoinRequestSchema.nullable(),
});

export const authBootstrapRoute = createRoute({
  method: "get",
  path: "/bootstrap",
  tags: ["인증"],
  summary: "웹 앱 인증 부트스트랩 (온보딩 상태 + 내 정보)",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({
        onboarding: onboardingStatusSchema,
        me: meResponseSchema.nullable(),
      }),
      "인증 부트스트랩",
    ),
    401: errorResponse("인증 실패"),
  },
});

export const onboardingStatusRoute = createRoute({
  method: "get",
  path: "/onboarding",
  tags: ["인증"],
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(onboardingStatusSchema, "온보딩 상태"),
    401: errorResponse("인증 실패"),
  },
});

export const onboardingProfileRoute = createRoute({
  method: "put",
  path: "/onboarding/profile",
  tags: ["인증"],
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: onboardingProfileSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "복무정보 저장"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

export const onboardingRegularRoute = createRoute({
  method: "put",
  path: "/onboarding/regular-overnight",
  tags: ["인증"],
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: regularOvernightConfigSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "정기외박 설정 저장"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

export const onboardingCompleteRoute = createRoute({
  method: "post",
  path: "/onboarding/complete",
  tags: ["인증"],
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "온보딩 완료"),
    400: errorResponse("복무정보 미완료"),
    401: errorResponse("인증 실패"),
  },
});

export const logoutRoute = createRoute({
  method: "post",
  path: "/logout",
  tags: ["인증"],
  summary: "로그아웃",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "로그아웃 완료"),
    401: errorResponse("인증 실패"),
  },
});

export const meRoute = createRoute({
  method: "get",
  path: "/me",
  tags: ["인증"],
  summary: "내 정보 (계산된 현재 계급, 소속 부대 포함)",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(meResponseSchema, "내 정보"),
    401: errorResponse("인증 실패"),
    428: errorResponse("온보딩 미완료"),
  },
});

export const activityRoute = createRoute({
  method: "get",
  path: "/activity",
  tags: ["인증"],
  summary: "내 접속·푸시 기록 열람 (개인정보 열람권)",
  description:
    "동의 하에 수집된 내 접속 기록과 푸시 발송·수신 로그를 최근 순으로 최대 50건씩 돌려줍니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(activitySchema, "내 기록"),
    401: errorResponse("인증 실패"),
  },
});

export const updateProfileRoute = createRoute({
  method: "patch",
  path: "/me",
  tags: ["인증"],
  summary: "내 정보 수정 (별칭·군 종류·입대일·전역예정일·계급)",
  description:
    "보낸 항목만 바꿉니다. 표시 계급은 입대일에서 다시 계산되므로, 입대일을 바꾸면 계급 표시도 함께 바뀝니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: profileUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ user: userSchema }), "수정된 내 정보"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
  },
});

export const changePasswordRoute = createRoute({
  method: "post",
  path: "/me/password",
  tags: ["인증"],
  summary: "비밀번호 변경",
  description:
    "현재 비밀번호를 확인한 뒤 바꿉니다. 성공하면 기존 세션이 모두 끊기고 새 토큰을 돌려줍니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: passwordChangeSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(
      z.object({ token: z.string() }),
      "변경 완료. 이 기기에서 계속 쓸 새 토큰",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패 또는 현재 비밀번호 불일치"),
  },
});

export const deleteAccountRoute = createRoute({
  method: "delete",
  path: "/account",
  tags: ["인증"],
  summary: "계정 삭제 (관련 데이터 전체 삭제)",
  description:
    "내 계정과 등록한 휴가·알림·세션·접속/푸시 기록·프로필 이미지를 모두 삭제합니다. 되돌릴 수 없습니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
  },
});
