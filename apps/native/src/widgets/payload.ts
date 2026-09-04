/**
 * 위젯이 그릴 값을 만든다. 순수 함수 — 네트워크도, 저장소도, expo-widgets도 모른다.
 *
 * 사용처: use-widget-sync.ts가 쿼리 캐시에서 재료를 모아 여기에 넣고, 나온
 * 타임라인을 그대로 `Widget.updateTimeline`에 넘긴다. 테스트는
 * `apps/native/test/widget-payload.test.ts`.
 *
 * ## 왜 타임라인인가
 *
 * 위젯은 새로고침 시점에 JS를 돌릴 수 없다 — 저장된 props만 그린다. 그래서
 * "앱을 켜야 숫자가 맞는 위젯"이 되기 쉬운데, 일곱 지표 중 다섯(전역 D-Day·
 * 일과일·복무율·다음 휴가 D-Day·진급)은 **날짜만 알면 정해지는 값**이다.
 * 앞으로 14일치 한국시간 자정을 미리 계산해 넣어 두면, 앱을 한 번도 켜지 않아도
 * 매일 0시에 정확한 숫자로 바뀐다.
 *
 * 나머지 둘(잔여 휴가·출타 여유)은 남이 바꾸는 값이라 미리 알 수 없다. 이 둘은
 * 마지막으로 받은 값을 그대로 들고 가되 `asOf`에 기준 시각을 적어, 화면이
 * "며칠 전 기준"임을 밝힐 수 있게 한다. 모르는 것을 아는 척하지 않는 편이 낫다.
 */

import { fmtRangeTiny } from "@leave/shared/calendar";
import {
  addDays,
  diffDays,
  kstMidnight,
  type ISODate,
} from "@leave/shared/dates";
import { dutyDaysBetween, type DateRange } from "@leave/shared/duty-days";
import { availabilitySignal } from "@leave/shared/availability";
import {
  nextPromotionDate,
  serviceProgressAt,
  type Rank,
} from "@leave/shared/rank";
import { nextLeaveCountdown } from "@leave/client/next-leave-countdown";
import type { LeaveHoldings } from "@leave/client/leave-holdings";
import type { MyLeave } from "@leave/client/types";
import {
  DEFAULT_METRIC,
  DEFAULT_SUMMARY_METRICS,
  type MetricKey,
} from "./metrics";

/** 앞으로 며칠치 자정을 미리 넣어 둘 것인가. */
export const TIMELINE_DAYS = 14;

/**
 * 위젯이 지금 무엇을 말해야 하는가.
 * `ready`가 아니면 지표를 그리지 않고 안내 문구 하나만 그린다.
 */
export type WidgetState = "ready" | "signedOut" | "needsOnboarding";

/** 지표 하나를 그리는 데 필요한 전부. 위젯은 이걸 받아 배치만 한다. */
export type MetricValue = {
  /** 크게 그리는 값. "D-421", "68%", "12일". */
  value: string;
  /** 값 위의 짧은 이름. "전역", "다음 휴가". */
  label: string;
  /** 값 아래 한 줄. 자리가 없으면 위젯이 생략한다. */
  caption: string | null;
  /**
   * 스크린리더가 읽을 문장. "D-421"을 그대로 읽으면 뜻이 사라진다.
   * (`components/next-leave-card.tsx`가 같은 이유로 같은 일을 한다.)
   */
  spoken: string;
  /** 잠금화면 인라인처럼 한 줄뿐인 자리에 쓰는 표기. "전역 D-421". */
  compact: string;
  /** 0~1. 원형 게이지를 그릴 수 있는 지표만 채운다. */
  gauge: number | null;
};

export type LeaveWidgetProps = {
  state: WidgetState;
  /** 스냅샷 지표(잔여 휴가·출타 여유)를 받은 시각. ISO 8601. */
  asOf: string;
  /** 이 엔트리가 그리는 날짜. 굴러가는 지표는 이 날 기준이다. */
  date: ISODate;
  /**
   * 위젯별 설정을 쓸 수 없는 Android에서 지표 위젯이 보여줄 지표.
   * iOS에서는 위젯 편집이 우선하고, 고른 지표에 값이 없을 때만 여기로 떨어진다.
   */
  defaultMetric: MetricKey;
  summaryMetrics: MetricKey[];
  /** 값이 없는 지표(그룹 미가입, 예정된 휴가 없음, 병장)는 키 자체가 없다. */
  metrics: Partial<Record<MetricKey, MetricValue>>;
};

export type WidgetTimelineEntry = { date: Date; props: LeaveWidgetProps };

/** 굴러가지 않는 지표 — 마지막으로 받은 값 그대로 간다. */
export type WidgetSnapshotSource = {
  /** 재원 잔여 합계. `summarizeHoldings`의 결과. */
  holdings: LeaveHoldings | null;
  /**
   * 가장 빠른 다음 휴가 첫날의 그룹 출타 현황.
   * 그룹에 속하지 않았거나 그날 달력을 아직 못 받았으면 null.
   */
  headroom: {
    date: ISODate;
    count: number;
    allowed: number;
    blocked: boolean;
  } | null;
};

