/**
 * 정기외박 "주기" 계산.
 *
 * 정기외박은 주기 시작일을 기준으로 주기마다 반복해서 적립된다(입대일과 무관).
 * 주기 정보를 따로 저장하지는 않고, 프로필의 자동 적립 설정
 * (주기 시작일 startDate, 주기 intervalDays·intervalMonths, 회당 daysPerGrant)에서
 * 파생한다.
 *
 * 주기의 단위가 둘인 것은 군마다 규정이 다른 단위로 쓰여 있기 때문이다. 해·공군의
 * "6주마다"는 일수로 정확히 떨어지지만(42일), 육군의 "분기(3개월)마다"는 달의 길이가
 * 달라 일수로 옮기는 순간 어긋난다 — 91일로 잡으면 네 주기(364일)마다 하루씩 앞당겨져
 * 몇 주기만 지나도 달력의 분기와 다른 날에 적립된다. 그래서 달 단위 주기는 일수로
 * 바꾸지 않고 달 산술(addMonthsClamped)로 그대로 센다.
 *
 * 적립은 한 주기를 다 채워야 이뤄진다. 주기 시작일을 S, 주기를 I라 하면 첫 적립일은
 * S가 아니라 S + I이고, 이후 S + 2·I, S + 3·I … 로 이어진다.
 *
 * 주기는 그 적립일부터 센다. k번째(1부터) 주기는 [S + k·I, S + (k+1)·I - 1일]이고,
 * 주기 첫날에 회당 적립 일수를 받아 다음 적립 전날(= 그 주기 마지막 날)까지 쓴다.
 * S부터 첫 적립 전날까지의 한 주기는 아직 받은 정기외박이 없는 대기 구간이라 어떤
 * 주기에도 속하지 않고, 그 사이에는 쓸 수 있는 정기외박도 없다.
 *
 * 이월(carryOver)은 기본적으로 없다 — 주기가 끝나면 남은 몫이 사라진다. 다만 정기외박을
 * 쌓아두는 부대가 있고, 공개 규정은 그 부분을 정하지 않아(regular-overnight-guidance.ts)
 * 사용자가 켤 수 있게 뒀다. 켜면 첫 적립일부터의 모든 주기가 하나의 누적 잔여로 합쳐진다.
 *
 * 이월에서도 주기라는 단위는 사라지지 않는다. k주기까지 받은 몫은 `회당 × k`이고,
 * 판정은 "주기 경계마다 그때까지 쓴 일수가 그때까지 받은 몫을 넘지 않는가"다.
 * 받은 몫은 적립일에만 계단처럼 오르고 사용량은 단조 증가하므로, 주기 경계만 보면
 * 그 사이의 모든 날이 함께 지켜진다.
 */

import { fmtDateShort, fmtRangeTiny } from "./calendar";
import {
  addDays,
  addMonthsClamped,
  diffDays,
  fullMonthsBetween,
  type ISODate,
} from "./dates";
import { segmentBalanceKey, type LeaveSegment } from "./leave";

/** 아무리 긴 범위를 물어봐도 폭주하지 않도록 두는 주기 수 상한. */
const MAX_CYCLES = 500;

export type RegularOvernightConfig = {
  enabled: boolean;
  /** 주기를 세기 시작하는 날. 첫 적립은 한 주기 뒤(S + I)이고 그때 1주기가 시작한다. */
  startDate: string | null;
  /** 일 단위 주기. 달 단위와 둘 중 하나만 값을 갖는다(해·공군의 42일). */
  intervalDays: number | null;
  /** 달 단위 주기. 달력의 분기에 맞춰 돌아야 하는 주기에 쓴다(육군의 3개월). */
  intervalMonths?: number | null;
  daysPerGrant: number | null;
  /**
   * 주기가 끝나도 안 쓴 몫을 남길지.
   *
   * 언제 켰는지를 저장하지 않는 것이 이 설계의 요점이다. 저장하는 순간 같은 설정이
   * "켠 시점"에 따라 다른 잔여를 내는 상태가 생기고, 그 시점은 되돌릴 수도 고칠 수도
   * 없다. 지금은 첫 적립일부터 전부 소급되고, 끄면 곧바로 주기별 셈으로 돌아온다 —
   * 잔여가 전부 설정에서 파생하므로 되돌릴 것이 남지 않는다.
   */
  carryOver?: boolean | null;
};

