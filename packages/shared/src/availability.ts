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
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
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
  const candidates: (DateRangeRecommendation & { distance: number })[] = [];

  for (let offset = -radius; offset <= radius; offset += 1) {
    const startDate = addDateDays(input.selectedStart, offset);
    const endDate = addDateDays(startDate, duration - 1);
    if (startDate === input.selectedStart && endDate === selectedEnd) continue;

    const range: AvailabilityDay[] = [];
    let valid = true;
    for (let index = 0; index < duration; index += 1) {
      const day = byDate.get(addDateDays(startDate, index));
      if (!day || day.blocked || day.allowed <= 0 || day.count > day.allowed) {
        valid = false;
        break;
      }
      range.push(day);
    }
    if (!valid) continue;

    const peakPercent = Math.max(
      ...range.map((day) =>
        Math.round((Math.max(0, day.count) / day.allowed) * 100),
      ),
    );
    candidates.push({
      startDate,
      endDate,
      peakPercent,
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
