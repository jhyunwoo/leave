/**
 * 정기외박 "주기" 계산.
 *
 * 정기외박은 주기 시작일을 기준으로 주기마다 반복해서 적립된다(입대일과 무관).
 * 주기 정보를 따로 저장하지는 않고, 프로필의 자동 적립 설정
 * (주기 시작일 startDate, 주기 intervalDays, 회당 daysPerGrant)에서 파생한다.
 *
 * 적립은 한 주기를 다 채워야 이뤄진다. 주기 시작일을 S, 주기를 I라 하면 첫 적립일은
 * S가 아니라 S + I이고, 이후 S + 2·I, S + 3·I … 로 이어진다.
 *
 * 주기는 그 적립일부터 센다. k번째(1부터) 주기는 [S + k·I, S + (k+1)·I - 1]이고,
 * 주기 첫날에 회당 적립 일수를 받아 다음 적립 전날(= 그 주기 마지막 날)까지 쓴다.
 * 이월은 없다. S부터 첫 적립 전날까지의 한 주기는 아직 받은 정기외박이 없는 대기
 * 구간이라 어떤 주기에도 속하지 않고, 그 사이에는 쓸 수 있는 정기외박도 없다.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import { segmentBalanceKey, type LeaveSegment } from "./leave";

/** 아무리 긴 범위를 물어봐도 폭주하지 않도록 두는 주기 수 상한. */
const MAX_CYCLES = 500;

export type RegularOvernightConfig = {
  enabled: boolean;
  /** 주기를 세기 시작하는 날. 첫 적립은 한 주기 뒤(S + I)이고 그때 1주기가 시작한다. */
  startDate: string | null;
  intervalDays: number | null;
  daysPerGrant: number | null;
};

type ActiveConfig = {
  startDate: ISODate;
  intervalDays: number;
  daysPerGrant: number;
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

/** 설정이 켜져 있고 값이 모두 채워졌을 때만 주기를 계산할 수 있다. */
function activeConfig(config: RegularOvernightConfig | null | undefined) {
  if (
    !config?.enabled ||
    !config.startDate ||
    !config.intervalDays ||
    !config.daysPerGrant ||
    config.intervalDays < 1
  ) {
    return null;
  }
  return {
    startDate: config.startDate,
    intervalDays: config.intervalDays,
    daysPerGrant: config.daysPerGrant,
  } satisfies ActiveConfig;
}

/** 첫 적립일. 한 주기를 다 채운 뒤이므로 주기 시작일이 아니라 그 한 주기 뒤다. */
function firstGrantOf(config: ActiveConfig): ISODate {
  return addDays(config.startDate, config.intervalDays);
}

/** date가 속한 주기의 시작일. 첫 적립 전이면 아직 주기가 없어 null. */
function cycleStartOf(config: ActiveConfig, date: ISODate): ISODate | null {
  const first = firstGrantOf(config);
  const offset = diffDays(first, date);
  if (offset < 0) return null;
  const k = Math.floor(offset / config.intervalDays);
  return addDays(first, k * config.intervalDays);
}

function buildCycle(
  config: ActiveConfig,
  start: ISODate,
): RegularOvernightCycle {
  const index =
    Math.floor(diffDays(firstGrantOf(config), start) / config.intervalDays) + 1;
  return {
    index,
    start,
    end: addDays(start, config.intervalDays - 1),
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
  const start = cycleStartOf(active, date);
  return start ? buildCycle(active, start) : null;
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
  let start = cycleStartOf(active, from)!;
  for (let guard = 0; start <= rangeEnd && guard < MAX_CYCLES; guard += 1) {
    cycles.push(buildCycle(active, start));
    start = addDays(start, active.intervalDays);
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
  for (
    let date = firstGrantOf(active);
    date <= on && dates.length < MAX_CYCLES;
    date = addDays(date, active.intervalDays)
  ) {
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
  const first = firstGrantOf(active);
  if (on < first) return first;
  const k =
    Math.floor(diffDays(active.startDate, on) / active.intervalDays) + 1;
  return addDays(active.startDate, k * active.intervalDays);
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

/** 주기 몫에서 아직 쓰지 않고 남은 일수. 주기가 끝나면 이월 없이 사라진다. */
export function cycleRemainingDays(
  cycle: RegularOvernightCycle,
  segments: readonly SegmentLike[],
): number {
  return cycle.grantDays - cycleUsedDays(cycle, segments);
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
