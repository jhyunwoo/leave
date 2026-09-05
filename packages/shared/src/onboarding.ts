/**
 * 온보딩 단계 정의와 히어로 일러스트의 기하·문구.
 *
 * 사용처: 웹 `pages/onboarding/*`, 네이티브 `screens/onboarding/*`.
 *
 * 온보딩은 두 앱이 각각 구현하지만 "몇 단계인지, 무엇을 묻는지, 그림이 어떤
 * 모양인지"는 한 곳에서만 정의한다. 예전처럼 화면 파일마다 문구와 좌표를 적으면
 * 한쪽만 고쳐져 웹과 앱이 서서히 갈라진다.
 *
 * 여기 있는 값은 전부 순수 데이터다. SVG 좌표계(viewBox)까지 공유하므로 웹의
 * <svg>와 네이티브의 react-native-svg가 같은 패스를 그대로 받아 그린다.
 */

import {
  addDays,
  addMonthsClamped,
  diffDays,
  isValidISODate,
  type ISODate,
} from "./dates";
import {
  RANKS,
  RANK_LABELS,
  SERVICE_MONTHS,
  standardPromotionDate,
  type Branch,
  type Rank,
} from "./rank";
import { REGULAR_OVERNIGHT_DEFAULTS } from "./regular-overnight-guidance";

/* ------------------------------------------------------------------ 단계 */

/**
 * 화면 순서. 한 화면에서 하나만 묻는다는 원칙이라 단계가 곧 질문 하나다.
 * `dates`만 예외로 입대일과 전역예정일을 함께 둔다 — 전역일은 입대일에서
 * 자동 계산되는 값이라, 따로 떼면 사용자가 이미 정해진 답을 한 번 더 넘기게 된다.
 *
 * `howto`는 질문이 아니라 유일한 설명 화면이라 순서가 다른 이유로 정해져 있다. 그룹까지
 * 만들어 본 뒤라야 "같은 그룹의 출타 인원"이 무슨 말인지 통한다 — 앞에 두면 아직 아무
 * 맥락이 없는 사람에게 용어부터 던지게 된다.
 *
 * `username`이 별칭(`name`) 바로 뒤가 아니라 `rank` 뒤에 있는 것은 이어하기 때문이다.
 * 1~5단계의 답은 `rank`의 "다음"에서 프로필 한 벌로 처음 저장된다. 사용자 이름은
 * 유일성 때문에 그 자리에서 바로 서버에 넣어야 하는데, 별칭 뒤에 두면 "이름은
 * 저장됐지만 별칭은 아직 없는" 상태가 생기고 앱을 껐다 켠 사람에게 별칭을 다시
 * 묻게 된다. 프로필 저장 뒤로 옮기면 이어하기 판정이 저장된 값 두 개로 끝난다.
 */
export const ONBOARDING_STEP_IDS = [
  "welcome",
  "name",
  "branch",
  "dates",
  "rank",
  "username",
  "overnight",
  "group",
  "howto",
  "done",
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEP_IDS)[number];

/**
 * 화면 순서. 군종과 무관하게 모두 같은 단계를 밟는다.
 *
 * 한때 육군만 `overnight`를 건너뛰었다. 육군에는 정기외박 주기가 없다고 봤기
 * 때문인데, 실제로는 분기마다 1박 2일을 운영한다(regular-overnight-guidance.ts).
 * 군종마다 단계 수가 다르면 "지금 단계가 목록에 없다"는 상태가 생겨 진행바와
 * 이어하기가 각자 그 예외를 다시 처리해야 했다 — 그 갈래를 전부 없앤다.
 */
export function onboardingSteps(): OnboardingStepId[] {
  return [...ONBOARDING_STEP_IDS];
}

/** 진행바에 쓰는 위치. */
export function onboardingStepIndex(step: OnboardingStepId): number {
  return ONBOARDING_STEP_IDS.indexOf(step);
}

/**
 * 이어하기 진입 단계.
 *
 * 온보딩 도중 앱을 껐다 켜도 이미 저장한 답을 다시 묻지 않는다. 서버가 가진
 * 상태만으로 판단하므로 기기를 바꿔도 같은 자리에서 이어진다.
 */
