/**
 * 재원의 "주기" 산술 — 정기외박과 외출이 함께 쓰는 순수 계산.
 *
 * 주기로 굴러가는 재원은 주기 시작일을 기준으로 주기마다 반복해서 적립된다
 * (입대일과 무관). 주기 정보를 따로 저장하지는 않고, 사용자의 자동 적립 설정
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
 * S부터 첫 적립 전날까지의 한 주기는 아직 받은 몫이 없는 대기 구간이라 어떤 주기에도
 * 속하지 않고, 그 사이에는 쓸 수 있는 몫도 없다.
 *
 * 이월(carryOver)은 기본적으로 없다 — 주기가 끝나면 남은 몫이 사라진다. 켜면 첫
 * 적립일부터의 모든 주기가 하나의 누적 잔여로 합쳐진다.
 *
 * 이월에서도 주기라는 단위는 사라지지 않는다. k주기까지 받은 몫은 `회당 × k`이고,
 * 판정은 "주기 경계마다 그때까지 쓴 일수가 그때까지 받은 몫을 넘지 않는가"다.
 * 받은 몫은 적립일에만 계단처럼 오르고 사용량은 단조 증가하므로, 주기 경계만 보면
 * 그 사이의 모든 날이 함께 지켜진다.
 *
 * **이 모듈은 어느 재원인지 모른다.** "그 주기를 며칠 썼는가"처럼 재원을 알아야 하는
 * 판정은 부르는 쪽(regular-overnight.ts · outing.ts)이 갖는다.
 */

import {
  addDays,
  addMonthsClamped,
  diffDays,
  fullMonthsBetween,
} from "./dates";
import type { ISODate } from "./dates";

/**
 * 한 사용자가 한 재원에서 가질 수 있는 주기 수 상한.
 *
 * 이 값은 두 가지를 한꺼번에 떠받친다 — 아무리 긴 범위를 물어봐도 `cyclesInRange`가
 * 폭주하지 않게 하는 것, 그리고 보유 휴가 화면이 주기를 쏟아내지 않게 하는 것이다.
 * **두 자리가 다른 수를 쓰면 안 된다.** 목록은 200개까지, 이월 누적은 500개까지
 * 세던 동안에는 화면의 주기 합계와 "누적 잔여"가 조용히 갈렸다.
 *
 * 무음 절단을 막는 진짜 장치는 이 수가 아니라 **설정을 저장할 때 막는 것**이다
 * (`leaveCycleCount`). 주기 시작일에 하한이 없어서 1900년 + 1일 주기 같은 설정이
 * 들어오면 4만 주기가 되고, 그때 이 상한은 잔여를 몇 배로 줄여 버린다.
 * 저장에서 걸러 두면 여기 도달하는 일이 없고, 남은 것은 마지막 방어선뿐이다.
 */
export const MAX_LEAVE_CYCLES = 500;

/**
 * 주기 재원 하나의 자동 적립 설정.
 *
 * 정기외박(`regular_overnight_configs`)과 외출(`outing_configs`)이 같은 모양을 쓴다 —
 * 규정의 문장 구조가 같기 때문이다("언제부터, 얼마마다, 회당 몇").
 */
