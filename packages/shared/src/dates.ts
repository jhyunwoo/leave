/** 날짜는 전부 KST 기준의 달력 날짜(YYYY-MM-DD 문자열)로 다룬다. 시각/시간대 개념 없음. */
export type ISODate = string;

export const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidISODate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === m - 1 &&
    date.getUTCDate() === d
  );
}

export function parseISODate(value: ISODate): Date {
  const [y, m, d] = value.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

export function toISODate(date: Date): ISODate {
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** N개월 뒤의 같은 일자. 말일 초과분은 그 달 말일로 클램프 (1/31 + 1개월 → 2/28). */
export function addMonthsClamped(date: ISODate, months: number): ISODate {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ty = Math.floor(total / 12);
  const tm = (total % 12) + 1;
  const td = Math.min(d, daysInMonth(ty, tm));
  return toISODate(new Date(Date.UTC(ty, tm - 1, td)));
}

/** start 이후 경과한 만(滿) 개월 수. end가 start보다 이르면 음수 없이 0. */
export function fullMonthsBetween(start: ISODate, end: ISODate): number {
  if (end <= start) return 0;
  const [sy, sm] = start.split("-").map(Number) as [number, number];
  const [ey, em] = end.split("-").map(Number) as [number, number];
  let months = (ey - sy) * 12 + (em - sm);
  if (months < 0) return 0;
  while (months > 0 && addMonthsClamped(start, months) > end) months--;
  return months;
}

/** 두 날짜 차이(일). b - a. */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round(
    (parseISODate(b).getTime() - parseISODate(a).getTime()) / 86_400_000,
  );
}

/** start~end(포함) 사이 모든 날짜. */
export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const dates: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);
  return dates;
}

/** "YYYY-MM" → 그 달의 첫날/마지막날. */
export function monthBounds(month: string): { start: ISODate; end: ISODate } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return {
    start: toISODate(new Date(Date.UTC(y, m - 1, 1))),
    end: toISODate(new Date(Date.UTC(y, m - 1, daysInMonth(y, m)))),
  };
}

/** 한국 시간 기준 오늘 날짜. */
export function todayInSeoul(now: Date = new Date()): ISODate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** [aStart, aEnd]와 [bStart, bEnd]가 하루라도 겹치는지. */
export function rangesOverlap(
  aStart: ISODate,
  aEnd: ISODate,
  bStart: ISODate,
  bEnd: ISODate,
): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
