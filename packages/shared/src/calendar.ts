import { addDays, parseISODate, toISODate, type ISODate } from "./dates";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

export function splitMonth(month: string): { year: number; monthNum: number } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { year: y, monthNum: m };
}

export function fmtDateK(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

export function fmtDateShort(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`;
}

export function fmtRange(start: ISODate, end: ISODate): string {
  if (start === end) return fmtDateShort(start);
  return `${fmtDateShort(start)} – ${fmtDateShort(end)}`;
}

/** "8/2" — 칩·배너처럼 좁은 자리에 쓰는 짧은 표기. */
export function fmtDateTiny(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

/** "8/2–8/5" — 하루짜리면 "8/2". */
export function fmtRangeTiny(start: ISODate, end: ISODate): string {
  if (start === end) return fmtDateTiny(start);
  return `${fmtDateTiny(start)}–${fmtDateTiny(end)}`;
}

export function shiftMonth(month: string, delta: number): string {
  const { year, monthNum } = splitMonth(month);
  const total = year * 12 + (monthNum - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
}

export interface GridCell {
  date: ISODate;
  inMonth: boolean;
}

/** 일요일 시작 월 그리드. 달의 모든 날짜 + 앞뒤 채움. */
export function buildMonthGrid(month: string): GridCell[][] {
  const { year, monthNum } = splitMonth(month);
  const first = new Date(Date.UTC(year, monthNum - 1, 1));
  const gridStart = addDays(toISODate(first), -first.getUTCDay());
  const weeks: GridCell[][] = [];
  let cursor = gridStart;
  for (let w = 0; w < 6; w++) {
    const week: GridCell[] = [];
    for (let d = 0; d < 7; d++) {
      week.push({ date: cursor, inMonth: cursor.slice(0, 7) === month });
      cursor = addDays(cursor, 1);
    }
    if (week.every((c) => !c.inMonth) && weeks.length >= 4) break;
    weeks.push(week);
  }
  return weeks;
}
