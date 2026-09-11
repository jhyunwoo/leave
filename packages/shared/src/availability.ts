/**
 * 출타율을 사람이 읽는 신호로 바꾸고, 더 여유로운 날짜를 추천한다.
 *
 * 사용처: 달력 셀 색·배지, 휴가 등록 폼의 대안 날짜 칩.
 *
 * 인원 숫자를 그대로 보여주면 "몇 명이 많은 건지" 판단이 사용자 몫이 된다.
 * 허용 기준 대비 비율로 바꿔 여유/보통/임박/초과 네 단계로 말한다.
 */

import { addDays } from "./dates";

export const AVAILABILITY_KEYS = [
  "unknown",
  "roomy",
  "normal",
  "near",
  "exceeded",
] as const;

export type AvailabilityKey = (typeof AVAILABILITY_KEYS)[number];

export type AvailabilitySignal = {
  key: AvailabilityKey;
  label: string;
  /** 허용 기준 대비 현재 계획 비율. 기준이 없으면 null. */
  percent: number | null;
};

/**
 * 출타 계획을 절대 인원 대신 사용자에게 보여줄 상태로 바꾼다.
 * 100%는 아직 초과가 아니므로 "임박", `count > allowed`만 "초과"다.
 */
export function availabilitySignal(
  count: number,
  allowed: number,
): AvailabilitySignal {
  if (!Number.isFinite(count) || !Number.isFinite(allowed) || allowed <= 0) {
    return { key: "unknown", label: "기준 미설정", percent: null };
  }

  const normalizedCount = Math.max(0, count);
  const percent = Math.round((normalizedCount / allowed) * 100);
  if (normalizedCount > allowed) {
    return { key: "exceeded", label: "초과", percent };
  }
  if (percent >= 80) return { key: "near", label: "임박", percent };
  if (percent >= 50) return { key: "normal", label: "보통", percent };
  return { key: "roomy", label: "여유", percent };
}

export type AvailabilityDay = {
  date: string;
  count: number;
  allowed: number;
  blocked?: boolean;
};

export type DateRangeRecommendation = {
  startDate: string;
  endDate: string;
  peakPercent: number;
};

/**
 * 선택일 주변에서 같은 길이의 연속 구간 중 가장 여유로운 최대 3개를 고른다.
 * 블랙아웃·기준 미설정·초과 구간은 추천하지 않으며 선택 구간 자체는 제외한다.
 */
export function recommendDateRanges(input: {
  days: readonly AvailabilityDay[];
  selectedStart: string;
  durationDays: number;
  radiusDays?: number;
  limit?: number;
}): DateRangeRecommendation[] {
  const duration = Math.trunc(input.durationDays);
  if (duration <= 0) return [];

  const byDate = new Map(input.days.map((day) => [day.date, day]));
  /**
   * 반경은 **정수 일수**다. 소수를 그대로 쓰면 오프셋이 날짜와 1:1로 맞지 않는다 —
   * 반경 14.5에서 후보 14는 `-0.5`, 후보 15는 `+0.5`가 되고 `setUTCDate`가 0으로
   * 자르므로 **연달은 두 후보가 같은 날짜를 가리킨다.** 그러면 슬라이딩 창의
   * 인덱스가 더 이상 연속된 달력 날짜를 뜻하지 않아, 실제로는 이어지지 않는 구간이
   * 추천으로 올라온다. 타입이 `number`인 채로 두면 언제든 그 값이 들어올 수 있으므로
   * 받는 자리에서 자른다.
   */
  const radius = Math.max(duration, Math.trunc(input.radiusDays ?? 14));
  // 유한하지 않으면 아래 배열 길이가 성립하지 않는다(`new Array(Infinity)`는 던진다).
  if (!Number.isFinite(radius)) return [];
  const selectedEnd = addDays(input.selectedStart, duration - 1);
  const candidates: (DateRangeRecommendation & { distance: number })[] = [];

  // Candidate ranges overlap almost completely. Normalize each relevant date
  // once, then slide a duration-sized window across it. A monotonic queue keeps
  // the peak percentage in O(1) amortized time, making the whole search O(n)
  // instead of rescanning up to `duration` days for every candidate.
  const searchDayCount = radius * 2 + duration;
  const dates = new Array<string>(searchDayCount);
  const valid = new Uint8Array(searchDayCount);
  const percents = new Float64Array(searchDayCount);
  for (let index = 0; index < searchDayCount; index += 1) {
    const date = addDays(input.selectedStart, index - radius);
    const day = byDate.get(date);
    dates[index] = date;
    if (!day || day.blocked || day.allowed <= 0 || day.count > day.allowed) {
      continue;
    }
    valid[index] = 1;
    percents[index] = Math.round((Math.max(0, day.count) / day.allowed) * 100);
  }

  const peakIndexes: number[] = [];
  let peakHead = 0;
  let invalidCount = 0;
  let notANumberCount = 0;

  const addToWindow = (index: number) => {
    if (!valid[index]) {
      invalidCount += 1;
      return;
    }
    const percent = percents[index]!;
    if (Number.isNaN(percent)) {
      notANumberCount += 1;
      return;
    }
    while (
      peakIndexes.length > peakHead &&
      percents[peakIndexes[peakIndexes.length - 1]!]! <= percent
    ) {
      peakIndexes.pop();
    }
    peakIndexes.push(index);
  };

  const removeFromWindow = (index: number) => {
    if (!valid[index]) {
      invalidCount -= 1;
    } else if (Number.isNaN(percents[index]!)) {
      notANumberCount -= 1;
    } else if (peakIndexes[peakHead] === index) {
      peakHead += 1;
    }

    // Avoid retaining a long discarded prefix when callers provide a very
    // large explicit radius.
    if (peakHead > 1_024 && peakHead * 2 > peakIndexes.length) {
      peakIndexes.splice(0, peakHead);
      peakHead = 0;
    }
  };

  for (let index = 0; index < duration; index += 1) addToWindow(index);

  for (
    let candidateIndex = 0;
    candidateIndex <= radius * 2;
    candidateIndex += 1
  ) {
    if (candidateIndex > 0) {
      removeFromWindow(candidateIndex - 1);
      addToWindow(candidateIndex + duration - 1);
    }

    const offset = candidateIndex - radius;
    const startDate = dates[candidateIndex]!;
    const endDate = dates[candidateIndex + duration - 1]!;
    if (
      (startDate === input.selectedStart && endDate === selectedEnd) ||
      invalidCount > 0
    ) {
      continue;
    }

    candidates.push({
      startDate,
      endDate,
      peakPercent:
        notANumberCount > 0 ? Number.NaN : percents[peakIndexes[peakHead]!]!,
      distance: Math.abs(offset),
    });
  }

  return candidates
    .sort(
      (a, b) =>
        a.peakPercent - b.peakPercent ||
        a.distance - b.distance ||
        a.startDate.localeCompare(b.startDate),
    )
    .slice(0, input.limit ?? 3)
    .map(({ distance: _distance, ...range }) => range);
}