/** 주기의 길이. 단위가 다르면 더하는 방법도 다르므로 숫자만으로는 부족하다. */
export type RegularOvernightInterval =
  { unit: "day"; value: number } | { unit: "month"; value: number };

type ActiveConfig = {
  startDate: ISODate;
  interval: RegularOvernightInterval;
  daysPerGrant: number;
  carryOver: boolean;
};

export type RegularOvernightCycle = {
  /** 첫 적립일에 시작하는 주기를 1로 두고 센 순번. 표시용("3주기"). */
  index: number;
  /** 이 주기 몫이 적립되는 날. */
  start: ISODate;
  /** 다음 적립 전날 — 이 주기 몫을 쓸 수 있는 마지막 날. */
  end: ISODate;
  /** 이 주기 첫날에 적립돼 주기가 끝나기 전에 써야 하는 일수(= 회당 적립 일수). */
  grantDays: number;
};

/**
 * 저장된 두 컬럼 중 실제로 쓸 주기.
 *
 * 달 단위를 먼저 본다. 한 행에 둘 다 들어가는 일은 스키마가 막지만(schemas.ts),
 * 군종을 바꾸다 남은 값이 섞여 들어와도 규정에 가까운 쪽으로 답이 정해지게 둔다.
 */
export function regularOvernightInterval(
  config: RegularOvernightConfig | null | undefined,
): RegularOvernightInterval | null {
  const months = config?.intervalMonths;
  if (months && months >= 1) return { unit: "month", value: months };
  const days = config?.intervalDays;
  if (days && days >= 1) return { unit: "day", value: days };
  return null;
}

/** 설정이 켜져 있고 값이 모두 채워졌을 때만 주기를 계산할 수 있다. */
function activeConfig(config: RegularOvernightConfig | null | undefined) {
  const interval = regularOvernightInterval(config);
  if (
    !config?.enabled ||
    !config.startDate ||
    !config.daysPerGrant ||
    !interval
  ) {
    return null;
  }
  return {
    startDate: config.startDate,
    interval,
    daysPerGrant: config.daysPerGrant,
    carryOver: Boolean(config.carryOver),
  } satisfies ActiveConfig;
}

/**
 * 주기 시작일에서 k주기 뒤 날짜. k=1이 첫 적립일이다.
 *
 * 언제나 시작일에서 한 번에 더한다. 달 단위에서 한 주기씩 이어 붙이면 말일이
 * 끌려간다 — 1/31에서 3개월씩 두 번은 4/30 → 7/30이지만, 6개월을 한 번에 더하면
 * 7/31이다. 규정이 말하는 것은 후자다.
 */
function cycleDateAt(config: ActiveConfig, k: number): ISODate {
  return config.interval.unit === "month"
    ? addMonthsClamped(config.startDate, k * config.interval.value)
    : addDays(config.startDate, k * config.interval.value);
}

/**
 * date가 주기 시작일에서 몇 주기 지났는지(내림). 시작일 이전이면 1보다 작은 값이
 * 나와 "아직 주기가 없다"로 읽힌다.
 */
function cyclesElapsed(config: ActiveConfig, date: ISODate): number {
  const { interval, startDate } = config;
  return interval.unit === "month"
    ? Math.floor(fullMonthsBetween(startDate, date) / interval.value)
    : Math.floor(diffDays(startDate, date) / interval.value);
}

/** 첫 적립일. 한 주기를 다 채운 뒤이므로 주기 시작일이 아니라 그 한 주기 뒤다. */
function firstGrantOf(config: ActiveConfig): ISODate {
  return cycleDateAt(config, 1);
}