export type WidgetSource = {
  state: WidgetState;
  /** 오늘(한국시간). 타임라인의 첫 엔트리가 이 날이다. */
  today: ISODate;
  profile: {
    enlistedAt: ISODate;
    dischargeAt: ISODate;
    /** 오늘 기준으로 계산된 현재 계급. 미래 계급의 하한으로 쓴다. */
    rank: Rank;
  } | null;
  /** 서버가 센 오늘의 남은 일과일. 미래 날짜는 여기서 빼서 구한다. */
  dutyDaysToday: number | null;
  /** 내 휴가 전부. 다음 휴가 D-Day가 여기서 나온다. */
  leaves: readonly MyLeave[];
  /** 일과일 차감에 쓰는 구간. 부대 휴일과 집계 대상 휴가. */
  unitHolidays: readonly DateRange[];
  leaveRanges: readonly DateRange[];
  snapshot: WidgetSnapshotSource;
  defaultMetric: MetricKey;
  summaryMetrics: readonly MetricKey[];
};

/** 로그인 전·온보딩 전에도 위젯은 무언가를 그려야 한다. */
export function emptyWidgetProps(
  state: Exclude<WidgetState, "ready">,
  today: ISODate,
  now: Date,
): LeaveWidgetProps {
  return {
    state,
    asOf: now.toISOString(),
    date: today,
    defaultMetric: DEFAULT_METRIC,
    summaryMetrics: [...DEFAULT_SUMMARY_METRICS],
    metrics: {},
  };
}

function dayCount(days: number): string {
  return `${days}일`;
}

/** D-0은 "0일 남았다"로 읽힌다. 그 하루는 이름을 따로 준다. */
function dday(days: number): string {
  return days === 0 ? "D-DAY" : `D-${days}`;
}

function discharge(
  date: ISODate,
  dischargeAt: ISODate,
): MetricValue | undefined {
  const days = diffDays(date, dischargeAt);
  if (days < 0) return undefined; // 이미 전역했다 — 셀 것이 없다.
  return {
    label: "전역",
    value: dday(days),
    caption: dischargeAt,
    spoken: days === 0 ? "오늘 전역이에요" : `전역까지 ${days}일 남았어요`,
    compact: `전역 ${dday(days)}`,
    gauge: null,
  };
}

function progress(
  date: ISODate,
  enlistedAt: ISODate,
  dischargeAt: ISODate,
): MetricValue {
  const ratio = serviceProgressAt(enlistedAt, dischargeAt, kstMidnight(date));
  const percent = Math.floor(ratio * 100);
  return {
    label: "복무율",
    value: `${percent}%`,
    caption: `${enlistedAt} 입대`,
    spoken: `복무율 ${percent} 퍼센트예요`,
    compact: `복무 ${percent}%`,
    gauge: ratio,
  };
}

function dutyDays(
  date: ISODate,
  today: ISODate,
  dutyDaysToday: number,
  unitHolidays: readonly DateRange[],
  leaves: readonly DateRange[],
): MetricValue {
  // [오늘, date) 구간에서 이미 보낸 일과일을 뺀다. `date`가 오늘이면 구간이
  // 비어 0이 빠진다 — 그래서 첫 엔트리는 서버 값 그대로다.
  const spent =
    date === today
      ? 0
      : dutyDaysBetween({
          from: today,
          through: addDays(date, -1),
          unitHolidays,
          leaves,
        });
  const days = Math.max(dutyDaysToday - spent, 0);
  return {
    label: "일과",
    value: dayCount(days),
    caption: "남은 일과일",
    spoken: `남은 일과일 ${days}일이에요`,
    compact: `일과 ${days}일`,
    gauge: null,
  };
}

function nextLeave(
  date: ISODate,
  leaves: readonly MyLeave[],
): MetricValue | undefined {
  const countdown = nextLeaveCountdown(leaves, date);
  if (!countdown) return undefined;

  const { leave, phase, days } = countdown;
  const onLeave = phase === "onLeave";
  const lastDay = onLeave && days === 0;
  const range = fmtRangeTiny(leave.startDate, leave.endDate);
  return {
    label: onLeave ? "휴가 중" : "다음 휴가",
    value: lastDay ? "D-DAY" : dday(days),
    caption: `${leave.title} · ${range}`,
    spoken: lastDay
      ? "오늘이 휴가 마지막 날이에요"
      : onLeave
        ? `휴가 종료까지 ${days}일 남았어요`
        : `다음 휴가까지 ${days}일 남았어요`,
    compact: `${onLeave ? "복귀" : "휴가"} ${lastDay ? "D-DAY" : dday(days)}`,
    gauge: null,
  };
}

