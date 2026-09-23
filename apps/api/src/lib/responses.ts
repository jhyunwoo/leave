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
  FRIEND_RELATIONSHIPS,
  LEAVE_CATEGORIES,
  LEAVE_KINDS,
  LEAVE_STATUSES,
  OUTING_KINDS,
  OVERNIGHT_KINDS,
  RANKS,
} from "@leave/shared";

/**
 * `code`는 문구와 별개로 안정적인 분기 키다(@leave/shared의 SOCIAL_ERROR_CODES).
 * 화면이 한국어 메시지를 비교해 분기하면 문구를 다듬는 순간 조용히 깨지므로,
 * 상태 구분이 필요한 오류에는 코드를 함께 싣는다. 없는 응답도 그대로 유효하다.
 */
export const errorSchema = z
  .object({ error: z.string(), code: z.string().optional() })
  .openapi("ErrorResponse");

export const okSchema = z.object({ ok: z.literal(true) }).openapi("Ok");

export const userSchema = z
  .object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    /** 공개 사용자 이름. 0023 이전 계정은 설정 전까지 null이다. */
    username: z.string().nullable(),
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
    // 외출한 날을 출타로 셀지. 이것도 부대마다 갈린다.
    outingCounts: z.boolean(),
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
  /** 외출의 갈래. 갈래가 생기기 전 구간은 비어 있고, 그때는 평일로 읽는다. */
  outingKind: z.enum(OUTING_KINDS).optional(),
  startDate: z.string(),
  endDate: z.string(),
  days: z.number(),
  regularOvernightCycleStart: z.string().nullable().optional(),
});

export const leaveSchema = z
  .object({
    id: z.string(),
    userId: z.string(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    returnTime: z.string(),
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
    returnTime: z.string(),
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

export const unitEventSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    isHoliday: z.boolean(),
    startDate: z.string(),
    endDate: z.string(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    details: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("UnitEvent");

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
    // 부대 관리자가 등록해 모든 부대원이 함께 보는 일정.
    events: z.array(unitEventSchema),
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

/**
 * 친구 목록의 한 사람. null은 "없다"가 아니라 **친구가 공유하지 않았다**는 뜻이다
 * (lib/friend-sharing.ts). 복무율을 끄면 두 날짜가 함께 빠진다.
 */
export const friendSummarySchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    since: z.string(),
    enlistedAt: z.string().nullable(),
    dischargeAt: z.string().nullable(),
    dutyDays: z.number().int().nonnegative().nullable(),
    /** false면 달력·일정 조회에 이 사람의 휴가가 실리지 않는다. */
    leaveScheduleShared: z.boolean(),
  })
  .openapi("FriendSummary");

/** 내가 친구에게 보여주는 항목. 모든 친구에게 같게 적용된다. */
export const friendSharingResponseSchema = z
  .object({
    serviceProgress: z.boolean(),
    dutyDays: z.boolean(),
    leaveSchedule: z.boolean(),
  })
  .openapi("FriendSharing");

export const friendRequestSchema = z
  .object({
    userId: z.string(),
    name: z.string(),
    username: z.string().nullable(),
    createdAt: z.string(),
  })
  .openapi("FriendRequest");

/**
 * 공개 프로필 — 사회 기능에서 남에게 보여도 되는 것만 담는다.
 *
 * 이 표에 있다는 이유로 필드를 늘리지 않는다. 이메일·소속 그룹·군 종류·계급·
 * 입대일/전역일은 전부 빠져 있고, 앞으로도 빠져 있어야 한다 — 이 응답은
 * 친구가 아닌 사람도, 링크만 받은 사람도 볼 수 있는 자리다.
 * `relationship`을 함께 실어 화면이 관계를 알아내려고 한 번 더 왕복하지 않게 한다.
 */
export const userProfileSchema = z
  .object({
    userId: z.string(),
    username: z.string(),
    name: z.string(),
    relationship: z.enum(FRIEND_RELATIONSHIPS),
  })
  .openapi("UserProfile");

export const friendCalendarPersonSchema = z.object({
  userId: z.string(),
  name: z.string(),
  username: z.string().nullable(),
  isViewer: z.boolean(),
  /**
   * false면 이 사람의 휴가는 조회하지 않았다. 화면은 빈 칸을 "휴가 없음"이 아니라
   * "비공개"로 읽어야 한다. 조회자 본인은 언제나 true다.
   */
  leaveScheduleShared: z.boolean(),
});

export const friendCalendarLeaveSchema = z.object({
  leaveId: z.string(),
  userId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  status: z.enum(LEAVE_STATUSES),
  /**
   * 휴가인가 외출인가. 여기까지만 말한다 — 연가·병가 같은 세부 종류(`category`)는
   * 친구에게 공개하지 않는다. 화면이 알아야 하는 것은 "그날 하루 나갔다 오는가,
   * 며칠 나가 있는가"이고 그 답에는 이 두 갈래면 충분하다.
   */
  kind: z.enum(LEAVE_KINDS),
});

export const friendCalendarSchema = z
  .object({
    month: z.string(),
    people: z.array(friendCalendarPersonSchema),
    leaves: z.array(friendCalendarLeaveSchema),
  })
  .openapi("FriendCalendar");

export const personalEventSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
    note: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .openapi("PersonalEvent");

export const notificationPrefsResponseSchema = z
  .object({
    // 내 계획 날짜가 최대 출타 인원을 넘겼을 때
    overage: z.boolean(),
    // 내 계획 기간에 블랙아웃이 등록됐을 때
    blackout: z.boolean(),
    // 그룹 설정·관리자 변경 안내
    unitNotice: z.boolean(),
    // 나에게 친구 요청이 왔을 때
    friendRequest: z.boolean(),
    // 친구가 새 휴가를 등록했을 때
    friendLeave: z.boolean(),
  })
  .openapi("NotificationPreferences");

export const friendLeaveNotificationSchema = z.object({
  userId: z.string(),
  leaveId: z.string(),
  startDate: z.iso.date(),
  endDate: z.iso.date(),
});

export const notificationSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    body: z.string(),
    leaveId: z.string().nullable(),
    dates: z.array(z.string()),
    friendLeave: friendLeaveNotificationSchema.nullable(),
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

/**
 * 외출 주기 한 칸. `regularOvernightCycleSchema`와 같은 모양이되 **색이 없다** —
 * 외출 주기는 달력에서 색 선이 아니라 시작일 마커로 보여주기 때문이다
 * (packages/shared/src/outing.ts 머리말).
 */
export const outingCycleSchema = z
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
  })
  .openapi("OutingCycle");

