/**
 * 외출 "주기" 판정.
 *
 * 사용처: 휴가 등록 폼(웹·앱), 서버의 저장 전 검사, 달력의 주기 시작일 마커.
 *
 * 주기를 만드는 산술은 정기외박과 똑같아 `leave-cycle.ts`를 그대로 쓴다. 다른 것은
 * 두 가지다.
 *
 * 1. **외출 구간은 하루다.** 부대관리훈령의 외출은 그날 과업 개시부터 저녁점호 전까지,
 *    즉 당일 복귀다(48시간까지 가는 외박과 갈리는 지점이 정확히 여기다). 그래서 구간
 *    하나가 여러 주기에 걸칠 수 없고, 정기외박이 필요로 하는 "어느 주기에서 차감할지"
 *    선택(`regularOvernightCycleStart`)이 통째로 필요 없다. 저장 컬럼도 두지 않는다.
 *    회당 적립 일수(`daysPerGrant`)가 곧 **그 주기에 나갈 수 있는 횟수**다.
 *
 * 2. **주머니가 둘이다.** 평일 외출과 주말 외출은 횟수가 따로 관리돼(OUTING_KINDS 주석)
 *    설정도 판정도 갈래마다 한 벌씩 돈다. 한쪽을 다 써도 다른 쪽은 그대로 남는다.
 *
 * 달력 표시도 정기외박과 다르다. 정기외박은 주기마다 도는 색 선으로 경계를 보여주지만,
 * 외출까지 같은 방식을 쓰면 한 칸에 색 체계가 둘이 되어 어느 색이 무엇인지 읽을 수
 * 없다. 외출은 **주기 시작일 하루에만 마커를 찍는다**(`outingCycleStartsInRange`).
 */

import { fmtDateShort, fmtRangeTiny } from "./calendar";
import { diffDays, eachDate, type ISODate } from "./dates";
import {
  BALANCE_LABELS,
  segmentBalanceKey,
  type BalanceKey,
  type OutingKind,
  type SegmentLike,
} from "./leave";
import {
  activeLeaveCycleConfig,
  cycleFor,
  cyclesInRange,
  firstGrantOf,
  grantedThroughCycle,
  usedThroughCycle,
  type ActiveLeaveCycleConfig,
  type LeaveCycle,
  type LeaveCycleConfig,
} from "./leave-cycle";

/** 외출 갈래 하나의 자동 적립 설정. 정기외박과 같은 모양이다. */
export type OutingConfig = LeaveCycleConfig;

/** 갈래별 설정 한 벌. 응답과 폼이 함께 들고 다닌다. */
export type OutingConfigs = Record<OutingKind, OutingConfig | null>;

/** 그 갈래가 차감하는 재원. */
export function outingBalanceKey(kind: OutingKind): BalanceKey {
  return kind === "weekend" ? "weekend_outing" : "outing";
}

/** 재원이 외출이면 그 갈래, 아니면 null. */
export function outingKindOfBalanceKey(key: BalanceKey): OutingKind | null {
  if (key === "outing") return "weekday";
  if (key === "weekend_outing") return "weekend";
  return null;
}

/** 두 갈래를 도는 자리에서 쓰는 목록. `OUTING_KINDS`의 별칭이 아니라 재원 쌍이다. */
export const OUTING_BALANCE_KEYS = ["outing", "weekend_outing"] as const;

/** 이 재원이 외출인가. 잔여 검사에서 주기 재원을 갈라낼 때 쓴다. */
export function isOutingBalanceKey(key: BalanceKey): boolean {
  return outingKindOfBalanceKey(key) !== null;
}

/* ------------------------------------------------------------------ 주기 조회 */

/** date가 속한 외출 주기. 설정이 없거나 첫 적립 전이면 null. */
export function outingCycleFor(
  config: OutingConfig | null | undefined,
  date: ISODate,
): LeaveCycle | null {
  return cycleFor(config, date);
}

/**
 * 화면에 그릴 주기. 전역일 다음 날부터는 돌려주지 않는다.
 * 이유는 `cycleForDisplay`(regular-overnight.ts)와 같다 — 복무가 끝난 뒤의 주기는
 * 받을 일도 쓸 일도 없고, `checkOuting`도 그 주기를 이미 막는다.
 */
export function outingCycleForDisplay(
  config: OutingConfig | null | undefined,
  date: ISODate,
  dischargeAt: ISODate | null | undefined,
): LeaveCycle | null {
  if (dischargeAt && date > dischargeAt) return null;
  return cycleFor(config, date);
}

