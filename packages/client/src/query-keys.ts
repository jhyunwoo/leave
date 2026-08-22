/**
 * React Query 캐시 키를 한곳에 모은 사전.
 *
 * 키를 문자열 리터럴로 흩어두면 `["leaveGrants"]`를 무효화해야 하는 곳에서
 * 오타 하나로 캐시가 조용히 낡는다. 여기서만 키를 만들고 무효화도 여기서만
 * 참조하면, 새 화면을 붙일 때 "무엇을 다시 받아야 하는지"가 한눈에 보인다.
 *
 * 규칙: 접두사만 넘긴 키(`leave.calendars`)는 그 하위 키 전체를 덮는다.
 * React Query의 부분 일치 무효화를 그대로 이용한다.
 */
export const queryKeys = {
  /** 로그인한 사용자 + 소속 그룹. */
  me: ["me"] as const,
  onboarding: ["onboarding"] as const,

  /** 모든 그룹의 구성원 목록. */
  allUnitMembers: ["unitMembers"] as const,
  /** 그룹 구성원 목록(그룹별). */
  unitMembers: (unitId: string | null) => ["unitMembers", unitId] as const,

  /** 모든 달의 달력 접두사. 범위를 모를 때만 전체를 무효화한다. */
  calendars: ["calendar"] as const,
  /** 특정 그룹의 특정 달(YYYY-MM) 달력. */
  calendar: (unitId: string | null, month: string) =>
    ["calendar", unitId, month] as const,

  /** 내 휴가 목록. */
  myLeaves: ["myLeaves"] as const,
  /** 재원별 보유/사용/잔여 요약. */
  leaveBalances: ["leaveBalances"] as const,
  /** 재원별 적립분 + 정기외박 주기. */
  leaveGrants: ["leaveGrants"] as const,

  /** 모든 그룹의 제한 기간. */
  allBlackouts: ["blackouts"] as const,
  /** 특정 그룹의 제한 기간. */
  blackouts: (unitId: string | null) => ["blackouts", unitId] as const,

  /** 알림함. */
  notifications: ["notifications"] as const,
  /** 상단 배지용 경량 안 읽음 수. 알림함 접두사 아래라 같은 변경에 함께 무효화된다. */
  notificationSummary: ["notifications", "summary"] as const,
  /** 알림 수신 설정. */
  notificationPrefs: ["notificationPrefs"] as const,

  friends: ["friends"] as const,
  friendList: ["friends", "list"] as const,
  incomingFriendRequests: ["friends", "requests", "incoming"] as const,
  outgoingFriendRequests: ["friends", "requests", "outgoing"] as const,
  friendSchedules: ["friends", "schedule"] as const,
  friendSchedule: (userId: string, startDate: string, endDate: string) =>
    ["friends", "schedule", userId, startDate, endDate] as const,
  friendCalendars: ["friends", "calendar"] as const,
  friendCalendar: (friendIds: readonly string[], month: string) =>
    ["friends", "calendar", [...friendIds].sort(), month] as const,

  personalEvents: ["personalEvents"] as const,
  personalEventsMonth: (month: string) =>
    ["personalEvents", "month", month] as const,
  personalEvent: (id: string) => ["personalEvents", "detail", id] as const,
};