function buildCycle(
  config: ActiveConfig,
  index: number,
): RegularOvernightCycle {
  return {
    index,
    start: cycleDateAt(config, index),
    // 다음 적립 전날. 달 단위 주기는 주기마다 길이가 달라 일수로 셀 수 없다.
    end: addDays(cycleDateAt(config, index + 1), -1),
    // 주기는 적립일부터 세므로 모든 주기가 회당 적립 일수를 쥐고 시작한다.
    grantDays: config.daysPerGrant,
  };
}

/** date가 속한 주기. 설정이 없거나 첫 적립 전이면 null. */
export function cycleFor(
  config: RegularOvernightConfig | null | undefined,
  date: ISODate,
): RegularOvernightCycle | null {
  const active = activeConfig(config);
  if (!active) return null;
  const index = cyclesElapsed(active, date);
  return index < 1 ? null : buildCycle(active, index);
}

/**
 * 주기 시작일에서 n주기 뒤 날짜. 설정이 없으면 null.
 * 주기 목록을 어디까지 펼칠지 정하는 것처럼, 주기 하나를 만들 것도 아니면서
 * "몇 주기 뒤"를 알아야 하는 자리에 쓴다.
 */
export function cycleDateAfter(
  config: RegularOvernightConfig | null | undefined,
  cycles: number,
): ISODate | null {
  const active = activeConfig(config);
  return active ? cycleDateAt(active, cycles) : null;
}

/**
 * 화면에 그릴 주기. 전역일 다음 날부터는 아무 주기도 돌려주지 않는다.
 *
 * 주기는 저장되지 않고 설정에서 무한히 파생하므로, 그냥 두면 달력을 아래로 굴릴 때
 * 전역 후 몇 년치 주기가 계속 나온다. 복무가 끝난 뒤의 주기는 받을 일도 쓸 일도 없어
 * 화면에 있을 이유가 없다 — `checkRegularOvernight`도 적립일이 전역 뒤인 주기를 이미
 * 막고 있어(`after_discharge`), 안 자르면 화면과 규칙이 서로 다른 말을 한다.
 *
 * 전역일 **당일까지는** 보여준다. 그날은 아직 복무 중이고, 전역일이 낀 주기의 몫은
 * 그날까지 쓸 수 있기 때문이다.
 *
 * 표시 전용이다. 잔여량 계산은 `cycleFor`/`cyclesInRange`를 그대로 써야 한다 —
 * 여기서 자른 값을 셈에 넣으면 화면이 아니라 셈이 바뀐다.
 */
export function cycleForDisplay(
  config: RegularOvernightConfig | null | undefined,
  date: ISODate,
  dischargeAt: ISODate | null | undefined,
): RegularOvernightCycle | null {
  if (dischargeAt && date > dischargeAt) return null;
  return cycleFor(config, date);
}

/** [rangeStart, rangeEnd]와 하루라도 겹치는 모든 주기. 설정이 없으면 빈 배열. */
export function cyclesInRange(
  config: RegularOvernightConfig | null | undefined,
  rangeStart: ISODate,
  rangeEnd: ISODate,
): RegularOvernightCycle[] {
  const active = activeConfig(config);
  if (!active || rangeEnd < rangeStart) return [];
  // 첫 적립 전에는 주기가 없으므로 범위를 첫 적립일 이후로 자른다.
  const first = firstGrantOf(active);
  const from = rangeStart > first ? rangeStart : first;
  if (from > rangeEnd) return [];

  const cycles: RegularOvernightCycle[] = [];
  let index = Math.max(cyclesElapsed(active, from), 1);
  for (let guard = 0; guard < MAX_CYCLES; guard += 1) {
    const cycle = buildCycle(active, index);
    if (cycle.start > rangeEnd) break;
    cycles.push(cycle);
    index += 1;
  }
  return cycles;
}

/** 첫 적립일 = 1주기 첫날. 설정이 없으면 null. 대기 구간 안내에 쓴다. */
export function firstGrantDate(
  config: RegularOvernightConfig | null | undefined,
): ISODate | null {
  const active = activeConfig(config);
  return active ? firstGrantOf(active) : null;
}