/** [rangeStart, rangeEnd]와 겹치는 모든 외출 주기. */
export function outingCyclesInRange(
  config: OutingConfig | null | undefined,
  rangeStart: ISODate,
  rangeEnd: ISODate,
): LeaveCycle[] {
  return cyclesInRange(config, rangeStart, rangeEnd);
}

/**
 * 달력 마커용 — [rangeStart, rangeEnd] **안에서 시작하는** 주기들.
 *
 * `outingCyclesInRange`와 다르다. 저쪽은 범위와 하루라도 겹치면 돌려주므로 지난달에
 * 시작해 이번 달로 넘어온 주기가 섞이는데, 마커는 "그 날짜에 새 주기가 열렸다"는
 * 표시라 시작일이 범위 안인 것만 필요하다.
 *
 * 전역일 뒤에 적립되는 주기는 받지 못하므로 뺀다(`checkOuting`의 after_discharge와
 * 같은 기준이어야 화면과 규칙이 같은 말을 한다).
 */
export function outingCycleStartsInRange(
  config: OutingConfig | null | undefined,
  rangeStart: ISODate,
  rangeEnd: ISODate,
  dischargeAt?: ISODate | null,
): LeaveCycle[] {
  return cyclesInRange(config, rangeStart, rangeEnd).filter(
    (cycle) =>
      cycle.start >= rangeStart &&
      cycle.start <= rangeEnd &&
      (!dischargeAt || cycle.start <= dischargeAt),
  );
}

/**
 * 그 날짜에 대해 화면이 할 말. 없으면 null.
 *
 * 달력 마커는 "주기가 열리는 날"만 찍지만, 날짜를 눌러 상세를 열면 주기 **안의**
 * 날에도 어느 주기인지 알려줘야 한다 — 마커가 없는 날에 "그래서 이번 달 외출은
 * 몇 번 남았나"를 답할 자리가 거기밖에 없다.
 */
export type OutingCycleNote = {
  kind: OutingKind;
  cycle: LeaveCycle;
  /** 이 날이 주기 첫날(적립일)인가. */
  isStart: boolean;
};

/** 이 갈래에서 그 날짜가 속한 주기와, 그 날이 첫날인지. 전역 뒤·첫 적립 전이면 null. */
export function outingCycleNoteFor(
  kind: OutingKind,
  config: OutingConfig | null | undefined,
  date: ISODate,
  dischargeAt: ISODate | null | undefined,
): OutingCycleNote | null {
  const cycle = outingCycleForDisplay(config, date, dischargeAt);
  if (!cycle) return null;
  // 적립일이 전역 뒤인 주기는 받지 못하므로 알릴 것도 없다(checkOuting과 같은 기준).
  if (dischargeAt && cycle.start > dischargeAt) return null;
  return { kind, cycle, isStart: cycle.start === date };
}

/** 자동 적립 설정이 살아 있어 이 갈래를 주기 단위로 다뤄야 하는지. */
export function isOutingCycleBased(
  config: OutingConfig | null | undefined,
): boolean {
  return activeLeaveCycleConfig(config) !== null;
}

/* ------------------------------------------------------------------ 사용량 */

/** SegmentLike는 갈래가 null일 수 있어 재원 판별 전에 맞춰준다. */
function balanceKeyOf(segment: SegmentLike): BalanceKey {
  return segmentBalanceKey({
    category: segment.category,
    overnightKind: segment.overnightKind ?? undefined,
    outingKind: segment.outingKind ?? undefined,
  });
}

/**
 * 그 주기 안에 든 이 갈래의 외출 일수(= 횟수).
 *
 * 날짜 집합으로 센다 — 상태가 다른 두 휴가가 같은 날짜에 겹칠 수 있고(초안 + 실제),
 * 하루를 두 번 세면 주기 몫이 두 배로 소진된 것처럼 보인다.
 *
 * 구간은 하루라 주기를 걸칠 수 없지만, 갈래가 생기기 전에 저장된 여러 날짜짜리 외출
 * 구간이 남아 있을 수 있다. 그런 행도 뜻이 통하도록 **겹치는 날짜만** 센다.
 */
export function outingUsedDays(
  kind: OutingKind,
  cycle: LeaveCycle,
  segments: readonly SegmentLike[],
): number {
  const key = outingBalanceKey(kind);
  const used = new Set<ISODate>();
  for (const segment of segments) {
    if (balanceKeyOf(segment) !== key) continue;
    const start =
      segment.startDate > cycle.start ? segment.startDate : cycle.start;
    const end = segment.endDate < cycle.end ? segment.endDate : cycle.end;
    if (start > end) continue;
    for (const date of eachDate(start, end)) used.add(date);
  }
  return used.size;
}

