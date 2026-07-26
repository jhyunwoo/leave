import { z } from "@hono/zod-openapi";
import {
  BALANCE_KEYS,
  BRANCHES,
  LEAVE_CATEGORIES,
  OVERNIGHT_KINDS,
  RANKS,
} from "@leave/shared";

export const errorSchema = z
  .object({ error: z.string() })
  .openapi("ErrorResponse");

export const okSchema = z.object({ ok: z.literal(true) }).openapi("Ok");

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    branch: z.enum(BRANCHES),
    branchLabel: z.string(),
    enlistedAt: z.string(),
    dischargeAt: z.string(),
    unitId: z.string().nullable(),
    profileImageKey: z.string().nullable(),
    rank: z.enum(RANKS),
    rankLabel: z.string(),
    nextPromotionDate: z.string().nullable(),
    serviceProgress: z.number(),
    daysUntilDischarge: z.number(),
  })
  .openapi("User");

export const memberSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    branch: z.enum(BRANCHES),
    branchLabel: z.string(),
    rank: z.enum(RANKS),
    rankLabel: z.string(),
    profileImageKey: z.string().nullable(),
    enlistedAt: z.string(),
    dischargeAt: z.string(),
  })
  .openapi("Member");

export const unitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    maxLeaveNumerator: z.number(),
    maxLeaveDenominator: z.number(),
    // 앱 가입자 수.
    memberCount: z.number(),
    // 부대 관리자 사용자 id.
    adminId: z.string(),
    // 관리자가 설정한 부대 인원(출타율 기준). 미설정이면 null → 가입자 수 사용.
    headcount: z.number().nullable(),
    // 부대 대표 이미지 R2 키.
    imageKey: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("Unit");

/** 대기 중인 부대 가입 신청(관리자 조회용). */
export const joinRequestSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    branch: z.enum(BRANCHES),
    branchLabel: z.string(),
    rank: z.enum(RANKS),
    rankLabel: z.string(),
    profileImageKey: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("JoinRequest");

/** 내가 낸 가입 신청 요약(/auth/me). */
export const myJoinRequestSchema = z
  .object({
    unitId: z.string(),
    unitName: z.string(),
    createdAt: z.string(),
  })
  .openapi("MyJoinRequest");

export const leaveAllocationResponseSchema = z.object({
  category: z.enum(LEAVE_CATEGORIES),
  days: z.number(),
  overnightKind: z.enum(OVERNIGHT_KINDS).optional(),
});

export const leaveSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
    allocations: z.array(leaveAllocationResponseSchema),
    createdAt: z.string(),
  })
  .openapi("Leave");

export const calendarLeaveSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    userName: z.string(),
    userRankLabel: z.string(),
    userProfileImageKey: z.string().nullable(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
    allocations: z.array(leaveAllocationResponseSchema),
  })
  .openapi("CalendarLeave");

export const dayStatSchema = z
  .object({
    date: z.string(),
    userIds: z.array(z.string()),
    count: z.number(),
    allowed: z.number(),
    exceeded: z.boolean(),
  })
  .openapi("DayStat");

export const calendarSchema = z
  .object({
    month: z.string(),
    unit: unitSchema,
    days: z.array(dayStatSchema),
    leaves: z.array(calendarLeaveSchema),
  })
  .openapi("UnitCalendar");

export const notificationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    leaveId: z.string().nullable(),
    dates: z.array(z.string()),
    read: z.boolean(),
    createdAt: z.string(),
  })
  .openapi("Notification");

export const leaveBalanceItemSchema = z.object({
  key: z.enum(BALANCE_KEYS),
  label: z.string(),
  totalDays: z.number(),
  usedDays: z.number(),
  remainingDays: z.number(),
  automaticDays: z.number(),
});

export const leaveBalanceSummarySchema = z
  .object({
    balances: z.array(leaveBalanceItemSchema),
    regularOvernight: z.object({
      enabled: z.boolean(),
      nextGrantDate: z.string().nullable(),
      intervalDays: z.number().nullable(),
      daysPerGrant: z.number().nullable(),
    }),
  })
  .openapi("LeaveBalanceSummary");

export const authResponseSchema = z
  .object({
    token: z.string(),
    user: userSchema,
  })
  .openapi("AuthResponse");

export const accessLogSchema = z
  .object({
    id: z.string(),
    method: z.string(),
    path: z.string(),
    status: z.number(),
    platform: z.string().nullable(),
    appVersion: z.string().nullable(),
    ip: z.string().nullable(),
    country: z.string().nullable(),
    durationMs: z.number().nullable(),
    createdAt: z.string(),
  })
  .openapi("AccessLog");

export const pushLogSchema = z
  .object({
    id: z.string(),
    notificationId: z.string().nullable(),
    direction: z.enum(["send", "receipt", "open"]),
    title: z.string().nullable(),
    body: z.string().nullable(),
    status: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("PushLog");

/** 내가 수집된 접속·푸시 기록을 열람하는 응답(개인정보 열람권). */
export const activitySchema = z
  .object({
    accessLogs: z.array(accessLogSchema),
    pushLogs: z.array(pushLogSchema),
  })
  .openapi("Activity");

export const jsonContent = <T extends z.ZodType>(
  schema: T,
  description: string,
) => ({
  content: { "application/json": { schema } },
  description,
});

export const errorResponse = (description: string) =>
  jsonContent(errorSchema, description);