/** on까지 도래한 모든 적립일. 주기를 채울 때마다 하나씩 늘어난다. */
export function grantDatesThrough(
  config: RegularOvernightConfig | null | undefined,
  on: ISODate,
): ISODate[] {
  const active = activeConfig(config);
  if (!active) return [];
  const dates: ISODate[] = [];
  for (let index = 1; index <= MAX_CYCLES; index += 1) {
    const date = cycleDateAt(active, index);
    if (date > on) break;
    dates.push(date);
  }
  return dates;
}

/** on 다음에 돌아올 적립일. on이 마침 적립일이면 그 다음 주기의 적립일. */
export function nextGrantDateAfter(
  config: RegularOvernightConfig | null | undefined,
  on: ISODate,
): ISODate | null {
  const active = activeConfig(config);
  if (!active) return null;
  // 시작일보다 이른 날을 물으면 경과 주기가 0 이하라 첫 적립일로 접힌다.
  return cycleDateAt(active, Math.max(cyclesElapsed(active, on) + 1, 1));
}

/**
 * 잔여량 계산에 필요한 구간 정보만 추린 형태.
 * DB 행은 외박 종류가 없을 때 null이라 undefined와 함께 받아들인다.
 */
export type SegmentLike = Pick<
  LeaveSegment,
  "category" | "startDate" | "endDate"
> & {
  overnightKind?: LeaveSegment["overnightKind"] | null;
};

/** SegmentLike는 overnightKind가 null일 수 있어 재원 판별 전에 맞춰준다. */
function balanceKeyOf(segment: SegmentLike) {
  return segmentBalanceKey({
    category: segment.category,
    overnightKind: segment.overnightKind ?? undefined,
  });
}

/** 주기와 겹치는 정기외박 구간 일수 합계. */
export function cycleUsedDays(
  cycle: RegularOvernightCycle,
  segments: readonly SegmentLike[],
): number {
  let used = 0;
  for (const segment of segments) {
    if (balanceKeyOf(segment) !== "regular_overnight") continue;
    const start =
      segment.startDate > cycle.start ? segment.startDate : cycle.start;
    const end = segment.endDate < cycle.end ? segment.endDate : cycle.end;
    if (start > end) continue;
    used += diffDays(start, end) + 1;
  }
  return used;
}

/**
 * 주기 몫에서 아직 쓰지 않고 남은 일수.
 *
 * 이월이 꺼져 있으면 이 값은 주기가 끝나는 순간 사라진다. 켜져 있으면 사라지지 않고
 * 다음 주기로 넘어가므로, **주기별 이 값을 그대로 더한 것이 곧 누적 잔여**가 된다
 * (이월분까지 당겨 쓴 주기는 음수가 되어 앞선 주기의 남은 몫을 정확히 상쇄한다).
 * 그래서 이월을 켜도 주기 행의 뜻은 바뀌지 않고, 합계를 어느 칸에 넣느냐만 달라진다.
 */
export function cycleRemainingDays(
  cycle: RegularOvernightCycle,
  segments: readonly SegmentLike[],
): number {
  return cycle.grantDays - cycleUsedDays(cycle, segments);
}

/**
 * 첫 적립일부터 k주기 마지막 날까지 쓴 정기외박 일수.
 *
 * 주기가 첫 적립일 뒤를 빈틈없이 덮으므로 주기별 사용량의 합이 곧 그 구간의 사용량이다.
 * 첫 적립 전에 쓴 날은 어느 주기의 몫도 아니라 여기 들어오지 않는다 — 그 날들은
 * `before_first_grant`가 따로 막는 몫이고, 누적 판정에 섞으면 이미 어긋나 있는 과거가
 * 새 등록을 막는 이유가 된다.
 */
function usedThroughCycle(
  active: ActiveConfig,
  segments: readonly SegmentLike[],
  index: number,
): number {
  let used = 0;
  for (let k = 1; k <= index; k += 1) {
    used += cycleUsedDays(buildCycle(active, k), segments);
  }
  return used;
}