/** 주기 몫에서 아직 쓰지 않고 남은 횟수. */
export function outingRemainingDays(
  kind: OutingKind,
  cycle: LeaveCycle,
  segments: readonly SegmentLike[],
): number {
  return cycle.grantDays - outingUsedDays(kind, cycle, segments);
}

function usedThrough(
  kind: OutingKind,
  active: ActiveLeaveCycleConfig,
  segments: readonly SegmentLike[],
  index: number,
): number {
  return usedThroughCycle(active, index, (cycle) =>
    outingUsedDays(kind, cycle, segments),
  );
}

/**
 * on까지 적립된 이 갈래의 외출 중 아직 쓰지 않은 횟수 — 이월을 켠 사용자의 누적 잔여.
 * 전역일 뒤의 적립은 받지 못하므로 상한을 전역일로 자른다.
 */
export function outingPooledRemaining(input: {
  kind: OutingKind;
  config: OutingConfig | null | undefined;
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
    remaining +=
      cycle.grantDays - outingUsedDays(input.kind, cycle, input.used);
  }
  return remaining;
}

export type OutingCycleUsage = {
  cycle: LeaveCycle;
  usedDays: number;
};

/**
 * 이 갈래의 외출 구간이 어느 주기의 몫을 얼마나 썼는지 주기별로 묶는다.
 * 첫 적립 전 날짜는 어떤 주기에도 속하지 않아 따로 센다.
 */
export function outingUsageByCycle(
  kind: OutingKind,
  config: OutingConfig | null | undefined,
  segments: readonly SegmentLike[],
): { cycles: OutingCycleUsage[]; beforeFirstGrantDays: number } {
  const key = outingBalanceKey(kind);
  const mine = segments.filter((segment) => balanceKeyOf(segment) === key);
  if (!mine.length) return { cycles: [], beforeFirstGrantDays: 0 };

  const active = activeLeaveCycleConfig(config);
  const totalDays = mine.reduce(
    (sum, segment) => sum + diffDays(segment.startDate, segment.endDate) + 1,
    0,
  );
  if (!active) return { cycles: [], beforeFirstGrantDays: totalDays };

  let rangeStart = mine[0]!.startDate;
  let rangeEnd = mine[0]!.endDate;
  for (const segment of mine) {
    if (segment.startDate < rangeStart) rangeStart = segment.startDate;
    if (segment.endDate > rangeEnd) rangeEnd = segment.endDate;
  }

  const cycles = cyclesInRange(config, rangeStart, rangeEnd).map((cycle) => ({
    cycle,
    usedDays: outingUsedDays(kind, cycle, mine),
  }));
  const covered = cycles.reduce((sum, entry) => sum + entry.usedDays, 0);
  return { cycles, beforeFirstGrantDays: totalDays - covered };
}

/* ------------------------------------------------------------------ 판정 */

/**
 * 외출을 쓸 수 없는 이유. 없으면 null이 온다.
 *
 * 정기외박(`RegularOvernightBlock`)에 있는 `cycle_required`·`cycle_mismatch`가 없다 —
 * 구간이 하루라 걸치는 주기가 언제나 하나뿐이고, 고를 것이 없기 때문이다.
 */
export type OutingBlock =
  /** 첫 적립 전이라 아직 받은 몫이 없다. */
  | { kind: "before_first_grant"; firstGrantDate: ISODate }
  /** 적립일이 전역일 뒤라 그 주기 몫을 애초에 받지 못한다. */
  | { kind: "after_discharge"; cycle: LeaveCycle }
  /** 그 주기 몫보다 많이 쓴다. usedDays는 이미 쓴 것까지 더한 값. */
  | { kind: "over_cycle"; cycle: LeaveCycle; usedDays: number }
  /** 이월 중 — 그 주기가 끝나는 시점까지 쌓인 몫보다 많이 쓴다. */
  | {
      kind: "over_pool";
      cycle: LeaveCycle;
      grantedDays: number;
      usedDays: number;
    };

/**
 * 요청한 구간을 이 갈래의 외출로 쓸 수 있는지 본다. 폼과 서버가 같은 규칙을 쓴다.
 *
 * existing은 이미 저장된 구간이다. 수정이라면 부르는 쪽이 그 휴가의 구간을 빼서 넘긴다.
 * 요청이 건드리지 않은 주기는 보지 않는다 — 이미 어긋나 있는 과거를 새 등록의 이유로
 * 삼지 않는다(`checkRegularOvernight`와 같은 원칙).
 */
