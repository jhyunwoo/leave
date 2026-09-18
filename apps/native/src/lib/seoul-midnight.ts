/**
 * 다음 한국시간 자정까지 남은 시간 — 순수 부분.
 *
 * 사용처: lib/seoul-today.ts.
 *
 * 훅에서 떼어 둔 이유는 `month-window.ts`와 같다 — `apps/native/test`는 node
 * 환경이라 react-native를 불러올 수 없고, 이 계산은 숫자 하나에서 나오는 순수
 * 함수라 화면도 타이머도 필요하지 않다. 자정을 실제로 넘겨 보지 않고 테스트로
 * 고정할 수 있어야 하는 종류의 계산이다.
 */

import { KST_OFFSET_MS } from "@leave/shared/dates";

const DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * 지금부터 다음 한국시간 자정까지 남은 ms.
 *
 * 한국에는 서머타임이 없어 고정 +9시간 산술이 정확하다(`KST_OFFSET_MS` 주석).
 * 경계에 정확히 서 있으면 0이 아니라 하루를 돌려준다 — 0을 주면 타이머가 즉시
 * 다시 깨어 같은 날짜를 반복해 읽는다.
 */
export function msUntilNextSeoulMidnight(now: number): number {
  const sinceMidnight = (((now + KST_OFFSET_MS) % DAY_MS) + DAY_MS) % DAY_MS;
  return DAY_MS - sinceMidnight;
}
