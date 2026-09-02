/**
 * 세로 월 스크롤의 창 계산(네이티브) — 순수 부분.
 *
 * 부대 달력(calendar-scroll)과 친구 비교 달력(friend-calendar-scroll)이 함께 쓴다.
 * React도 네이티브 모듈도 건드리지 않아 그대로 단위 테스트할 수 있다. 실제 상태
 * 기계는 이 위에 올린 훅(month-scroll-window)에 있다.
 */

import { shiftMonth, splitMonth } from "@leave/shared/calendar";
import type { WindowSizeClass } from "@/adaptive";

/** 처음 담아 두는 달 수 = 이 값 * 2 + 1. 가운데가 오늘이 든 달. */
export const INITIAL_SPAN = 2;
/** 한 번에 이어 붙이는 달 수. */
export const PAGE_SIZE = 6;
/**
 * 목록에 담아 두는 달의 상한.
 *
 * 이 목록은 위·아래 양쪽으로 계속 자라기만 했다. 한참 훑고 나면 달이 수십 개
 * 쌓이는데, 달 하나마다 (a) 달력 쿼리 한 벌, (b) 42칸짜리 그리드 — 칸마다
 * Pressable + 날짜 배지 + 알약 등 6~10개 뷰 — 가 딸린다. 창 밖의 달은
 * FlatList가 언마운트해 주지만, 쿼리와 배열 자체는 남아 세션 내내 자란다.
 *
 * 상한을 두고 스크롤 반대편을 잘라내면 "무한 스크롤"의 감각은 그대로면서
 * 메모리와 요청 수가 창 크기에 묶인다. 잘라낸 달로 되돌아가면 그때 다시 붙는다.
 * 25개월이면 windowSize=7이 요구하는 앞뒤 여유보다 한참 넉넉하다.
 */
export const MAX_MONTHS = 25;
/** 이전 달을 이어 붙이는 최소 간격(ms). onScroll 주석 참고. */
export const PREPEND_INTERVAL_MS = 250;

/** 좁은 창의 칸 높이 — month-calendar가 좁은 창에서 쓰는 최대 구성과 같다. */
export const CELL_H_MIN = 92;
/** 넓은 창에서도 이보다 커지면 칸이 비어 보인다. 정보량이 늘지 않는 여백일 뿐. */
export const CELL_H_MAX = 132;
/** 이 높이부터 칸 안에 출타자 이니셜 한 줄(16+gap 3)이 들어간다. */
export const CELL_H_ATTENDEES = 112;
/** weekRow marginBottom. */
export const ROW_GAP = 2;
/** 칸 사이 가로 여백 — month-calendar의 weekRow gap과 같아야 한다. */
export const CELL_GAP = 2;
/** 그리드 최대 주 수. */
export const ROWS = 6;
/** 달 이름 줄 높이. */
export const LABEL_H = 44;
/**
 * 목록 아래쪽에서 탭바·홈 인디케이터에 가려지는 만큼. 넉넉히 잡아 한 달이 잘리지
 * 않게 한다 — 덜 잡으면 마지막 주가 탭바에 물리고, 더 잡아 봐야 칸이 조금 작아질
 * 뿐이라 손해가 비대칭이다.
 */
export const BOTTOM_ALLOWANCE = 84;

/** 한 달 블록 높이. getItemLayout·snapToInterval이 이 값에 의존한다. */
export function monthBlockHeight(cellHeight: number): number {
  return LABEL_H + ROWS * (cellHeight + ROW_GAP);
}

/**
 * 보이는 높이에 맞춘 칸 높이. 좁은 창에서는 지금 값을 그대로 유지한다 —
 * 휴대폰 달력은 이미 한 화면에 한 달이 들어오고, 여기서 흔들 이유가 없다.
 */
export function resolveCellHeight(
  sizeClass: WindowSizeClass,
  visibleHeight: number,
): number {
  if (sizeClass === "compact" || visibleHeight <= 0) return CELL_H_MIN;
  const forGrid = visibleHeight - LABEL_H;
  const fitted = Math.floor(forGrid / ROWS) - ROW_GAP;
  return Math.max(CELL_H_MIN, Math.min(CELL_H_MAX, fitted));
}

/** center를 가운데 둔 연속한 달 목록. */
export function monthRange(center: string, span: number): string[] {
  const out: string[] = [];
  for (let i = -span; i <= span; i++) out.push(shiftMonth(center, i));
  return out;
}

export function monthLabel(month: string): string {
  const { year, monthNum } = splitMonth(month);
  return `${year}년 ${monthNum}월`;
}

/**
 * 앞에 붙이며 뒤를 자른다.
 *
 * 자르는 쪽을 아래로만 둔 것은 의도적이다. 위쪽(보이는 영역보다 앞)에서 항목을
 * 없애면 모든 인덱스가 밀리고, 그 보정은 maintainVisibleContentPosition에 기대야
 * 하는데 — 항목 추가와 달리 제거 보정은 플랫폼마다 결이 다르다. 실기기에서
 * 확인할 수 없는 변경으로 스크롤이 튈 위험을 만들 이유가 없다.
 *
 * 실제로 폭주하는 쪽도 위쪽이다. 아래로는 한 화면에 한 달씩 사람이 넘기는 만큼만
 * 늘지만, 위로는 끌어 올리는 동안 250ms마다 6개월씩 붙는다.
 */
export function capTail(months: string[]): string[] {
  return months.length > MAX_MONTHS ? months.slice(0, MAX_MONTHS) : months;
}

/** 위쪽으로 넓힌 목록. 더 넓힐 곳이 없으면 받은 배열을 그대로 돌려준다. */
export function prependMonths(
  months: string[],
  earliestMonth: string | undefined,
): string[] {
  const first = months[0];
  if (!first) return months;
  const older: string[] = [];
  for (let i = PAGE_SIZE; i >= 1; i--) {
    const month = shiftMonth(first, -i);
    if (earliestMonth == null || month >= earliestMonth) older.push(month);
  }
  return older.length ? capTail([...older, ...months]) : months;
}

/** 아래쪽으로 넓힌 목록. 더 넓힐 곳이 없으면 받은 배열을 그대로 돌려준다. */
export function appendMonths(
  months: string[],
  latestMonth: string | undefined,
): string[] {
  const last = months[months.length - 1];
  if (!last) return months;
  const newer: string[] = [];
  for (let i = 1; i <= PAGE_SIZE; i++) {
    const month = shiftMonth(last, i);
    if (latestMonth == null || month <= latestMonth) newer.push(month);
  }
  return newer.length ? [...months, ...newer] : months;
}
