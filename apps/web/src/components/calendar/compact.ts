/**
 * 달력이 "좁은 화면 모드"로 넘어가는 기준 하나.
 *
 * 이 폭 아래에서 두 가지가 동시에 바뀌고, **둘은 서로를 전제로 한다.**
 *
 * - `CalendarScroll`이 자기 스크롤 박스를 버리고 페이지를 스크롤포트로 쓴다
 *   (`.cal-scroll-shell.is-page-scroll`). 달력 높이가 풀리므로 달을 내릴수록
 *   페이지가 계속 길어진다.
 * - `CalendarPage`가 고른 날 상세를 옆 칸이 아니라 모달로 띄운다. 페이지가
 *   무한히 길어지는 마당에 상세를 달력 **뒤에** 쌓으면 영영 닿지 못한다.
 *
 * 두 값이 갈리면 정확히 그 틈에서 "날짜만 칠해지고 아무 일도 안 나는" 화면이
 * 된다. 그래서 질의 문자열과 훅을 여기 한 벌만 둔다.
 */

import { useSyncExternalStore } from "react";

export const CALENDAR_COMPACT_QUERY = "(max-width: 900px)";

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(CALENDAR_COMPACT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * 좁은 화면인가.
 *
 * 서버 스냅샷은 `false`(넓은 화면)다. 첫 그림에서는 고른 날짜가 없어 상세도
 * 옆 칸도 없으므로, 수화 뒤 참값으로 바뀌어도 화면이 튀지 않는다.
 */
export function useCompactCalendar(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(CALENDAR_COMPACT_QUERY).matches,
    () => false,
  );
}
