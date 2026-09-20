/**
 * 날짜 칸을 길게 눌렀을 때 무엇을 집을지 — 순수 부분.
 *
 * 사용처: components/calendar-drag/use-day-cell-drag.ts.
 *
 * 길게 누르기는 칩이 아니라 **칸 전체**가 받는다. 11px 알약을 휴대폰에서 정확히
 * 짚기 어려워, 빗나가면 드래그 대신 날짜가 선택되어 버렸기 때문이다. 날짜 선택은
 * 언제나 짧은 탭이므로 "길게 눌렀다"는 신호는 그 날의 일정을 집으려는 뜻으로 읽어도
 * 된다.
 *
 * 칸 안에는 재원 칩과 개인 일정 알약이 세로로 쌓인다. 둘 다 있는 칸에서 어느 쪽도
 * 아닌 자리를 누르면 **손가락에 가까운 쪽**을 집는다. 알약 위를 직접 누르면 거리가
 * 0이라 자연히 그것이 이긴다.
 *
 * 컴포넌트에서 떼어 둔 이유는 `month-cell-index.ts`와 같다 — 숫자 몇 개에서 나오는
 * 순수 함수라 화면이 필요 없고, `apps/native/test`는 node 환경이라 react-native를
 * 불러올 수 없다.
 */

/** 칸 안에서 항목이 차지한 세로 구간. `onLayout`의 `layout`에서 그대로 온다. */
export type GrabRect = { y: number; height: number };

/** 집을 수 있는 항목 하나. 아직 레이아웃이 오지 않았으면 `rect`가 null이다. */
export type GrabCandidate<T> = { subject: T; rect: GrabRect | null };

/** 손가락에서 구간까지의 거리. 구간 안이면 0이다. */
function distanceTo(touchY: number, rect: GrabRect): number {
  if (touchY < rect.y) return rect.y - touchY;
  const bottom = rect.y + rect.height;
  return touchY > bottom ? touchY - bottom : 0;
}

/**
 * 손가락에 가장 가까운 후보. 거리가 같으면 **앞선 후보**가 이긴다 — 호출자가 칸에서
 * 위에 그려진 순서로 넘기므로, 칩과 알약의 딱 중간을 누르면 칩이 집힌다.
 *
 * 레이아웃이 아직 없는 후보는 건너뛰되, **전부** 없으면 첫 후보를 돌려준다. 칸이
 * 그려진 직후 첫 손가락이 아무것도 집지 못하는 쪽보다 낫다.
 */
export function nearestGrabTarget<T>(
  touchY: number,
  candidates: readonly GrabCandidate<T>[],
): T | null {
  let best: { subject: T; distance: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.rect) continue;
    const distance = distanceTo(touchY, candidate.rect);
    if (!best || distance < best.distance)
      best = { subject: candidate.subject, distance };
  }
  if (best) return best.subject;
  return candidates[0]?.subject ?? null;
}
