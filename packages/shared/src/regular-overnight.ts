/**
 * 정기외박 "주기" 계산.
 *
 * 정기외박은 적립 주기 안에 소진해야 하므로 달력에서 주기 경계를 보여줘야 한다.
 * 주기 정보를 따로 저장하지는 않고, 프로필의 자동 적립 설정
 * (다음 적립일 nextGrantDate, 주기 intervalDays, 회당 daysPerGrant)에서 파생한다.
 *
 * 적립일을 앵커 A, 주기를 I라 하면 주기 경계는 A + k·I (k는 음수 포함 정수)이고
 * 한 주기는 [A + k·I, A + (k+1)·I - 1]이다.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import { segmentBalanceKey, type LeaveSegment } from "./leave";

export type RegularOvernightConfig = {
  enabled: boolean;
  nextGrantDate: string | null;
  intervalDays: number | null;
  daysPerGrant: number | null;
};

type ActiveConfig = {
  nextGrantDate: ISODate;
  intervalDays: number;
  daysPerGrant: number;
};

export type RegularOvernightCycle = {
  /** 입대일이 속한 주기를 1로 두고 센 순번. 표시용("3주기"). */
  index: number;
  start: ISODate;
  end: ISODate;
  /** 이 주기에 적립되는 일수. */
  grantDays: number;
};

/** 설정이 켜져 있고 값이 모두 채워졌을 때만 주기를 계산할 수 있다. */
function activeConfig(config: RegularOvernightConfig | null | undefined) {
  if (
    !config?.enabled ||
    !config.nextGrantDate ||
    !config.intervalDays ||
    !config.daysPerGrant ||
    config.intervalDays < 1
  ) {
    return null;
  }
  return {
    nextGrantDate: config.nextGrantDate,
    intervalDays: config.intervalDays,
    daysPerGrant: config.daysPerGrant,
  } satisfies ActiveConfig;
}

/** date가 속한 주기의 시작일. */
function cycleStartOf(config: ActiveConfig, date: ISODate): ISODate {
  const offset = diffDays(config.nextGrantDate, date);
  const k = Math.floor(offset / config.intervalDays);
  return addDays(config.nextGrantDate, k * config.intervalDays);
}

function buildCycle(
  config: ActiveConfig,
  start: ISODate,
  enlistedAt: ISODate,
): RegularOvernightCycle {
  const base = cycleStartOf(config, enlistedAt);
  return {
    index: Math.floor(diffDays(base, start) / config.intervalDays) + 1,
    start,
    end: addDays(start, config.intervalDays - 1),
    grantDays: config.daysPerGrant,
  };
}

/** date가 속한 주기. 설정이 없으면 null. */
export function cycleFor(
  config: RegularOvernightConfig | null | undefined,
  date: ISODate,
  enlistedAt: ISODate,
): RegularOvernightCycle | null {
  const active = activeConfig(config);
  if (!active) return null;
  return buildCycle(active, cycleStartOf(active, date), enlistedAt);
}

/** [rangeStart, rangeEnd]와 하루라도 겹치는 모든 주기. 설정이 없으면 빈 배열. */
export function cyclesInRange(
  config: RegularOvernightConfig | null | undefined,
  rangeStart: ISODate,
  rangeEnd: ISODate,
  enlistedAt: ISODate,
): RegularOvernightCycle[] {
  const active = activeConfig(config);
  if (!active || rangeEnd < rangeStart) return [];
  const cycles: RegularOvernightCycle[] = [];
  let start = cycleStartOf(active, rangeStart);
  // 범위가 아무리 길어도 폭주하지 않도록 상한을 둔다.
  for (let guard = 0; start <= rangeEnd && guard < 500; guard += 1) {
    cycles.push(buildCycle(active, start, enlistedAt));
    start = addDays(start, active.intervalDays);
  }
  return cycles;
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
