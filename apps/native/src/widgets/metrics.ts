/**
 * 위젯이 보여줄 수 있는 지표의 목록과 그 지표에 붙는 이름·착지점.
 *
 * 사용처: 위젯 레이아웃(leave-metric/leave-summary), 인앱 위젯 설정 화면,
 * 그리고 `app.json`의 `expo-widgets` 설정(iOS 위젯 편집 메뉴).
 *
 * `app.json`은 정적 JSON이라 이 파일을 import할 수 없다. 그래서 두 곳에 같은
 * 목록이 적히는데, 어긋나면 iOS 위젯 편집에서 고른 값이 여기 없는 key가 되어
 * 위젯이 조용히 빈 화면을 그린다. `test/widget-metrics.test.ts`가 두 표를
 * 비교해 빌드에서 잡는다 — `apps/web`의 SEO 라우트 표와 같은 장치다.
 */

export const METRIC_KEYS = [
  "discharge",
  "dutyDays",
  "progress",
  "nextLeave",
  "nextOuting",
  "headroom",
  "balance",
  "promotion",
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export function isMetricKey(value: unknown): value is MetricKey {
  return (
    typeof value === "string" &&
    (METRIC_KEYS as readonly string[]).includes(value)
  );
}

/**
 * iOS 위젯 편집 메뉴(`app.json`)에 아직 올리지 않은 지표.
 *
 * `app.json`은 fingerprint 소스라, 한 줄만 고쳐도 runtimeVersion이 바뀌어
 * **기존 스토어 사용자 전원에게 OTA가 끊긴다**(apps/native/AGENTS.md). 그래서 지표를
 * JS로 먼저 내보내고, 편집 메뉴는 다음 네이티브 빌드에서 따라붙게 열어 둔다.
 *
 * 여기 적혀 있는 동안 iOS에서는 위젯을 길게 눌러 그 지표를 고를 수 없다. 대신 인앱
 * 위젯 설정(기본 지표·요약 구성)으로 고를 수 있고, Android는 편집 메뉴 자체가 없어
 * 아무 영향이 없다.
 *
 * **다음 네이티브 빌드를 낼 때 `app.json`에 넣고 이 목록을 비운다.**
 * 비우지 않아도 위젯은 동작하지만, 그만큼 iOS 편집 메뉴가 계속 뒤처진다.
 */
export const METRICS_PENDING_IOS_MENU: readonly MetricKey[] = ["nextOuting"];

/** 위젯 편집 메뉴와 설정 화면에 쓰는 이름. 문장이 아니라 항목 이름이다. */
export const METRIC_TITLES: Record<MetricKey, string> = {
  discharge: "전역일 D-Day",
  dutyDays: "남은 일과일",
  progress: "복무율",
  nextLeave: "다음 휴가 D-Day",
  nextOuting: "다음 외출 D-Day",
  headroom: "다음 휴가일 출타 여유",
  balance: "남은 총 휴가일수",
  promotion: "진급까지 남은 날",
};

/** 설정 화면에서 항목 아래 한 줄로 붙는 설명. */
export const METRIC_DESCRIPTIONS: Record<MetricKey, string> = {
  discharge: "전역 예정일까지 남은 날",
  dutyDays: "평일에서 휴일·휴가를 뺀, 실제로 일과가 있는 날",
  progress: "입대일부터 전역일까지 지나온 비율",
  nextLeave:
    "다음에 나가는 휴가까지 남은 날. 휴가 중이면 복귀까지. 외출은 빼고 센다",
  nextOuting: "다음에 나가는 외출까지 남은 날. 외출 중이면 복귀까지",
  headroom: "그날 그룹에서 몇 명이 더 나갈 수 있는지",
  balance: "지금 기준으로 앞으로 쓸 수 있는 휴가 일수",
  promotion: "다음 진급일까지 남은 날",
};

/**
 * 위젯을 눌렀을 때 갈 곳.
 *
 * 새 라우트를 만들지 않고 이미 있는 화면만 가리킨다 — 위젯 전용 착지점을 두면
 * 딥링크 표(docs/deep-links.md)와 라우트가 하나씩 더 늘어나는데, 사용자가
 * 위젯에서 기대하는 것은 "그 숫자가 자세히 적힌 화면"이지 새 화면이 아니다.
 *
 * `leave://` 뒤에 슬래시 셋을 쓰는 이유는 호스트를 비우기 위해서다.
 * `leave://leaves`는 "leaves"가 호스트로 잡혀 경로가 사라진다.
 */
export const METRIC_LINKS: Record<MetricKey, string> = {
  discharge: "leave:///service-progress",
  dutyDays: "leave:///service-progress",
  progress: "leave:///service-progress",
  nextLeave: "leave:///leaves",
  nextOuting: "leave:///leaves",
  headroom: "leave:///",
  balance: "leave:///leave-grants",
  promotion: "leave:///service-progress",
};

/** 요약 위젯을 눌렀을 때. 지표가 여럿이라 한 곳으로 보낼 수 없어 홈으로 간다. */
export const SUMMARY_LINK = "leave:///";

export const DEFAULT_METRIC: MetricKey = "discharge";

/**
 * 요약 위젯의 기본 구성. 처음 붙인 사람이 설정 화면에 가지 않아도 쓸 만해야 한다.
 * "언제 나가고, 언제 끝나고, 얼마나 남았나" 셋이 가장 자주 확인하는 조합이다.
 */
export const DEFAULT_SUMMARY_METRICS: readonly MetricKey[] = [
  "discharge",
  "nextLeave",
  "balance",
  "dutyDays",
];

/** 요약 위젯에 고를 수 있는 지표 수. 중형은 앞의 3개까지만 그린다. */
export const SUMMARY_METRIC_MIN = 2;
export const SUMMARY_METRIC_MAX = 6;
/** 중형 위젯 한 줄에 들어가는 칸 수. */
export const SUMMARY_MEDIUM_SLOTS = 3;