export function onboardingResumeStep(status: {
  profile: { branch: Branch } | null;
  username: string | null;
  regularOvernight: object | null;
  unitId: string | null;
}): OnboardingStepId {
  if (!status.profile) return "welcome";
  // 사용자 이름은 저장되는 순간 유일성을 얻는다 — 있으면 다시 묻지 않는다.
  if (!status.username) return "username";
  // 사용법 단계에는 서버 상태가 없어 "봤는지"를 알 수 없다. 곧장 `done`으로 보내면
  // 그룹에 이미 들어간 사람은 설명을 영영 못 보므로, 한 번 더 보는 쪽을 고른다.
  if (status.unitId) return "howto";
  return status.regularOvernight ? "group" : "overnight";
}

export interface OnboardingCopy {
  /** 화면 제목이자 질문. 한 화면에 하나뿐이라 물음표로 끝낸다. */
  title: string;
  /** 제목 아래 한 줄. 왜 묻는지 또는 무엇이 자동으로 되는지. */
  lead: string;
}

export const ONBOARDING_COPY: Record<OnboardingStepId, OnboardingCopy> = {
  welcome: {
    title: "전역까지, 같이 세어드릴게요",
    lead: "몇 가지만 여쭤볼게요. 한 번에 하나씩, 1분이면 끝나요.",
  },
  name: {
    title: "뭐라고 부를까요?",
    lead: "그룹에서 보일 별칭이에요. 실명·군번·기수는 쓰지 마세요.",
  },
  branch: {
    title: "어느 군에 계신가요?",
    lead: "복무 기간과 정기외박 주기가 군마다 달라요.",
  },
  dates: {
    title: "언제 입대하셨나요?",
    lead: "전역 예정일은 군종에 맞춰 자동으로 계산해드려요.",
  },
  rank: {
    title: "지금 계급이 맞나요?",
    lead: "입대일 기준으로 골라뒀어요. 조기 진급했다면 바꿔주세요.",
  },
  username: {
    title: "친구가 찾을 이름을 정해주세요",
    lead: "@아이디는 공개돼요. 친구는 이 이름으로만 나를 찾을 수 있어요.",
  },
  overnight: {
    title: "정기외박 기준일이 언제인가요?",
    lead: "부대가 주기를 세기 시작한다고 안내한 날짜예요.",
  },
  group: {
    title: "함께 쓸 그룹이 있나요?",
    lead: "같은 그룹의 계획이 모여야 날짜별 출타 현황이 맞아떨어져요.",
  },
  howto: {
    title: "리브는 이렇게 써요",
    lead: "한 번만 읽어두면 돼요. 다시 보고 싶으면 사용 가이드에 그대로 있어요.",
  },
  done: {
    title: "준비 끝났어요",
    lead: "이제 달력에서 휴가를 계획할 수 있어요.",
  },
};

/* -------------------------------------------------------------- 사용법 */

export interface OnboardingHowtoCard {
  id: string;
  /** 무엇을 하는지 한 줄. 기능 이름이 아니라 사용자가 할 일로 적는다. */
  title: string;
  /** 그 화면이 실제로 무엇을 계산해 주는지. */
  body: string;
}

/**
 * 사용법 단계에 펼치는 카드.
 *
 * 웹과 앱이 각자 그리되 문구는 여기 한 벌만 둔다 — 화면 파일에 적으면 한쪽만
 * 고쳐져 서서히 갈라진다(이 파일 머리말이 경고하는 그 상황이다).
 *
 * 아이콘을 함께 두지 않는 이유는, 웹의 SVG와 네이티브의 글꼴 이모지가 결국 서로
 * 다른 그림이 되기 때문이다. 두 화면이 같은 말을 하는 것이 같은 그림을 그리는 것보다
 * 중요하다.
 *
 * 여기 적는 규칙과 숫자는 전부 이 저장소가 실제로 계산하는 것이어야 한다
 * (`GuidePage.tsx`가 지키는 규칙과 같다). 군 규정을 해석해 적지 않는다.
 */
export const ONBOARDING_HOWTO: readonly OnboardingHowtoCard[] = [
  {
    id: "calendar",
    title: "달력에서 휴가를 등록해요",
    body: "날짜를 눌러 기간을 잡고 제목과 휴가 종류를 고르면 끝이에요. 연가와 포상휴가처럼 종류가 섞인 일정도 구간으로 나눠 담을 수 있어요.",
  },
  {
    id: "overage",
    title: "빨간 날은 출타 인원이 넘친 날이에요",
    body: "같은 그룹의 계획을 날짜마다 세어, 그룹이 정한 하루 최대 출타 인원을 넘으면 그날이 빨갛게 표시돼요. 한 사람이 휴가를 여러 개 등록해도 1명으로 세요.",
  },
  {
    id: "notify",
    title: "넘치면 그날 휴가인 모두에게 알려요",
    body: "등록한 사람만이 아니라 그날 나가기로 한 부대원 전원에게 알림이 가요. 받고 싶지 않은 종류는 알림 설정에서 하나씩 끌 수 있어요.",
  },
  {
    id: "grants",
    title: "보유 휴가에서 잔여를 확인해요",
    body: "연가·포상휴가는 받은 건마다 만기가 달라 적립분 단위로 쌓이고, 쓴 날은 만기가 빠른 적립분부터 빠져요. 정기외박은 주기 기준으로 따로 세요.",
  },
  {
    id: "friends",
    title: "친구와 일정을 맞춰봐요",
    body: "@아이디로 친구를 찾고 양쪽이 모두 수락하면 달력에서 일정을 나란히 볼 수 있어요. 개인 일정은 휴가와 따로 저장돼 나만 봐요.",
  },
] as const;

