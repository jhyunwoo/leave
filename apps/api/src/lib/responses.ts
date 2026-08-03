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
    // 부대 관리자가 지정한 하루 최대 출타 인원.
    maxLeaveCount: z.number(),
    // 앱 가입자 수.
    memberCount: z.number(),
    // 부대 관리자 사용자 id.
    adminId: z.string(),
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

/** 어느 날이 어떤 재원인지 알려주는 구간. */
export const leaveSegmentResponseSchema = z.object({
  category: z.enum(LEAVE_CATEGORIES),
  overnightKind: z.enum(OVERNIGHT_KINDS).optional(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number(),
});

export const leaveSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
    segments: z.array(leaveSegmentResponseSchema),
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
    segments: z.array(leaveSegmentResponseSchema),
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
  /** 총량·사용량이 이번 주기 기준인지 (정기외박 자동 적립). */
  cycleScoped: z.boolean(),
  /** 만료된 적립분 중 못 쓰고 날린 일수. */
  expiredDays: z.number(),
  /** 아직 부여일이 오지 않은 적립분의 미사용분. */
  upcomingDays: z.number(),
  /** 어떤 적립분으로도 설명되지 않는 사용 일수. */
  unattributedDays: z.number(),
  /** 이 재원이 가진 적립분 건수. */
  grantCount: z.number(),
  /** 30일 안에 만기가 닥치는, 아직 쓸 수 있는 일수. */
  expiringSoonDays: z.number(),
});

export const leaveGrantSchema = z
  .object({
    id: z.string(),
    balanceKey: z.enum(BALANCE_KEYS),
    days: z.number(),
    usedDays: z.number(),
    /** 오늘 기준 지금 쓸 수 있는 일수. 만료·예정이면 0. */
    availableDays: z.number(),
    unusedDays: z.number(),
    grantedOn: z.string().nullable(),
    expiresOn: z.string().nullable(),
    note: z.string().nullable(),
    status: z.enum(["future", "active", "expired"]),
    /** 오늘 기준 만기까지 남은 일수. 만기가 없으면 null. */
    daysUntilExpiry: z.number().nullable(),
    createdAt: z.string(),
  })
  .openapi("LeaveGrant");

export const leaveGrantFundSchema = z
  .object({
    key: z.enum(BALANCE_KEYS),
    label: z.string(),
    cycleScoped: z.boolean(),
    totalDays: z.number(),
    usedDays: z.number(),
    remainingDays: z.number(),
    expiredDays: z.number(),
    upcomingDays: z.number(),
    unattributedDays: z.number(),
    grants: z.array(leaveGrantSchema),
  })
  .openapi("LeaveGrantFund");

export const regularOvernightCycleSchema = z
  .object({
    index: z.number(),
    start: z.string(),
    end: z.string(),
    grantDays: z.number(),
    usedDays: z.number(),
    remainingDays: z.number(),
    state: z.enum(["past", "current", "future"]),
    color: z.string(),
  })
  .openapi("RegularOvernightCycle");

export const leaveGrantsPageSchema = z
  .object({
    /** 서버가 본 한국 시간 오늘 — 클라이언트가 만료 판정을 서버와 맞추도록 내려준다. */
    today: z.string(),
    totals: z.object({
      totalDays: z.number(),
      usedDays: z.number(),
      remainingDays: z.number(),
      expiredDays: z.number(),
      upcomingDays: z.number(),
      unattributedDays: z.number(),
    }),
    funds: z.array(leaveGrantFundSchema),
    regularOvernight: z.object({
      enabled: z.boolean(),
      startDate: z.string().nullable(),
      intervalDays: z.number().nullable(),
      daysPerGrant: z.number().nullable(),
      nextGrantDate: z.string().nullable(),
      /** 주기 시작일부터 전역일까지의 모든 주기. 설정이 없으면 빈 배열. */
      cycles: z.array(regularOvernightCycleSchema),
    }),
  })
  .openapi("LeaveGrantsPage");

export const leaveBalanceSummarySchema = z
  .object({
    balances: z.array(leaveBalanceItemSchema),
    regularOvernight: z.object({
      enabled: z.boolean(),
      startDate: z.string().nullable(),
      intervalDays: z.number().nullable(),
      daysPerGrant: z.number().nullable(),
      /** 설정에서 파생한 다음 적립 예정일 (읽기 전용). */
      nextGrantDate: z.string().nullable(),
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
