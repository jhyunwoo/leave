/**
 * 정기외박 "주기" 계산.
 *
 * 정기외박은 적립 시작일을 기준으로 주기마다 반복해서 부여된다(입대일과 무관).
 * 주기 정보를 따로 저장하지는 않고, 프로필의 자동 적립 설정
 * (적립 시작일 startDate, 주기 intervalDays, 회당 daysPerGrant)에서 파생한다.
 *
 * 적립 시작일을 S, 주기를 I라 하면 k번째(0부터) 주기는 [S + k·I, S + (k+1)·I - 1]이고
 * 적립일은 각 주기의 첫날이다. S 이전에는 주기가 없다.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import { segmentBalanceKey, type LeaveSegment } from "./leave";

/** 아무리 긴 범위를 물어봐도 폭주하지 않도록 두는 주기 수 상한. */
const MAX_CYCLES = 500;

export type RegularOvernightConfig = {
  enabled: boolean;
  /** 적립 시작일 — 이 날 첫 적립이 이뤄지고 이후 주기마다 반복된다. */
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
  /** 적립 시작일이 속한 첫 주기를 1로 두고 센 순번. 표시용("3주기"). */
  index: number;
  start: ISODate;
  end: ISODate;
  /** 이 주기의 첫날에 적립되는 일수. */
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

/** date가 속한 주기의 시작일. 적립 시작일 이전이면 null. */
function cycleStartOf(config: ActiveConfig, date: ISODate): ISODate | null {
  const offset = diffDays(config.startDate, date);
  if (offset < 0) return null;
  const k = Math.floor(offset / config.intervalDays);
  return addDays(config.startDate, k * config.intervalDays);
}

function buildCycle(
  config: ActiveConfig,
  start: ISODate,
): RegularOvernightCycle {
  return {
    index:
      Math.floor(diffDays(config.startDate, start) / config.intervalDays) + 1,
    start,
    end: addDays(start, config.intervalDays - 1),
    grantDays: config.daysPerGrant,
  };
}

/** date가 속한 주기. 설정이 없거나 적립 시작 전이면 null. */
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
  // 적립 시작 전에는 주기가 없으므로 범위를 시작일 이후로 자른다.
  const from = rangeStart > active.startDate ? rangeStart : active.startDate;
  if (from > rangeEnd) return [];

  const cycles: RegularOvernightCycle[] = [];
  let start = cycleStartOf(active, from)!;
  for (let guard = 0; start <= rangeEnd && guard < MAX_CYCLES; guard += 1) {
    cycles.push(buildCycle(active, start));
    start = addDays(start, active.intervalDays);
  }
  return cycles;
}

/** 적립 시작일부터 on까지 도래한 모든 적립일(각 주기의 첫날). */
export function grantDatesThrough(
  config: RegularOvernightConfig | null | undefined,
  on: ISODate,
): ISODate[] {
  const active = activeConfig(config);
  if (!active || on < active.startDate) return [];
  const dates: ISODate[] = [];
  for (
    let date = active.startDate;
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
  if (on < active.startDate) return active.startDate;
  const k =
    Math.floor(diffDays(active.startDate, on) / active.intervalDays) + 1;
  return addDays(active.startDate, k * active.intervalDays);
}

/** 주기와 겹치는 정기외박 구간 일수 합계. */
export function cycleUsedDays(
  cycle: RegularOvernightCycle,
  segments: readonly Pick<
    LeaveSegment,
    "category" | "overnightKind" | "startDate" | "endDate"
  >[],
): number {
  let used = 0;
  for (const segment of segments) {
    if (segmentBalanceKey(segment) !== "regular_overnight") continue;
    const start =
      segment.startDate > cycle.start ? segment.startDate : cycle.start;
    const end = segment.endDate < cycle.end ? segment.endDate : cycle.end;
    if (start > end) continue;
    used += diffDays(start, end) + 1;
  }
  return used;
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