export function checkOuting(input: {
  kind: OutingKind;
  config: OutingConfig | null | undefined;
  existing: readonly SegmentLike[];
  requested: readonly SegmentLike[];
  dischargeAt: ISODate;
}): OutingBlock | null {
  const active = activeLeaveCycleConfig(input.config);
  // 자동 적립을 안 쓰면 외출도 여느 재원처럼 적립분으로 따진다 — 여기서 막지 않는다.
  if (!active) return null;

  const key = outingBalanceKey(input.kind);
  const requestedCycles = new Map<string, LeaveCycle>();
  for (const segment of input.requested) {
    if (balanceKeyOf(segment) !== key) continue;
    const overlapping = cyclesInRange(
      input.config,
      segment.startDate,
      segment.endDate,
    );
    // cyclesInRange는 첫 적립 앞을 잘라내므로, 그 앞에서 시작하는 구간은 따로 막는다.
    if (!overlapping.length || segment.startDate < firstGrantOf(active)) {
      return {
        kind: "before_first_grant",
        firstGrantDate: firstGrantOf(active),
      };
    }
    for (const cycle of overlapping) {
      if (cycle.start > input.dischargeAt) {
        return { kind: "after_discharge", cycle };
      }
      requestedCycles.set(cycle.start, cycle);
    }
  }
  if (!requestedCycles.size) return null;

  const all = [...input.existing, ...input.requested];

  // 이월 중에는 주기별 상한이 없다. 요청이 건드린 주기의 경계마다 "그때까지 받은 몫"과
  // "그때까지 쓴 횟수"를 견준다.
  if (active.carryOver) {
    for (const cycle of requestedCycles.values()) {
      const grantedDays = grantedThroughCycle(active, cycle.index);
      const usedDays = usedThrough(input.kind, active, all, cycle.index);
      if (usedDays > grantedDays) {
        return { kind: "over_pool", cycle, grantedDays, usedDays };
      }
    }
    return null;
  }

  for (const cycle of requestedCycles.values()) {
    const usedDays = outingUsedDays(input.kind, cycle, all);
    if (usedDays > cycle.grantDays) {
      return { kind: "over_cycle", cycle, usedDays };
    }
  }
  return null;
}

/** 막힌 이유를 사용자에게 보여줄 한 문장으로. 서버 오류와 폼 오류가 같은 문구를 쓴다. */
export function outingBlockMessage(
  kind: OutingKind,
  block: OutingBlock,
): string {
  const name = BALANCE_LABELS[outingBalanceKey(kind)];
  if (block.kind === "before_first_grant") {
    return `${name}은 첫 적립일(${fmtDateShort(block.firstGrantDate)}) 이후부터 사용할 수 있습니다`;
  }
  const { cycle } = block;
  const label = `${name} ${cycle.index}주기(${fmtRangeTiny(cycle.start, cycle.end)})`;
  if (block.kind === "after_discharge") {
    return `${label}는 적립일이 전역일 뒤라 쓸 수 없어요`;
  }
  if (block.kind === "over_pool") {
    return `${fmtDateShort(cycle.end)}까지 쌓이는 ${name} ${block.grantedDays}회를 ${block.usedDays - block.grantedDays}회 초과했어요`;
  }
  return `${label} 몫 ${cycle.grantDays}회를 ${block.usedDays - cycle.grantDays}회 초과했어요`;
}

/**
 * [from, to]가 걸친 주기 기준으로 쓸 수 있는 이 갈래의 외출 횟수.
 *
 * 폼의 재원 칩 숫자에 쓴다. 초과분은 음수로 그대로 내보내서 "칩 숫자 < 0"과
 * `checkOuting`이 막는 순간이 어긋나지 않게 한다.
 */
export function outingAvailableIn(input: {
  kind: OutingKind;
  config: OutingConfig | null | undefined;
  used: readonly SegmentLike[];
  dischargeAt: ISODate;
  from: ISODate;
  to: ISODate;
}): number {
  const active = activeLeaveCycleConfig(input.config);
  if (!active) return 0;
  if (input.from < firstGrantOf(active)) return 0;

  const cycles = cyclesInRange(input.config, input.from, input.to);
  if (!cycles.length) return 0;

  let available = Infinity;
  for (const cycle of cycles) {
    if (cycle.start > input.dischargeAt) return 0;
    const remaining = active.carryOver
      ? grantedThroughCycle(active, cycle.index) -
        usedThrough(input.kind, active, input.used, cycle.index)
      : outingRemainingDays(input.kind, cycle, input.used);
    if (remaining < available) available = remaining;
  }
  return available;
}