/* ------------------------------------------------------------ 군종별 색 */

export interface BranchAccent {
  /** 히어로 배경 틴트. */
  tint: string;
  /** 강조선·엠블럼 색. tint 위에서 읽힌다. */
  line: string;
  /** 틴트 위 본문 글자색. */
  deep: string;
}

/**
 * 군종별 강조색.
 *
 * 값은 새로 고르지 않고 이미 접근성 검증을 마친 휴가 재원 팔레트에서 그대로
 * 가져왔다(웹 global.css / 네이티브 theme.ts의 balance 색과 같은 쌍).
 * 육군=연가 그린, 해군=정기외박 블루, 공군=기타외박 시안.
 */
export const BRANCH_ACCENT: Record<
  Branch,
  { light: BranchAccent; dark: BranchAccent }
> = {
  army: {
    light: { tint: "#d8f3c4", line: "#1f5e10", deep: "#163300" },
    dark: { tint: "#1e3311", line: "#b7e79a", deep: "#d7ffbf" },
  },
  navy: {
    light: { tint: "#d8e6ff", line: "#12439c", deep: "#0b2b66" },
    dark: { tint: "#16294d", line: "#a9c7ff", deep: "#cddcff" },
  },
  air_force: {
    light: { tint: "#cdeaf6", line: "#065b7a", deep: "#053b4f" },
    dark: { tint: "#0d2f3d", line: "#9dd6ec", deep: "#c4e8f5" },
  },
};

/* -------------------------------------------------------------- 엠블럼 */

export interface EmblemShape {
  d: string;
  mode: "fill" | "stroke";
  /** stroke일 때 선 굵기. */
  width?: number;
  opacity?: number;
}

export interface BranchEmblem {
  /** 정사각 좌표계 한 변. 그리는 쪽에서 원하는 크기로 스케일한다. */
  size: number;
  shapes: EmblemShape[];
}

/**
 * 군종 상징. 48×48 좌표계에 그린 뒤 히어로가 필요한 크기로 늘린다.
 * 계급장·부대마크 같은 실제 군 표지는 쓰지 않는다(식별 정보로 읽힐 수 있다).
 */
export const BRANCH_EMBLEM: Record<Branch, BranchEmblem> = {
  army: {
    size: 48,
    shapes: [
      { d: "M2 44 L15 26 L23 35 L32 22 L46 44 Z", mode: "fill", opacity: 0.28 },
      {
        d: "M24 4 L26.35 10.76 L33.51 10.91 L27.8 15.24 L29.88 22.09 L24 18 L18.12 22.09 L20.2 15.24 L14.49 10.91 L21.65 10.76 Z",
        mode: "fill",
      },
    ],
  },
  navy: {
    size: 48,
    shapes: [
      {
        d: "M2 42 Q8 37 14 42 T26 42 T38 42 T50 42",
        mode: "stroke",
        width: 2.5,
        opacity: 0.35,
      },
      {
        d: "M20 10 A4 4 0 1 0 28 10 A4 4 0 1 0 20 10 Z",
        mode: "stroke",
        width: 3,
      },
      { d: "M24 14 L24 40", mode: "stroke", width: 3 },
      { d: "M13 19 L35 19", mode: "stroke", width: 3 },
      {
        d: "M9 28 Q9 40 24 40 Q39 40 39 28",
        mode: "stroke",
        width: 3,
      },
    ],
  },
  air_force: {
    size: 48,
    shapes: [
      {
        d: "M6 40 Q10 33 17 36 Q21 29 29 33 Q37 32 40 40 Z",
        mode: "fill",
        opacity: 0.28,
      },
      { d: "M24 12 L4 23 L24 19 L44 23 Z", mode: "fill" },
      { d: "M24 22 L10 30 L24 27 L38 30 Z", mode: "fill", opacity: 0.6 },
    ],
  },
};

