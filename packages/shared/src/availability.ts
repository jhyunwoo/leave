/**
 * 출타율을 사람이 읽는 신호로 바꾸고, 더 여유로운 날짜를 추천한다.
 *
 * 사용처: 달력 셀 색·배지, 휴가 등록 폼의 대안 날짜 칩.
 *
 * 인원 숫자를 그대로 보여주면 "몇 명이 많은 건지" 판단이 사용자 몫이 된다.
 * 허용 기준 대비 비율로 바꿔 여유/보통/임박/초과 네 단계로 말한다.
 */

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

/** YYYY-MM-DD 전용 일수 덧셈. 로컬 타임존을 사용하지 않는다. */
function addDateDays(date: string, amount: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day));
  utc.setUTCDate(utc.getUTCDate() + amount);
  return utc.toISOString().slice(0, 10);
}

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
  const radius = Math.max(duration, input.radiusDays ?? 14);
  const selectedEnd = addDateDays(input.selectedStart, duration - 1);
  if (Number.isNaN(radius)) return [];
  const candidates: (DateRangeRecommendation & { distance: number })[] = [];

  // Candidate ranges overlap almost completely. Normalize each relevant date
  // once, then slide a duration-sized window across it. A monotonic queue keeps
  // the peak percentage in O(1) amortized time, making the whole search O(n)
  // instead of rescanning up to `duration` days for every candidate.
  // `radiusDays` is typed as a number rather than an integer. Preserve the
  // previous loop's fractional-radius behavior: offsets still advance by one,
  // so there are `floor(radius * 2) + 1` candidate starts.
  const searchDayCount = Math.floor(radius * 2) + duration;
  const dates = new Array<string>(searchDayCount);
  const valid = new Uint8Array(searchDayCount);
  const percents = new Float64Array(searchDayCount);
  for (let index = 0; index < searchDayCount; index += 1) {
    const date = addDateDays(input.selectedStart, index - radius);
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
