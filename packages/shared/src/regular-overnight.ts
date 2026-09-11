/**
 * 정기외박 "주기" 판정.
 *
 * 주기를 만드는 산술 자체는 재원과 무관해 `leave-cycle.ts`에 있다(외출도 같은 것을
 * 쓴다). 이 모듈은 그 위에 정기외박에만 해당하는 것을 얹는다 — 어느 구간이 정기외박인지,
 * 그 구간이 어느 주기의 몫을 얼마나 썼는지, 지금 그것을 써도 되는지.
 *
 * 정기외박이 외출과 갈리는 지점은 **구간이 여러 날이라 여러 주기에 걸칠 수 있다**는
 * 것이다. 그래서 구간마다 "어느 주기에서 차감할지"(`regularOvernightCycleStart`)를
 * 들고 다니고, 걸치는 주기가 둘 이상이면 사용자에게 고르게 한다. 외출은 하루라
 * 그 갈래가 아예 없다(outing.ts).
 */

import { fmtDateShort, fmtRangeTiny } from "./calendar";
import { diffDays, eachDate, type ISODate } from "./dates";
import { segmentBalanceKey, type SegmentLike } from "./leave";
import {
  activeLeaveCycleConfig,
  cycleDateAfter,
  cycleFor,
  cycleState,
  cyclesInRange,
  firstGrantDate,
  firstGrantOf,
  grantDatesThrough,
  grantedThroughCycle,
  leaveCycleCount,
  leaveCycleInterval,
  MAX_LEAVE_CYCLES,
  nextGrantDateAfter,
  usedThroughCycle,
  type ActiveLeaveCycleConfig,
  type LeaveCycle,
  type LeaveCycleConfig,
  type LeaveCycleInterval,
} from "./leave-cycle";

/* ------------------------------------------------ 일반 주기 산술의 정기외박 이름
 *
 * 이 재수출들은 취향이 아니라 계약이다. `@leave/shared/regular-overnight`는 네이티브
 * 앱이 직접 import하는 경로이고, 이 이름들은 이미 화면 여러 곳에 박혀 있다
 * (docs/code-style.md — 프로세스를 벗어난 이름은 취향으로 바꾸지 않는다).
 */

export {
  cycleDateAfter,
  cycleFor,
  cycleState,
  cyclesInRange,
  firstGrantDate,
  grantDatesThrough,
  nextGrantDateAfter,
};

export type { SegmentLike };

/** @see MAX_LEAVE_CYCLES */
export const MAX_REGULAR_OVERNIGHT_CYCLES = MAX_LEAVE_CYCLES;

export type RegularOvernightConfig = LeaveCycleConfig;
export type RegularOvernightInterval = LeaveCycleInterval;
export type RegularOvernightCycle = LeaveCycle;

/** @see leaveCycleInterval */
export function regularOvernightInterval(
  config: RegularOvernightConfig | null | undefined,
): RegularOvernightInterval | null {
  return leaveCycleInterval(config);
}

/** @see leaveCycleCount */
export function regularOvernightCycleCount(
  config: RegularOvernightConfig | null | undefined,
  through: ISODate,
): number {
  return leaveCycleCount(config, through);
}

/* ------------------------------------------------------------ 정기외박 고유 판정 */

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

/** 구간과 하루라도 겹쳐 선택할 수 있는 정기외박 주기. */
export function eligibleRegularOvernightCycles(
  config: RegularOvernightConfig | null | undefined,
  rangeStart: ISODate,
  rangeEnd: ISODate,
  dischargeAt?: ISODate | null,
): RegularOvernightCycle[] {
  return cyclesInRange(config, rangeStart, rangeEnd).filter(
    (cycle) => !dischargeAt || cycle.start <= dischargeAt,
  );
}

/** SegmentLike는 overnightKind가 null일 수 있어 재원 판별 전에 맞춰준다. */
function balanceKeyOf(segment: SegmentLike) {
  return segmentBalanceKey({
    category: segment.category,
    overnightKind: segment.overnightKind ?? undefined,
    outingKind: segment.outingKind ?? undefined,
  });
}

/**
 * 주기와 겹치는 정기외박 구간 일수 합계.
 *
 * 날짜 집합으로 센다 — `leave-grants.ts`의 `usageDates`와 같은 이유다. 상태가 다른 두
 * 휴가는 같은 날짜에 겹칠 수 있고(초안 + 실제), 하루를 두 번 세면 주기 몫이 두 배로
 * 소진된 것처럼 보인다.
 */