/* ------------------------------------------------------ 히어로 타임라인 */

/** 히어로 SVG 좌표계. 웹과 네이티브가 같은 값을 쓴다. */
export const HERO_VIEWBOX = { width: 360, height: 200 } as const;

/** 타임라인 트랙의 양 끝과 높이. */
export const HERO_TRACK = { x1: 32, x2: 328, y: 152 } as const;

export const HERO_TRACK_LENGTH = HERO_TRACK.x2 - HERO_TRACK.x1;

/**
 * 레이어별 배치 좌표.
 *
 * 숫자 판독부까지 SVG 안에 두고 좌표를 여기 모은다. 예전에 판독부만 HTML로
 * 띄웠더니 뷰박스와 다른 배율로 커져 별칭 칩 위에 겹쳤다. 한 좌표계에 모아두면
 * 그런 충돌이 애초에 생기지 않고, 네이티브도 같은 숫자를 그대로 쓴다.
 */
export const HERO_LAYOUT = {
  badge: { x: 24, y: 14, height: 26, textDx: 14, textDy: 17 },
  emblem: { x: 272, y: 8, scale: 1.2 },
  readout: { x: 26, valueY: 88, valueSize: 44, captionY: 108, captionSize: 13 },
  /**
   * 진급 셰브론: 라벨 baseline과 꺾쇠 중심.
   * 첫 진급(일병)은 트랙 왼쪽 끝에 붙어 판독부 바로 아래로 오므로, 판독부
   * 캡션과 24px는 벌려야 두 글줄이 겹치지 않는다.
   */
  marker: { labelY: 132, chevronY: 142 },
  /** 트랙 양 끝 아래 입대·전역 날짜. */
  capsY: 174,
  /** 동료 노드 중심 y와 간격. */
  nodes: { y: 188, gap: 26, radius: 9 },
} as const;

export interface HeroMarker {
  rank: Rank;
  label: string;
  date: ISODate;
  /** 트랙 위 위치 0~1. */
  ratio: number;
  x: number;
}

export interface HeroCyclePoint {
  date: ISODate;
  ratio: number;
  x: number;
}

export interface HeroGeometry {
  /** 실제 입대일이 들어와 계산한 값인지. false면 군종 기준 예시 타임라인이다. */
  resolved: boolean;
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  totalDays: number;
  servedDays: number;
  daysLeft: number;
  /** 복무 진행률 0~1. */
  progress: number;
  /** progress에 해당하는 트랙 위 x. */
  progressX: number;
  /** 진급 셰브론. private은 입대와 같은 지점이라 제외한다. */
  markers: HeroMarker[];
  /** 정기외박 주기 점. 기준일이 없으면 빈 배열. */
  cyclePoints: HeroCyclePoint[];
}

function trackX(ratio: number): number {
  return HERO_TRACK.x1 + (HERO_TRACK.x2 - HERO_TRACK.x1) * ratio;
}

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * 입대일을 아직 안 받았을 때 쓰는 예시 타임라인.
 *
 * 히어로를 빈 채로 두면 첫 화면이 다시 밋밋해진다. 군종의 표준 복무기간을 그대로
 * 쓰고 오늘이 그 3분의 1 지점인 것처럼 그려, 뒤에 진짜 날짜가 들어오면 같은
 * 그림이 제자리를 찾아가도록 한다.
 */
function previewDates(branch: Branch, today: ISODate) {
  const totalDays = Math.round(SERVICE_MONTHS[branch] * 30.44);
  const served = Math.round(totalDays / 3);
  return {
    enlistedAt: addDays(today, -served),
    dischargeAt: addDays(today, totalDays - served),
  };
}

/**
 * 히어로가 그릴 타임라인 기하.
 *
 * 날짜가 덜 찼어도 항상 그릴 수 있는 값을 돌려준다(`resolved`로 구분).
 * 화면은 이 결과만 보고 그리므로 두 플랫폼의 그림이 픽셀 단위로 같아진다.
 */
