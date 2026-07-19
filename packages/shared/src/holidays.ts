import { addDays, parseISODate, type ISODate } from "./dates";

/**
 * 한국 공휴일(2024–2030). 달력에 표시하기 위한 정적 데이터.
 *
 * - 양력 고정일과, 연도별 음력 기준 공휴일(설날·부처님오신날·추석)의 양력 환산일만
 *   최소한으로 하드코딩하고, **대체공휴일은 현행 규칙으로 계산**한다.
 * - 근일(2024–2027)의 음력 환산일은 확정값, 2028–2030은 KASI(천문연) 발표 전 잠정값이므로
 *   해당 연도 진입 전 검증을 권장한다.
 * - 임시공휴일·선거일 등 확정된 지정일은 EXTRA에 직접 넣는다.
 */

const YEARS = [2024, 2025, 2026, 2027, 2028, 2029, 2030] as const;

/** 양력 고정 공휴일 (월-일 → 이름). 신정·현충일은 대체공휴일 대상이 아님. */
const SOLAR: ReadonlyArray<readonly [string, string]> = [
  ["01-01", "신정"],
  ["03-01", "삼일절"],
  ["05-05", "어린이날"],
  ["06-06", "현충일"],
  ["08-15", "광복절"],
  ["10-03", "개천절"],
  ["10-09", "한글날"],
  ["12-25", "성탄절"],
];

/** 대체공휴일이 적용되는 단일 공휴일(신정·현충일 제외). */
const SUBSTITUTE_SINGLE = new Set([
  "삼일절",
  "어린이날",
  "부처님오신날",
  "광복절",
  "개천절",
  "한글날",
  "성탄절",
]);

/** 설날 당일(음력 1/1)의 양력 환산일. */
const SEOLLAL: Record<number, ISODate> = {
  2024: "2024-02-10",
  2025: "2025-01-29",
  2026: "2026-02-17",
  2027: "2027-02-06",
  2028: "2028-01-26",
  2029: "2029-02-13",
  2030: "2030-02-03",
};

/** 부처님오신날(음력 4/8)의 양력 환산일. */
const BUDDHA: Record<number, ISODate> = {
  2024: "2024-05-15",
  2025: "2025-05-05",
  2026: "2026-05-24",
  2027: "2027-05-13",
  2028: "2028-05-02",
  2029: "2029-05-20",
  2030: "2030-05-09",
};

/** 추석 당일(음력 8/15)의 양력 환산일. */
const CHUSEOK: Record<number, ISODate> = {
  2024: "2024-09-17",
  2025: "2025-10-06",
  2026: "2026-09-25",
  2027: "2027-09-15",
  2028: "2028-10-03",
  2029: "2029-09-22",
  2030: "2030-09-12",
};

/** 임시공휴일·선거일 등 확정된 지정일. */
const EXTRA: Record<ISODate, string> = {
  "2024-04-10": "국회의원선거",
  "2025-01-27": "임시공휴일",
  "2025-06-03": "대통령선거",
  "2026-06-03": "지방선거",
};

const GROUP_NAMES = new Set(["설날", "추석"]);

function weekday(date: ISODate): number {
  return parseISODate(date).getUTCDay(); // 0=일 … 6=토
}

interface Occurrence {
  days: ISODate[];
  name: string;
  /** 연휴(설날·추석) 여부. */
  group: boolean;
  /** 대체공휴일 대상 여부. */
  eligible: boolean;
}

function occurrencesFor(year: number): Occurrence[] {
  const list: Occurrence[] = [];
  for (const [md, name] of SOLAR) {
    list.push({
      days: [`${year}-${md}`],
      name,
      group: false,
      eligible: SUBSTITUTE_SINGLE.has(name),
    });
  }
  list.push({
    days: [BUDDHA[year]!],
    name: "부처님오신날",
    group: false,
    eligible: true,
  });
  const s = SEOLLAL[year]!;
  list.push({
    days: [addDays(s, -1), s, addDays(s, 1)],
    name: "설날",
    group: true,
    eligible: true,
  });
  const c = CHUSEOK[year]!;
  list.push({
    days: [addDays(c, -1), c, addDays(c, 1)],
    name: "추석",
    group: true,
    eligible: true,
  });
  return list;
}

function build(): Record<ISODate, string> {
  const map: Record<ISODate, string> = {};
  const namesByDate = new Map<ISODate, string[]>();
  const addName = (date: ISODate, name: string) => {
    const names = namesByDate.get(date) ?? [];
    names.push(name);
    namesByDate.set(date, names);
    if (!map[date]) map[date] = name;
  };

  const allOccurrences: Occurrence[] = [];
  for (const year of YEARS) {
    for (const occ of occurrencesFor(year)) {
      allOccurrences.push(occ);
      for (const d of occ.days) addName(d, occ.name);
    }
  }
  for (const [date, name] of Object.entries(EXTRA)) addName(date, name);

  // 대체공휴일 계산 — 트리거된 기준일들을 모아 시간순으로 배치한다.
  // (같은 날 겹친 단일 공휴일은 기준일이 같아 하나로 합쳐진다.)
  const anchors = new Set<ISODate>();
  for (const occ of allOccurrences) {
    if (!occ.eligible) continue;
    if (occ.group) {
      // 설날·추석: 연휴 중 일요일이 끼거나 다른 공휴일과 겹치면 대체.
      const triggered = occ.days.some(
        (d) =>
          weekday(d) === 0 ||
          (namesByDate.get(d) ?? []).some((n) => n !== occ.name),
      );
      if (triggered) anchors.add(occ.days[occ.days.length - 1]!);
    } else {
      const date = occ.days[0]!;
      const wd = weekday(date);
      // 단일 공휴일: 토·일이거나, 다른 '단일' 공휴일과 같은 날이면 대체.
      // (연휴와 겹치는 경우는 연휴 쪽에서 이미 처리하므로 제외한다.)
      const coincidesWithSingle = (namesByDate.get(date) ?? []).some(
        (n) => n !== occ.name && !GROUP_NAMES.has(n),
      );
      if (wd === 0 || wd === 6 || coincidesWithSingle) anchors.add(date);
    }
  }

  const isHolidayDate = (d: ISODate) => Boolean(map[d]);
  for (const anchor of [...anchors].sort()) {
    let d = addDays(anchor, 1);
    while (weekday(d) === 0 || weekday(d) === 6 || isHolidayDate(d)) {
      d = addDays(d, 1);
    }
    map[d] = "대체공휴일";
  }

  return map;
}

/** 2024–2030 한국 공휴일 (YYYY-MM-DD → 이름). 대체공휴일 포함. */
export const HOLIDAYS: Readonly<Record<ISODate, string>> = build();

/** 공휴일이면 이름, 아니면 null. */
export function getHoliday(date: ISODate): string | null {
  return HOLIDAYS[date] ?? null;
}

/** 공휴일 여부. */
export function isHoliday(date: ISODate): boolean {
  return date in HOLIDAYS;
}
