/**
 * 서버 응답 타입 별칭 모음.
 *
 * 화면 코드가 `InferResponseType<typeof api.x.y.$get, 200>` 같은 장황한 표현을
 * 반복하지 않도록, 자주 쓰는 응답 조각에 이름을 붙여 둔다. 서버 라우트가 바뀌면
 * 여기 타입이 자동으로 따라 바뀌고, 그 순간 화면 코드에서 타입 오류가 난다.
 *
 * 사용처: 웹/네이티브의 모든 화면과 컴포넌트 props 타입.
 */
import type { InferResponseType } from "hono/client";
import type { LeaveApiClient } from "./context";

type Client = LeaveApiClient;

/** 로그인한 사용자 + 소속 그룹. 앱 전역에서 "나"를 가리키는 기준 타입. */
export type Me = InferResponseType<Client["auth"]["me"]["$get"], 200>;

/** 그룹(부대) 한 개. */
export type Unit = InferResponseType<
  Client["units"][":id"]["$get"],
  200
>["unit"];

/** 한 달치 달력: 일별 출타 통계 + 그 달에 걸친 휴가 목록. */
export type Calendar = InferResponseType<
  Client["units"][":id"]["calendar"]["$get"],
  200
>;

/** 달력의 하루. 인원/허용치/제한기간 여부를 담는다. */
export type CalendarDay = Calendar["days"][number];

/** 달력에 표시되는 남의 휴가 한 건. */
export type CalendarLeave = Calendar["leaves"][number];

/** 부대 관리자가 등록해 같은 부대원 모두가 공유하는 일정. */
export type UnitEvent = Calendar["events"][number];

/** 내가 등록한 휴가 한 건(구간 포함). */
export type MyLeave = InferResponseType<
  Client["leaves"]["mine"]["$get"],
  200
>["leaves"][number];

/** 알림함 응답(목록 + 안 읽은 수). */
export type NotificationList = InferResponseType<
  Client["notifications"]["$get"],
  200
>;

/** 상단 배지 폴링용 경량 응답. */
export type NotificationSummary = InferResponseType<
  Client["notifications"]["summary"]["$get"],
  200
>;

/** 그룹 구성원 한 명. */
export type Member = InferResponseType<
  Client["units"][":id"]["members"]["$get"],
  200
>["members"][number];

/** 새로 발급된 그룹 초대코드. 발급 직후에만 원문을 볼 수 있다. */
export type IssuedUnitInvite = InferResponseType<
  Client["units"][":id"]["invite"]["$post"],
  201
>["invite"];

/** 로그인·회원가입 응답(토큰 포함). */
export type AuthResponse = InferResponseType<
  Client["auth"]["login"]["$post"],
  200
>;

export type OnboardingStatus = InferResponseType<
  Client["auth"]["onboarding"]["$get"],
  200
>;

/** 웹 인증 게이트가 한 왕복으로 받는 온보딩 상태 + 내 정보. */
export type AuthBootstrap = InferResponseType<
  Client["auth"]["bootstrap"]["$get"],
  200
>;

/** 여러 월 달력의 배치 전송 응답. 각 월은 기존 Calendar와 같은 계약이다. */
export type CalendarBatch = InferResponseType<
  Client["units"][":id"]["calendars"]["$get"],
  200
>;

/** 보유 휴가 요약: 재원별 총량/사용/잔여 + 정기외박 설정. */
export type LeaveBalanceSummary = InferResponseType<
  Client["leaves"]["balances"]["$get"],
  200
>;

/** 보유 휴가 상세 화면 데이터: 재원별 적립분 + 정기외박 주기. */
export type LeaveGrantsPage = InferResponseType<
  Client["leaves"]["grants"]["$get"],
  200
>;

/** 재원(연가·위로휴가 등) 하나와 그에 속한 적립분들. */
export type LeaveGrantFund = LeaveGrantsPage["funds"][number];

/** 적립분 한 건(부여일·일수·유효기간). */
export type LeaveGrantItem = LeaveGrantFund["grants"][number];

/** 정기외박 주기 한 개(시작·종료·사용량). */
export type RegularOvernightCycleItem =
  LeaveGrantsPage["regularOvernight"]["cycles"][number];

/** 휴가 등록/수정 결과. exceededDates는 저장 후 초과가 된 날짜들. */
export type LeaveResult = { leave: MyLeave; exceededDates: string[] };

/** 제한 기간(검열·훈련 등) 한 건. */
export type Blackout = InferResponseType<
  Client["units"][":id"]["blackouts"]["$get"],
  200
>["blackouts"][number];

/** 알림 수신 설정. */
export type NotificationPrefs = InferResponseType<
  Client["notifications"]["preferences"]["$get"],
  200
>["preferences"];

export type Friend = InferResponseType<
  Client["friends"]["$get"],
  200
>["friends"][number];
export type FriendRequest = InferResponseType<
  Client["friends"]["requests"]["incoming"]["$get"],
  200
>["requests"][number];
export type FriendCalendar = InferResponseType<
  Client["friends"]["calendar"]["$get"],
  200
>;
export type FriendCalendarLeave = FriendCalendar["leaves"][number];
export type FriendSchedule = InferResponseType<
  Client["friends"][":userId"]["schedule"]["$get"],
  200
>;
/** 로그인 없이 볼 수 있는 최소 공개 프로필. 관계·일정·내부 id는 포함하지 않는다. */
export type PublicUserProfile = InferResponseType<
  Client["public"]["users"][":username"]["$get"],
  200
>;
/** 공개 프로필 한 사람 — 검색 결과와 `/u/{username}` 화면이 같은 모양을 쓴다. */
export type UserProfile = InferResponseType<
  Client["users"][":username"]["$get"],
  200
>;
export type UserSearchResults = InferResponseType<
  Client["users"]["search"]["$get"],
  200
>;
/** 조회자와 상대의 관계. 화면은 이 값 하나로 버튼을 고른다. */
export type UserRelationship = UserProfile["relationship"];

export type PersonalEvent = InferResponseType<
  Client["personal-events"]["$get"],
  200
>["events"][number];
