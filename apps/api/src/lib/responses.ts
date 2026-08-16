/**
 * 응답 스키마 모음 — OpenAPI 문서와 클라이언트 타입의 출처.
 *
 * 사용처: 모든 라우트 정의(`jsonContent(...)`, `errorResponse(...)`).
 *
 * 요청 스키마는 @leave/shared에 있고(앱도 같은 걸로 미리 검증한다),
 * 응답 스키마는 서버만 쓰므로 여기 둔다. `.openapi("이름")`을 붙인 스키마는
 * /docs에 재사용 가능한 컴포넌트로 나온다.
 */

import { z } from "@hono/zod-openapi";
import {
  BALANCE_KEYS,
  BRANCHES,
  LEAVE_CATEGORIES,
  LEAVE_STATUSES,
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
    enlistedAt: z.string(),
    dischargeAt: z.string(),
  })
  .openapi("Member");

export const unitSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    // 실제 정원이 아닌, 관리자가 출타 계산 기준으로 지정한 값.
    referenceMemberTotal: z.number().nullable(),
    // 부대 관리자가 지정한 하루 최대 출타 인원.
    maxLeaveCount: z.number(),
    // 복귀일을 출타로 셀지. 부대마다 달라 그룹 설정으로 노출한다.
    returnDayCounts: z.boolean(),
    lastTotalUpdatedAt: z.string().nullable(),
    // 앱 가입자 수.
    memberCount: z.number(),
    // 부대 관리자 사용자 id.
    adminId: z.string(),
    createdAt: z.string(),
  })
  .openapi("Unit");

/** 초대코드 원문은 발급 응답에서만 한 번 반환한다. */
export const issuedUnitInviteSchema = z
  .object({
    code: z.string(),
    expiresAt: z.string(),
    maxUses: z.number(),
    usedCount: z.number(),
  })
  .openapi("IssuedUnitInvite");

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
    status: z.enum(LEAVE_STATUSES),
    segments: z.array(leaveSegmentResponseSchema),
    createdAt: z.string(),
  })
  .openapi("Leave");

export const calendarLeaveSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
    status: z.enum(LEAVE_STATUSES),
    segments: z.array(leaveSegmentResponseSchema),
  })
  .openapi("CalendarLeave");

/**
 * 그룹 달력에 이름과 함께 노출되는 출타 일정 한 건.
 *
 * 집계에 들어가는 상태(`shared`~`completed`)만 담는다 — 초안과 반려·취소는 빠진다.
 * 제목·사유 같은 자유 입력값은 담지 않는다. 다른 구성원에게 불필요한 개인정보와
 * UGC를 만들지 않기 위해 휴가 등록 폼에서도 자유 입력을 없앤 것과 같은 이유다.
 */
export const calendarAttendeeSchema = z
  .object({
    leaveId: z.string(),
    userId: z.string(),
    name: z.string(),
    // 입대일에서 자동 계산한 현재 계급 표기.
    rankLabel: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    status: z.enum(LEAVE_STATUSES),
    segments: z.array(leaveSegmentResponseSchema),
  })
  .openapi("CalendarAttendee");

export const dayStatSchema = z
  .object({
    date: z.string(),
    count: z.number(),
    allowed: z.number(),
    exceeded: z.boolean(),
    // 블랙아웃 기간이면 출타율과 무관하게 제한될 수 있다.
    blocked: z.boolean(),
  })
  .openapi("DayStat");

export const blackoutSchema = z
  .object({
    id: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().nullable(),
  })
  .openapi("UnitBlackout");

export const calendarSchema = z
  .object({
    month: z.string(),
    unit: unitSchema,
    days: z.array(dayStatSchema),
    // 내 일정만. 초안과 제목·사유가 들어 있어 나 말고는 볼 수 없다.
    leaves: z.array(calendarLeaveSchema),
    // 이름을 붙여 그룹 전체에 공개하는 출타 명단(내 것 포함).
    attendees: z.array(calendarAttendeeSchema),
    blackouts: z.array(blackoutSchema),
  })
  .openapi("UnitCalendar");

export const reportSchema = z
  .object({
    id: z.string(),
    targetType: z.enum(["unit", "member"]),
    targetId: z.string(),
    reason: z.string(),
    status: z.enum(["open", "reviewing", "resolved"]),
    createdAt: z.string(),
  })
  .openapi("ContentReport");

export const blockedUserSchema = z
  .object({
    userId: z.string(),
    // 이미 탈퇴한 사용자면 별칭이 없다.
    name: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("BlockedUser");

export const notificationPrefsResponseSchema = z
  .object({
    // 내 계획 날짜가 최대 출타 인원을 넘겼을 때
    overage: z.boolean(),
    // 내 계획 기간에 블랙아웃이 등록됐을 때
    blackout: z.boolean(),
    // 그룹 설정·관리자 변경 안내
    unitNotice: z.boolean(),
  })
  .openapi("NotificationPreferences");

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
  /** 미래 계획까지 포함한 사용 일수. */
  usedDays: z.number(),
  /** 오늘까지 실제로 지나간 사용 일수. */
  usedToDateDays: z.number(),
  /** 미래에 계획만 해둔 일수. 아직 쓴 것이 아니다. */
  plannedDays: z.number(),
  /** 계획까지 미리 뺀 잔여 — 새 휴가를 더 넣을 수 있는지 판단할 때 쓴다. */
  remainingDays: z.number(),
  /** 오늘까지 쓴 것만 뺀 잔여 — 화면에서 "남은 휴가"로 보여주는 값. */
  remainingAsOfTodayDays: z.number(),
  automaticDays: z.number(),
  /** 총량·사용량이 이번 주기 기준인지 (정기외박 자동 적립). */
  cycleScoped: z.boolean(),
  /** 만료된 적립분 중 못 쓰고 날린 일수. */
  expiredDays: z.number(),
  /** 아직 부여일이 오지 않은 적립분의 미사용분. 미래 계획도 빠진다. */
  upcomingDays: z.number(),
  /** 계획을 빼지 않은 예정분 — 화면의 "남은 휴가"에 더할 때 쓰는 값. */
  upcomingAsOfTodayDays: z.number(),
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
    /** 이 적립분에 달린 사용 일수. 미래 계획까지 센다. */
    usedDays: z.number(),
    /** 그중 오늘까지 실제로 지나간 일수. */
    usedToDateDays: z.number(),
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
    usedToDateDays: z.number(),
    plannedDays: z.number(),
    remainingDays: z.number(),
    remainingAsOfTodayDays: z.number(),
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
    usedToDateDays: z.number(),
    remainingDays: z.number(),
    remainingAsOfTodayDays: z.number(),
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
      usedToDateDays: z.number(),
      plannedDays: z.number(),
      remainingDays: z.number(),
      remainingAsOfTodayDays: z.number(),
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
    user: userSchema.nullable(),
    onboardingCompleted: z.boolean(),
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
    durationMs: z.number().nullable(),
    createdAt: z.string(),
  })
  .openapi("AccessLog");

export const pushLogSchema = z
  .object({
    id: z.string(),
    notificationId: z.string().nullable(),
    direction: z.enum(["send", "receipt", "open"]),
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
