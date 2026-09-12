/**
 * 달력 표기와 월 그리드 생성.
 *
 * 사용처: 웹/앱의 달력 화면, 휴가 목록·상세의 날짜 표기, 서버의 조회 범위 검증.
 *
 * 날짜 문자열(YYYY-MM-DD)과 월 문자열(YYYY-MM)만 다루고 Date 객체를 밖으로
 * 내보내지 않는다. 타임존 때문에 하루가 밀리는 사고를 원천적으로 막기 위해서다.
 */

import { addDays, parseISODate, toISODate, type ISODate } from "./dates";

export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

/**
 * Calendar-query bounds relative to the current Seoul month. The API enforces
 * these limits and scrolling clients use the same contract to avoid requests
 * that can only fail.
 */
export const CALENDAR_QUERY_PAST_MONTHS = 12;
export const CALENDAR_QUERY_FUTURE_MONTHS = 24;

/**
 * 토·일 여부. 달력에서 "빨간 날"의 절반을 이룬다(나머지 절반은 `getHoliday`).
 *
 * 호출부가 `new Date(date).getUTCDay()`를 직접 쓰지 않게 하려고 둔다 — 이 파일의
 * 규칙대로 Date는 안에서만 만들고 밖으로 내보내지 않는다.
 */
export function isWeekend(date: ISODate): boolean {
  const day = parseISODate(date).getUTCDay();
  return day === 0 || day === 6;
}

export function splitMonth(month: string): { year: number; monthNum: number } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  return { year: y, monthNum: m };
}

export function fmtDateK(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 (${WEEKDAYS[d.getUTCDay()]})`;
}

/**
 * "2026년 9월 18일 (금)" — 연도까지 밝히는 표기.
 *
 * 친구 달력처럼 해를 넘겨 스크롤하는 화면의 상세 제목에 쓴다. 거기서는 고른 날이
 * 올해인지 내년인지가 곧 "그때 같이 나갈 수 있는가"의 답이라 연도를 지울 수 없다.
 */
export function fmtDateFullK(date: ISODate): string {
  const d = parseISODate(date);
  return `${d.getUTCFullYear()}년 ${fmtDateK(date)}`;
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

/* ------------------------------------------------------------------ *
 * 시각이 붙은 표기
 *
 * 위의 fmtDate*는 날짜 문자열(YYYY-MM-DD)을 다루므로 UTC 접근자를 쓴다 —
 * 타임존 때문에 하루가 밀리지 않게 하려는 것이다. 아래 둘은 반대로 "언제 일어난
 * 일인가"(알림 도착, 초대코드 만료)를 다루므로 기기의 로컬 시각으로 보여준다.
 * 사용자가 화면에서 읽는 시각과 손목시계가 어긋나면 안 되기 때문이다.
 * ------------------------------------------------------------------ */

/** "8월 2일 14:05" — 목록에서 한 줄에 들어가야 하는 시각. */
export function fmtDateTimeShort(timestamp: string): string {
  const at = new Date(timestamp);
  const hours = at.getHours().toString().padStart(2, "0");
  const minutes = at.getMinutes().toString().padStart(2, "0");
  return `${at.getMonth() + 1}월 ${at.getDate()}일 ${hours}:${minutes}`;
}

/** 초 단위까지 보이는 한국 로캘 전체 표기. 만료 시각처럼 정확도가 중요한 자리에. */
export function fmtDateTimeFull(timestamp: string): string {
  return new Date(timestamp).toLocaleString("ko-KR");
}

export function shiftMonth(month: string, delta: number): string {
  const { year, monthNum } = splitMonth(month);
  const total = year * 12 + (monthNum - 1) + delta;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return `${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`;
}

/**
 * 두 날짜가 걸치는 모든 달("YYYY-MM")을 순서대로 돌려준다.
 *
 * 달력은 달 단위로만 받아오므로, 한 달치만 들고 여러 달에 걸친 구간을 계산하면
 * 로드되지 않은 날이 조용히 빠진다. 추천·시뮬레이션처럼 선택 구간 밖까지
 * 살펴보는 계산은 이 목록으로 필요한 달을 모두 받아야 한다.
 */
export function monthsSpanning(start: ISODate, end: ISODate): string[] {
  const first = start <= end ? start.slice(0, 7) : end.slice(0, 7);
  const last = start <= end ? end.slice(0, 7) : start.slice(0, 7);
  const months: string[] = [];
  for (let month = first; month <= last; month = shiftMonth(month, 1)) {
    months.push(month);
  }
  return months;
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
