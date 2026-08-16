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

import { fmtDateShort, fmtRangeTiny } from "./calendar";
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

/** 정기외박을 쓸 수 없는 이유. 없으면 null이 온다. */
export type RegularOvernightBlock =
  /** 첫 적립 전이라 아직 받은 몫이 없다. */
  | { kind: "before_first_grant"; firstGrantDate: ISODate }
  /** 적립일이 전역일 뒤라 그 주기 몫을 애초에 받지 못한다. */
  | { kind: "after_discharge"; cycle: RegularOvernightCycle }
  /** 그 주기 몫보다 많이 쓴다. usedDays는 이미 쓴 것까지 더한 값. */
  | { kind: "over_cycle"; cycle: RegularOvernightCycle; usedDays: number };

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

  // 이미 저장된 구간에 이번 요청을 더해 주기별 사용량을 다시 센다.
  const after = regularOvernightUsageByCycle(input.config, [
    ...input.existing,
    ...input.requested,
  ]);
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
    const remaining = cycleRemainingDays(cycle, input.used);
    if (remaining < available) available = remaining;
  }
  return available;
}