export function cycleUsedDays(
  cycle: RegularOvernightCycle,
  segments: readonly SegmentLike[],
): number {
  const used = new Set<ISODate>();
  const add = (from: ISODate, through: ISODate) => {
    for (const date of eachDate(from, through)) used.add(date);
  };
  for (const segment of segments) {
    if (balanceKeyOf(segment) !== "regular_overnight") continue;
    if (segment.regularOvernightCycleStart) {
      if (segment.regularOvernightCycleStart === cycle.start) {
        add(segment.startDate, segment.endDate);
      }
      continue;
    }
    // 마이그레이션 전/오래된 응답은 기존의 겹치는 일수 계산으로 안전하게 읽는다.
    const start =
      segment.startDate > cycle.start ? segment.startDate : cycle.start;
    const end = segment.endDate < cycle.end ? segment.endDate : cycle.end;
    if (start > end) continue;
    add(start, end);
  }
  return used.size;
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

/** 첫 적립일부터 k주기 마지막 날까지 쓴 정기외박 일수. */
function usedThrough(
  active: ActiveLeaveCycleConfig,
  segments: readonly SegmentLike[],
  index: number,
): number {
  return usedThroughCycle(active, index, (cycle) =>
    cycleUsedDays(cycle, segments),
  );
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
  const active = activeLeaveCycleConfig(input.config);
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
  return activeLeaveCycleConfig(config) !== null;
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

  const active = activeLeaveCycleConfig(config);
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
 *
 * 외출 주기는 이 방식을 쓰지 않는다 — 달력에 색 체계가 둘이 되면 어느 색이 무엇인지
 * 읽을 수 없어, 외출은 주기 시작일에 마커 하나만 찍는다(outing.ts).
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

/** 정기외박을 쓸 수 없는 이유. 없으면 null이 온다. */
export type RegularOvernightBlock =
  /** 첫 적립 전이라 아직 받은 몫이 없다. */
  | { kind: "before_first_grant"; firstGrantDate: ISODate }
  /** 적립일이 전역일 뒤라 그 주기 몫을 애초에 받지 못한다. */
  | { kind: "after_discharge"; cycle: RegularOvernightCycle }
  /** 여러 주기와 겹쳐 사용자가 차감 주기를 골라야 한다. */
  | { kind: "cycle_required"; cycles: RegularOvernightCycle[] }
  /** 저장된 선택 주기가 현재 날짜 구간과 더는 겹치지 않는다. */
  | { kind: "cycle_mismatch" }
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
  const active = activeLeaveCycleConfig(input.config);
  // 자동 적립을 안 쓰면 정기외박도 여느 재원처럼 적립분으로 따진다 — 여기서 막지 않는다.
  if (!active) return null;

  const normalizedRequested: SegmentLike[] = [];
  const requestedCycles = new Map<string, RegularOvernightCycle>();
  for (const segment of input.requested) {
    if (balanceKeyOf(segment) !== "regular_overnight") {
      normalizedRequested.push(segment);
      continue;
    }
    const overlapping = cyclesInRange(
      input.config,
      segment.startDate,
      segment.endDate,
    );
    // `cyclesInRange`는 첫 적립 앞을 **잘라내고** 겹치는 주기를 돌려준다. 그래서
    // 첫 적립일을 걸치는 구간(앞에서 시작해 뒤에서 끝나는)은 여기서 따로 막지 않으면
    // 통과해 버리고, 그 전체 일수가 1주기에 얹힌다. 폼의 칩은 같은 경우를
    // `regularOvernightAvailableIn`에서 이미 0으로 막으므로(그쪽 주석 참고)
    // 두 판정이 어긋나 "칩은 0인데 저장은 성공"이 됐다.
    if (!overlapping.length || segment.startDate < firstGrantOf(active)) {
      return {
        kind: "before_first_grant",
        firstGrantDate: firstGrantOf(active),
      };
    }
    const selected = segment.regularOvernightCycleStart
      ? overlapping.find(
          (cycle) => cycle.start === segment.regularOvernightCycleStart,
        )
      : overlapping.length === 1
        ? overlapping[0]
        : undefined;
    if (!selected) {
      return segment.regularOvernightCycleStart
        ? { kind: "cycle_mismatch" }
        : { kind: "cycle_required", cycles: overlapping };
    }
    if (selected.start > input.dischargeAt) {
      return { kind: "after_discharge", cycle: selected };
    }
    requestedCycles.set(selected.start, selected);
    normalizedRequested.push({
      ...segment,
      regularOvernightCycleStart: selected.start,
    });
  }

  const all = [...input.existing, ...normalizedRequested];

  // 이월 중에는 주기별 상한이 없다. 대신 요청이 건드린 주기의 경계마다 "그때까지 받은
  // 몫"과 "그때까지 쓴 일수"를 견준다. 앞선 주기에서 남긴 몫이 그대로 살아 있으므로
  // 한 주기 몫을 넘겨 쓰는 것 자체는 막지 않는다.
  if (active.carryOver) {
    for (const cycle of requestedCycles.values()) {
      const grantedDays = grantedThroughCycle(active, cycle.index);
      const usedDays = usedThrough(active, all, cycle.index);
      if (usedDays > grantedDays) {
        return { kind: "over_pool", cycle, grantedDays, usedDays };
      }
    }
    return null;
  }

  // 이미 저장된 구간에 이번 요청을 더해 주기별 사용량을 다시 센다.
  for (const cycle of requestedCycles.values()) {
    const usedDays = cycleUsedDays(cycle, all);
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
  if (block.kind === "cycle_required") {
    return "여러 정기외박 주기에 걸쳐 있어 차감할 주기를 선택해주세요";
  }
  if (block.kind === "cycle_mismatch") {
    return "선택한 정기외박 주기가 현재 기간과 겹치지 않아요";
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
  cycleStart?: ISODate | null;
}): number {
  const active = activeLeaveCycleConfig(input.config);
  if (!active) return 0;
  // cyclesInRange는 첫 적립 전을 잘라내므로, 범위가 그 앞에서 시작하면 따로 막는다.
  if (input.from < firstGrantOf(active)) return 0;

  const overlapping = cyclesInRange(input.config, input.from, input.to);
  const cycles = input.cycleStart
    ? overlapping.filter((cycle) => cycle.start === input.cycleStart)
    : overlapping;
  if (!cycles.length) return 0;

  let available = Infinity;
  for (const cycle of cycles) {
    if (cycle.start > input.dischargeAt) return 0;
    // 이월이면 이 주기 몫이 아니라 이 주기가 끝나는 시점까지의 누적이 상한이다.
    // 여러 주기에 걸치면 여기서도 가장 빡빡한 주기를 따른다(그 주기가 먼저 막힌다).
    const remaining = active.carryOver
      ? grantedThroughCycle(active, cycle.index) -
        usedThrough(active, input.used, cycle.index)
      : cycleRemainingDays(cycle, input.used);
    if (remaining < available) available = remaining;
  }
  return available;
}