export function heroGeometry(input: {
  branch: Branch;
  today: ISODate;
  enlistedAt?: string;
  dischargeAt?: string;
  /** 정기외박 주기 기준일. */
  overnightStartDate?: string;
}): HeroGeometry {
  const hasDates =
    isValidISODate(input.enlistedAt ?? "") &&
    isValidISODate(input.dischargeAt ?? "") &&
    (input.enlistedAt as ISODate) < (input.dischargeAt as ISODate);

  const preview = previewDates(input.branch, input.today);
  const enlistedAt = hasDates
    ? (input.enlistedAt as ISODate)
    : preview.enlistedAt;
  const dischargeAt = hasDates
    ? (input.dischargeAt as ISODate)
    : preview.dischargeAt;

  const totalDays = Math.max(diffDays(enlistedAt, dischargeAt), 1);
  const servedDays = Math.max(diffDays(enlistedAt, input.today), 0);
  const progress = clamp01(servedDays / totalDays);

  const markers: HeroMarker[] = [];
  for (const rank of RANKS) {
    if (rank === "private") continue;
    const date = standardPromotionDate(enlistedAt, rank);
    const ratio = clamp01(diffDays(enlistedAt, date) / totalDays);
    // 전역 뒤에 오는 진급(복무기간이 짧게 잡힌 경우)은 트랙 밖이라 그리지 않는다.
    if (date > dischargeAt) continue;
    markers.push({
      rank,
      label: RANK_LABELS[rank],
      date,
      ratio,
      x: trackX(ratio),
    });
  }

  const cyclePoints: HeroCyclePoint[] = [];
  if (isValidISODate(input.overnightStartDate ?? "")) {
    const start = input.overnightStartDate as ISODate;
    // 주기 점은 군별 통상 운영값으로 찍는다. 달 단위 주기(육군의 분기)는 달
    // 산술로 더해야 실제 적립일과 같은 자리에 온다.
    const { intervalDays, intervalMonths } =
      REGULAR_OVERNIGHT_DEFAULTS[input.branch];
    for (let i = 1; i <= 24; i++) {
      const date = intervalMonths
        ? addMonthsClamped(start, intervalMonths * i)
        : addDays(start, (intervalDays ?? 1) * i);
      if (date > dischargeAt) break;
      if (date < enlistedAt) continue;
      const ratio = clamp01(diffDays(enlistedAt, date) / totalDays);
      cyclePoints.push({ date, ratio, x: trackX(ratio) });
    }
  }

  return {
    resolved: hasDates,
    enlistedAt,
    dischargeAt,
    totalDays,
    servedDays,
    daysLeft: Math.max(diffDays(input.today, dischargeAt), 0),
    progress,
    progressX: trackX(progress),
    markers,
    cyclePoints,
  };
}

/**
 * 히어로 레이어의 표시 상태.
 *  - hidden  : 아직 답하지 않아 그리지 않는다
 *  - present : 이미 답해서 옅게 남아 있다
 *  - active  : 지금 이 단계가 다루는 레이어
 */
export type HeroLayerState = "hidden" | "present" | "active";

export type HeroLayer =
  | "badge"
  | "sky"
  | "emblem"
  | "track"
  | "progress"
  | "markers"
  | "cycle"
  | "nodes"
  | "readout";

/** 레이어가 처음 등장하는 단계와, 그 레이어를 강조하는 단계. */
const LAYER_RULES: Record<
  HeroLayer,
  { from: OnboardingStepId; active: OnboardingStepId }
> = {
  track: { from: "welcome", active: "welcome" },
  // 진행선과 숫자는 처음부터 예시값으로 깔아둔다. 빈 트랙만 있으면 첫 화면이
  // 고장난 것처럼 보이고, 진짜 입대일이 들어오는 순간 예시선이 제자리로
  // 미끄러지는 편이 "계산됐다"는 신호로도 더 강하다.
  progress: { from: "welcome", active: "dates" },
  readout: { from: "welcome", active: "dates" },
  // 별칭 칩은 `name`에서 등장하고 `username` 단계에서 한 번 더 강조된다 —
  // 두 단계가 모두 "화면에 보일 나"를 정하는 자리라 같은 레이어를 가리킨다.
  badge: { from: "name", active: "name" },
  sky: { from: "branch", active: "branch" },
  emblem: { from: "branch", active: "branch" },
  markers: { from: "rank", active: "rank" },
  cycle: { from: "overnight", active: "overnight" },
  nodes: { from: "group", active: "group" },
};

/**
 * 단계별 레이어 상태표.
 *
 * 마지막 `done` 단계에서는 모든 레이어를 present로 켜 완성된 그림 한 장을 보여준다.
 */
export function heroLayerState(
  step: OnboardingStepId,
  layer: HeroLayer,
): HeroLayerState {
  const rule = LAYER_RULES[layer];
  const at = onboardingStepIndex(step);
  const from = onboardingStepIndex(rule.from);
  if (at < from) return "hidden";
  if (step === "done") return "present";
  return step === rule.active ? "active" : "present";
}