/** k주기까지 실제로 받은 몫. 적립일이 전역 뒤인 주기는 애초에 받지 못한다. */
function grantedThroughCycle(active: ActiveConfig, index: number): number {
  return active.daysPerGrant * index;
}

/**
 * on까지 적립된 정기외박 중 아직 쓰지 않은 일수 — 이월을 켠 사용자의 "누적 잔여".
 *
 * 달력 배너와 보유 휴가 주기 목록이 같은 숫자를 말하도록 여기 한 벌만 둔다.
 * 전역일 뒤의 적립은 받지 못하므로 상한을 전역일로 자른다 — 전역일을 아직 모르는
 * 화면도 있어(달력) 없으면 자르지 않는다. 이월이 꺼져 있으면 이 값에 뜻이 없으므로
 * 부르는 쪽이 설정을 보고 고른다.
 */
export function regularOvernightPooledRemaining(input: {
  config: RegularOvernightConfig | null | undefined;
  used: readonly SegmentLike[];
  dischargeAt: ISODate | null | undefined;
  on: ISODate;
}): number {
  const active = activeConfig(input.config);
  if (!active) return 0;
  const limit =
    input.dischargeAt && input.dischargeAt < input.on
      ? input.dischargeAt
      : input.on;
  let remaining = 0;
  for (const cycle of cyclesInRange(
    input.config,
    firstGrantOf(active),
    limit,
  )) {
    remaining += cycle.grantDays - cycleUsedDays(cycle, input.used);
  }
  return remaining;
}

/** 자동 적립 설정이 살아 있어 정기외박을 주기 단위로 다뤄야 하는지. */
export function isRegularOvernightCycleBased(
  config: RegularOvernightConfig | null | undefined,
): boolean {
  return activeConfig(config) !== null;
}

export type CycleUsage = {
  cycle: RegularOvernightCycle;
  usedDays: number;
};

/**
 * 정기외박 구간이 어느 주기의 몫을 얼마나 썼는지 주기별로 묶는다.
 *
 * 정기외박은 이월되지 않고 주기마다 따로 쌓이므로, 잔여량은 재원 하나의 총합이 아니라
 * 주기별로 따져야 한다. 첫 적립 전 날짜는 어떤 주기에도 속하지 않아
 * beforeFirstGrantDays로 따로 센다(그 날에는 쓸 수 있는 정기외박이 아예 없다).
 */
export function regularOvernightUsageByCycle(
  config: RegularOvernightConfig | null | undefined,
  segments: readonly SegmentLike[],
): { cycles: CycleUsage[]; beforeFirstGrantDays: number } {
  const regular = segments.filter(
    (segment) => balanceKeyOf(segment) === "regular_overnight",
  );
  if (!regular.length) return { cycles: [], beforeFirstGrantDays: 0 };

  const active = activeConfig(config);
  const totalDays = regular.reduce(
    (sum, segment) => sum + diffDays(segment.startDate, segment.endDate) + 1,
    0,
  );
  if (!active) return { cycles: [], beforeFirstGrantDays: totalDays };

  let rangeStart = regular[0]!.startDate;
  let rangeEnd = regular[0]!.endDate;
  for (const segment of regular) {
    if (segment.startDate < rangeStart) rangeStart = segment.startDate;
    if (segment.endDate > rangeEnd) rangeEnd = segment.endDate;
  }

  const cycles = cyclesInRange(config, rangeStart, rangeEnd).map((cycle) => ({
    cycle,
    usedDays: cycleUsedDays(cycle, regular),
  }));
  // 주기에 속한 날을 모두 빼면 첫 적립 전에 쓴 날만 남는다.
  const covered = cycles.reduce((sum, entry) => sum + entry.usedDays, 0);
  return { cycles, beforeFirstGrantDays: totalDays - covered };
}

/**
 * 주기 구분용 색. 달력에서 각 날짜 밑에 얇은 선으로 깔려 주기 경계를 보여준다.
 * 인접한 주기가 서로 다른 색을 갖도록 순번을 돌려 쓴다.
 */