function promotion(
  date: ISODate,
  enlistedAt: ISODate,
  rank: Rank,
): MetricValue | undefined {
  // 오늘의 계급을 하한(signupRank)으로 넘긴다. currentRank가 표준 진급표와
  // 이 하한 중 높은 쪽을 택하므로, 미래 날짜에서도 조기 진급자가 강등되지 않는다.
  const at = nextPromotionDate({ enlistedAt, signupRank: rank, on: date });
  if (!at) return undefined; // 병장 — 더 오를 곳이 없다.
  const days = diffDays(date, at);
  return {
    label: "진급",
    value: dday(days),
    caption: at,
    spoken: days === 0 ? "오늘 진급해요" : `진급까지 ${days}일 남았어요`,
    compact: `진급 ${dday(days)}`,
    gauge: null,
  };
}

function balance(holdings: LeaveHoldings | null): MetricValue | undefined {
  if (!holdings) return undefined;
  const { remaining, planned } = holdings;
  return {
    label: "남은 휴가",
    value: dayCount(remaining),
    caption: planned > 0 ? `계획 ${planned}일 포함` : "쓸 수 있는 일수",
    spoken:
      planned > 0
        ? `남은 휴가 ${remaining}일, 그중 ${planned}일은 이미 계획했어요`
        : `남은 휴가 ${remaining}일이에요`,
    compact: `휴가 ${remaining}일`,
    gauge: null,
  };
}

function headroom(
  source: WidgetSnapshotSource["headroom"],
): MetricValue | undefined {
  if (!source) return undefined;
  const signal = availabilitySignal(source.count, source.allowed);
  // 기준을 정하지 않은 그룹은 "몇 명 더 갈 수 있다"를 말할 수 없다.
  if (signal.key === "unknown") return undefined;

  const room = Math.max(source.allowed - source.count, 0);
  const label = source.blocked ? "제한 기간" : signal.label;
  return {
    label: "출타 여유",
    value: `${room}명`,
    caption: `${source.date.slice(5)} · ${source.count}/${source.allowed} ${label}`,
    spoken: source.blocked
      ? `그날은 제한 기간이에요. ${source.allowed}명 중 ${source.count}명이 나가요`
      : `그날은 ${room}명 더 나갈 수 있어요`,
    compact: `여유 ${room}명`,
    gauge: signal.percent === null ? null : Math.min(signal.percent / 100, 1),
  };
}

/** 한 날짜의 지표 묶음. 값이 없는 지표는 키를 넣지 않는다. */
function metricsOn(source: WidgetSource, date: ISODate) {
  const metrics: Partial<Record<MetricKey, MetricValue>> = {};
  const { profile } = source;

  if (profile) {
    const remaining = discharge(date, profile.dischargeAt);
    if (remaining) metrics.discharge = remaining;
    metrics.progress = progress(date, profile.enlistedAt, profile.dischargeAt);

    const promoted = promotion(date, profile.enlistedAt, profile.rank);
    if (promoted) metrics.promotion = promoted;

    if (source.dutyDaysToday !== null) {
      metrics.dutyDays = dutyDays(
        date,
        source.today,
        source.dutyDaysToday,
        source.unitHolidays,
        source.leaveRanges,
      );
    }
  }

  const upcoming = nextLeave(date, source.leaves);
  if (upcoming) metrics.nextLeave = upcoming;

  const held = balance(source.snapshot.holdings);
  if (held) metrics.balance = held;

  const room = headroom(source.snapshot.headroom);
  if (room) metrics.headroom = room;

  return metrics;
}

/**
 * 오늘부터 `TIMELINE_DAYS`일치 엔트리.
 *
 * 첫 엔트리는 **지금**이다(자정이 아니라). 앱에서 밀어 넣은 값이 즉시 보여야
 * 하기 때문이다. 그 뒤로는 한국시간 자정마다 하나씩 놓는다.
 */
export function buildWidgetTimeline(
  source: WidgetSource,
  now: Date,
): WidgetTimelineEntry[] {
  if (source.state !== "ready") {
    return [
      { date: now, props: emptyWidgetProps(source.state, source.today, now) },
    ];
  }

  const asOf = now.toISOString();
  const entries: WidgetTimelineEntry[] = [];

  for (let offset = 0; offset < TIMELINE_DAYS; offset += 1) {
    const date = addDays(source.today, offset);
    entries.push({
      date: offset === 0 ? now : new Date(kstMidnight(date)),
      props: {
        state: "ready",
        asOf,
        date,
        defaultMetric: source.defaultMetric,
        summaryMetrics: [...source.summaryMetrics],
        metrics: metricsOn(source, date),
      },
    });
  }

  return entries;
}

/**
 * "위젯이 보여줄 내용"의 지문. 같으면 다시 밀어 넣지 않는다.
 *
 * `asOf`는 뺀다 — 그 값은 만들 때마다 달라지므로 넣으면 지문이 매번 바뀌어,
 * 아무것도 달라지지 않은 렌더마다 위젯을 다시 그리게 된다.
 */
export function timelineSignature(
  entries: readonly WidgetTimelineEntry[],
): string {
  return JSON.stringify(
    entries.map((entry) => {
      const { asOf: _asOf, ...rest } = entry.props;
      return rest;
    }),
  );
}