export type LeaveCycleConfig = {
  enabled: boolean;
  /** 주기를 세기 시작하는 날. 첫 적립은 한 주기 뒤(S + I)이고 그때 1주기가 시작한다. */
  startDate: string | null;
  /** 일 단위 주기. 달 단위와 둘 중 하나만 값을 갖는다(해·공군 정기외박의 42일). */
  intervalDays: number | null;
  /** 달 단위 주기. 달력의 분기·달에 맞춰 돌아야 하는 주기에 쓴다(육군의 3개월, 외출의 1개월). */
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
export type LeaveCycleInterval =
  { unit: "day"; value: number } | { unit: "month"; value: number };

/** 값이 모두 채워져 실제로 주기를 만들 수 있는 설정. */
export type ActiveLeaveCycleConfig = {
  startDate: ISODate;
  interval: LeaveCycleInterval;
  daysPerGrant: number;
  carryOver: boolean;
};

export type LeaveCycle = {
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
export function leaveCycleInterval(
  config: LeaveCycleConfig | null | undefined,
): LeaveCycleInterval | null {
  const months = config?.intervalMonths;
  if (months && months >= 1) return { unit: "month", value: months };
  const days = config?.intervalDays;
  if (days && days >= 1) return { unit: "day", value: days };
  return null;
}

/** 설정이 켜져 있고 값이 모두 채워졌을 때만 주기를 계산할 수 있다. */
export function activeLeaveCycleConfig(
  config: LeaveCycleConfig | null | undefined,
): ActiveLeaveCycleConfig | null {
  const interval = leaveCycleInterval(config);
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
  };
}

/**
 * 주기 시작일에서 k주기 뒤 날짜. k=1이 첫 적립일이다.
 *
 * 언제나 시작일에서 한 번에 더한다. 달 단위에서 한 주기씩 이어 붙이면 말일이
 * 끌려간다 — 1/31에서 3개월씩 두 번은 4/30 → 7/30이지만, 6개월을 한 번에 더하면
 * 7/31이다. 규정이 말하는 것은 후자다.
 */
export function cycleDateAt(
  config: ActiveLeaveCycleConfig,
  k: number,
): ISODate {
  return config.interval.unit === "month"
    ? addMonthsClamped(config.startDate, k * config.interval.value)
    : addDays(config.startDate, k * config.interval.value);
}

/**
 * date가 주기 시작일에서 몇 주기 지났는지(내림). 시작일 이전이면 1보다 작은 값이
 * 나와 "아직 주기가 없다"로 읽힌다.
 */
export function cyclesElapsed(
  config: ActiveLeaveCycleConfig,
  date: ISODate,
): number {
  const { interval, startDate } = config;
  return interval.unit === "month"
    ? Math.floor(fullMonthsBetween(startDate, date) / interval.value)
    : Math.floor(diffDays(startDate, date) / interval.value);
}

/** 첫 적립일. 한 주기를 다 채운 뒤이므로 주기 시작일이 아니라 그 한 주기 뒤다. */
export function firstGrantOf(config: ActiveLeaveCycleConfig): ISODate {
  return cycleDateAt(config, 1);
}

export function buildCycle(
  config: ActiveLeaveCycleConfig,
  index: number,
): LeaveCycle {
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
  config: LeaveCycleConfig | null | undefined,
  date: ISODate,
): LeaveCycle | null {
  const active = activeLeaveCycleConfig(config);
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
  config: LeaveCycleConfig | null | undefined,
  cycles: number,
): ISODate | null {
  const active = activeLeaveCycleConfig(config);
  return active ? cycleDateAt(active, cycles) : null;
}

/** [rangeStart, rangeEnd]와 하루라도 겹치는 모든 주기. 설정이 없으면 빈 배열. */
export function cyclesInRange(
  config: LeaveCycleConfig | null | undefined,
  rangeStart: ISODate,
  rangeEnd: ISODate,
): LeaveCycle[] {
  const active = activeLeaveCycleConfig(config);
  if (!active || rangeEnd < rangeStart) return [];
  // 첫 적립 전에는 주기가 없으므로 범위를 첫 적립일 이후로 자른다.
  const first = firstGrantOf(active);
  const from = rangeStart > first ? rangeStart : first;
  if (from > rangeEnd) return [];

  const cycles: LeaveCycle[] = [];
  let index = Math.max(cyclesElapsed(active, from), 1);
  for (let guard = 0; guard < MAX_LEAVE_CYCLES; guard += 1) {
    const cycle = buildCycle(active, index);
    if (cycle.start > rangeEnd) break;
    cycles.push(cycle);
    index += 1;
  }
  return cycles;
}

/**
 * 설정이 `through`까지 만들어 내는 주기 수. 주기를 실제로 만들지 않고 센다.
 *
 * 설정을 저장할 때 상한을 넘는지 보는 데 쓴다 — 주기 시작일에 하한이 없어서
 * "1900-01-01 + 1일 주기"가 들어올 수 있고, 그러면 `cyclesInRange`의 상한이 조용히
 * 걸려 이월 누적 잔여와 주기 목록이 실제보다 훨씬 작아진다. 만들어 놓고 세면 그
 * 자체가 폭주라 산술로 센다.
 */
export function leaveCycleCount(
  config: LeaveCycleConfig | null | undefined,
  through: ISODate,
): number {
  const active = activeLeaveCycleConfig(config);
  if (!active) return 0;
  // 1주기는 첫 적립일에 시작한다. 그 전이면 아직 주기가 없다.
  return Math.max(0, cyclesElapsed(active, through));
}

/** 첫 적립일 = 1주기 첫날. 설정이 없으면 null. 대기 구간 안내에 쓴다. */
export function firstGrantDate(
  config: LeaveCycleConfig | null | undefined,
): ISODate | null {
  const active = activeLeaveCycleConfig(config);
  return active ? firstGrantOf(active) : null;
}

/** on까지 도래한 모든 적립일. 주기를 채울 때마다 하나씩 늘어난다. */
export function grantDatesThrough(
  config: LeaveCycleConfig | null | undefined,
  on: ISODate,
): ISODate[] {
  const active = activeLeaveCycleConfig(config);
  if (!active) return [];
  const dates: ISODate[] = [];
  for (let index = 1; index <= MAX_LEAVE_CYCLES; index += 1) {
    const date = cycleDateAt(active, index);
    if (date > on) break;
    dates.push(date);
  }
  return dates;
}

/** on 다음에 돌아올 적립일. on이 마침 적립일이면 그 다음 주기의 적립일. */
export function nextGrantDateAfter(
  config: LeaveCycleConfig | null | undefined,
  on: ISODate,
): ISODate | null {
  const active = activeLeaveCycleConfig(config);
  if (!active) return null;
  // 시작일보다 이른 날을 물으면 경과 주기가 0 이하라 첫 적립일로 접힌다.
  return cycleDateAt(active, Math.max(cyclesElapsed(active, on) + 1, 1));
}

/** 오늘을 기준으로 이 주기가 지난 주기인지, 진행 중인지, 아직 오지 않았는지. */
export function cycleState(
  cycle: LeaveCycle,
  today: ISODate,
): "past" | "current" | "future" {
  if (today < cycle.start) return "future";
  if (today > cycle.end) return "past";
  return "current";
}

/** k주기까지 실제로 받은 몫. 적립일이 전역 뒤인 주기는 애초에 받지 못한다. */
export function grantedThroughCycle(
  config: ActiveLeaveCycleConfig,
  index: number,
): number {
  return config.daysPerGrant * index;
}

/**
 * 첫 적립일부터 k주기 마지막 날까지 쓴 일수.
 *
 * 주기가 첫 적립일 뒤를 빈틈없이 덮으므로 주기별 사용량의 합이 곧 그 구간의 사용량이다.
 * 첫 적립 전에 쓴 날은 어느 주기의 몫도 아니라 여기 들어오지 않는다 — 그 날들은
 * 부르는 쪽이 따로 막는 몫이고, 누적 판정에 섞으면 이미 어긋나 있는 과거가
 * 새 등록을 막는 이유가 된다.
 *
 * "그 주기를 며칠 썼는가"는 재원마다 다르므로 주입받는다.
 */
export function usedThroughCycle(
  config: ActiveLeaveCycleConfig,
  index: number,
  usedIn: (cycle: LeaveCycle) => number,
): number {
  let used = 0;
  for (let k = 1; k <= index; k += 1) {
    used += usedIn(buildCycle(config, k));
  }
  return used;
}