export const CYCLE_COLORS = [
  "#2f6df6",
  "#0f9d76",
  "#e08404",
  "#a747d6",
  "#e0456b",
  "#0d93b8",
] as const;

/** 주기 순번(1부터)에 대응하는 선 색. */
export function cycleColor(index: number): string {
  const size = CYCLE_COLORS.length;
  return CYCLE_COLORS[(((index - 1) % size) + size) % size]!;
}

/** 오늘을 기준으로 이 주기가 지난 주기인지, 진행 중인지, 아직 오지 않았는지. */
export function cycleState(
  cycle: RegularOvernightCycle,
  today: ISODate,
): "past" | "current" | "future" {
  if (today < cycle.start) return "future";
  if (today > cycle.end) return "past";
  return "current";
}

/** 정기외박을 쓸 수 없는 이유. 없으면 null이 온다. */
export type RegularOvernightBlock =
  /** 첫 적립 전이라 아직 받은 몫이 없다. */
  | { kind: "before_first_grant"; firstGrantDate: ISODate }
  /** 적립일이 전역일 뒤라 그 주기 몫을 애초에 받지 못한다. */
  | { kind: "after_discharge"; cycle: RegularOvernightCycle }
  /** 그 주기 몫보다 많이 쓴다. usedDays는 이미 쓴 것까지 더한 값. */
  | { kind: "over_cycle"; cycle: RegularOvernightCycle; usedDays: number }
  /**
   * 이월 중 — 그 주기가 끝나는 시점까지 쌓인 몫보다 많이 쓴다.
   * `over_cycle`과 달리 주기 하나가 아니라 첫 적립일부터의 누적을 견준다.
   */
  | {
      kind: "over_pool";
      cycle: RegularOvernightCycle;
      grantedDays: number;
      usedDays: number;
    };

/**
 * 요청한 구간을 정기외박으로 쓸 수 있는지 본다. 막을 이유가 있으면 첫 번째 이유를,
 * 없으면 null을 돌려준다. 앱·웹 폼과 서버가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 *
 * 판정은 오늘이 아니라 "그 날짜가 속한 주기" 기준이라, 아직 오지 않은 주기라도
 * 그 몫 안이면 미리 쓸 수 있다. 대신 적립일이 전역 뒤인 주기는 받지 못하므로 막는다.
 *
 * existing은 이미 저장된 구간이다. 수정이라면 부르는 쪽이 그 휴가의 구간을 빼서 넘긴다.
 * 요청이 건드리지 않은 주기는 보지 않는다 — 이미 어긋나 있는 과거를 새 등록의 이유로
 * 삼지 않는다.
 */
export function checkRegularOvernight(input: {
  config: RegularOvernightConfig | null | undefined;
  existing: readonly SegmentLike[];
  requested: readonly SegmentLike[];
  dischargeAt: ISODate;
}): RegularOvernightBlock | null {
  const active = activeConfig(input.config);
  // 자동 적립을 안 쓰면 정기외박도 여느 재원처럼 적립분으로 따진다 — 여기서 막지 않는다.
  if (!active) return null;

  const requestedUsage = regularOvernightUsageByCycle(
    input.config,
    input.requested,
  );
  if (requestedUsage.beforeFirstGrantDays > 0) {
    return { kind: "before_first_grant", firstGrantDate: firstGrantOf(active) };
  }
  if (!requestedUsage.cycles.length) return null;

  for (const { cycle } of requestedUsage.cycles) {
    if (cycle.start > input.dischargeAt) {
      return { kind: "after_discharge", cycle };
    }
  }

  const all = [...input.existing, ...input.requested];

  // 이월 중에는 주기별 상한이 없다. 대신 요청이 건드린 주기의 경계마다 "그때까지 받은
  // 몫"과 "그때까지 쓴 일수"를 견준다. 앞선 주기에서 남긴 몫이 그대로 살아 있으므로
  // 한 주기 몫을 넘겨 쓰는 것 자체는 막지 않는다.
  if (active.carryOver) {
    for (const { cycle } of requestedUsage.cycles) {
      const grantedDays = grantedThroughCycle(active, cycle.index);
      const usedDays = usedThroughCycle(active, all, cycle.index);
      if (usedDays > grantedDays) {
        return { kind: "over_pool", cycle, grantedDays, usedDays };
      }
    }
    return null;
  }

  // 이미 저장된 구간에 이번 요청을 더해 주기별 사용량을 다시 센다.
  const after = regularOvernightUsageByCycle(input.config, all);
  const usedByCycleStart = new Map(
    after.cycles.map((entry) => [entry.cycle.start, entry.usedDays]),
  );
  for (const { cycle } of requestedUsage.cycles) {
    const usedDays = usedByCycleStart.get(cycle.start) ?? 0;
    if (usedDays > cycle.grantDays) {
      return { kind: "over_cycle", cycle, usedDays };
    }
  }
  return null;
}