/** 외출 갈래 하나의 자동 적립 설정과 그 주기들. */
export const outingConfigResponseSchema = z
  .object({
    kind: z.enum(OUTING_KINDS),
    enabled: z.boolean(),
    startDate: z.string().nullable(),
    /** 주기 길이. 일·개월 중 채워진 한쪽이 그 갈래의 주기 단위다. */
    intervalDays: z.number().nullable(),
    intervalMonths: z.number().nullable(),
    /** 외출에서는 회당 **횟수**다 — 당일 복귀라 한 번이 하루다. */
    daysPerGrant: z.number().nullable(),
    /** 설정에서 파생한 다음 적립 예정일 (읽기 전용). */
    nextGrantDate: z.string().nullable(),
    carryOver: z.boolean(),
  })
  .openapi("OutingConfig");

/** 보유 휴가 화면이 쓰는, 주기 목록까지 붙은 형태. */
export const outingFundSchema = outingConfigResponseSchema
  .extend({ cycles: z.array(outingCycleSchema) })
  .openapi("OutingFund");

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
      /** 주기 길이. 일·개월 중 채워진 한쪽이 그 사용자의 주기 단위다. */
      intervalDays: z.number().nullable(),
      intervalMonths: z.number().nullable(),
      daysPerGrant: z.number().nullable(),
      nextGrantDate: z.string().nullable(),
      /** 켜면 주기가 끝나도 남은 몫이 사라지지 않고 하나의 누적 잔여로 쌓인다. */
      carryOver: z.boolean(),
      /** 주기 시작일부터 전역일까지의 모든 주기. 설정이 없으면 빈 배열. */
      cycles: z.array(regularOvernightCycleSchema),
    }),
    /** 갈래(평일·주말)마다 한 벌. 꺼져 있어도 항목 자체는 온다. */
    outing: z.array(outingFundSchema),
  })
  .openapi("LeaveGrantsPage");

export const leaveBalanceSummarySchema = z
  .object({
    balances: z.array(leaveBalanceItemSchema),
    regularOvernight: z.object({
      enabled: z.boolean(),
      startDate: z.string().nullable(),
      /** 주기 길이. 일·개월 중 채워진 한쪽이 그 사용자의 주기 단위다. */
      intervalDays: z.number().nullable(),
      intervalMonths: z.number().nullable(),
      daysPerGrant: z.number().nullable(),
      /** 설정에서 파생한 다음 적립 예정일 (읽기 전용). */
      nextGrantDate: z.string().nullable(),
      /** 켜면 주기가 끝나도 남은 몫이 사라지지 않고 하나의 누적 잔여로 쌓인다. */
      carryOver: z.boolean(),
    }),
    /** 외출 설정 — 갈래마다 한 벌. 폼이 주기 잔여를 계산하는 데 쓴다. */
    outing: z.array(outingConfigResponseSchema),
  })
  .openapi("LeaveBalanceSummary");

export const authResponseSchema = z
  .object({
    token: z.string(),
    user: userSchema.nullable(),
    onboardingCompleted: z.boolean(),
  })
  .openapi("AuthResponse");

export const passkeySchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceType: z.enum(["singleDevice", "multiDevice"]),
  backedUp: z.boolean(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export const passkeyListSchema = z.object({
  passkeys: z.array(passkeySchema),
});

export const passkeyOptionsSchema = z.object({
  ceremonyId: z.string(),
  options: z.record(z.string(), z.unknown()),
});

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

/**
 * 코드가 붙은 오류 본문. 라우트에서 `c.json(codedError(...), 409)`로 쓴다.
 * 메시지와 코드를 한 자리에서 짝지어 두면 둘이 어긋나지 않는다.
 */
export const codedError = (message: string, code: string) => ({
  error: message,
  code,
});

export const jsonContent = <T extends z.ZodType>(
  schema: T,
  description: string,
) => ({
  content: { "application/json": { schema } },
  description,
});

export const errorResponse = (description: string) =>
  jsonContent(errorSchema, description);