/** 막힌 이유를 사용자에게 보여줄 한 문장으로. 서버 오류와 폼 오류가 같은 문구를 쓴다. */
export function regularOvernightBlockMessage(
  block: RegularOvernightBlock,
): string {
  if (block.kind === "before_first_grant") {
    return `정기외박은 첫 적립일(${fmtDateShort(block.firstGrantDate)}) 이후부터 사용할 수 있습니다`;
  }
  const { cycle } = block;
  const label = `정기외박 ${cycle.index}주기(${fmtRangeTiny(cycle.start, cycle.end)})`;
  if (block.kind === "after_discharge") {
    return `${label}는 적립일이 전역일 뒤라 쓸 수 없어요`;
  }
  // 이월 중에는 "이 주기 몫"이 아니라 그날까지 쌓인 몫이 상한이라, 견준 기준일을 밝힌다.
  if (block.kind === "over_pool") {
    return `${fmtDateShort(cycle.end)}까지 쌓이는 정기외박 ${block.grantedDays}일을 ${block.usedDays - block.grantedDays}일 초과했어요`;
  }
  return `${label} 몫 ${cycle.grantDays}일을 ${block.usedDays - cycle.grantDays}일 초과했어요`;
}

/**
 * [from, to]가 걸친 주기들 기준으로 쓸 수 있는 정기외박 일수. 여러 주기에 걸치면
 * 가장 빡빡한 주기를 따른다(그 주기가 먼저 막히므로).
 *
 * 폼의 재원 칩 숫자에 쓴다. 초과분은 음수로 그대로 내보내서 "칩 숫자 < 0"과
 * checkRegularOvernight이 막는 순간이 어긋나지 않게 한다.
 * 쓸 수 있는 주기가 하나도 없으면(설정이 꺼졌거나, 첫 적립 전이 끼었거나,
 * 적립일이 전역 뒤인 주기가 끼었거나) 0.
 */
export function regularOvernightAvailableIn(input: {
  config: RegularOvernightConfig | null | undefined;
  used: readonly SegmentLike[];
  dischargeAt: ISODate;
  from: ISODate;
  to: ISODate;
}): number {
  const active = activeConfig(input.config);
  if (!active) return 0;
  // cyclesInRange는 첫 적립 전을 잘라내므로, 범위가 그 앞에서 시작하면 따로 막는다.
  if (input.from < firstGrantOf(active)) return 0;

  const cycles = cyclesInRange(input.config, input.from, input.to);
  if (!cycles.length) return 0;

  let available = Infinity;
  for (const cycle of cycles) {
    if (cycle.start > input.dischargeAt) return 0;
    // 이월이면 이 주기 몫이 아니라 이 주기가 끝나는 시점까지의 누적이 상한이다.
    // 여러 주기에 걸치면 여기서도 가장 빡빡한 주기를 따른다(그 주기가 먼저 막힌다).
    const remaining = active.carryOver
      ? grantedThroughCycle(active, cycle.index) -
        usedThroughCycle(active, input.used, cycle.index)
      : cycleRemainingDays(cycle, input.used);
    if (remaining < available) available = remaining;
  }
  return available;
}
