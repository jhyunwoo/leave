/**
 * 재원 팔레트에서 색 한 칸을 꺼내는 규칙. `react-native`도 `@/theme`도 부르지 않는
 * 순수 모듈이다(`window-size-class.ts`와 같은 이유 — 이 규칙을 단위 테스트로
 * 고정하려면 RN을 불러올 수 없다. `apps/native/test`는 node 환경이다).
 *
 * ## 왜 팔레트를 키로 직접 색인하지 않는가
 *
 * 서버는 자기가 아는 `BALANCE_KEYS`를 **전부** 응답에 실어 보내고(`buildGrantsPage`의
 * `funds`), 달력·구간에도 그 이름이 그대로 실린다. 그래서 재원이 하나 새로 생기면 그
 * 키가 **이미 배포된 구버전 앱까지** 내려온다 — 앱은 스토어 업데이트 전까지 그 이름을
 * 모르고, 그 사이 서버는 먼저 배포된다.
 *
 * 팔레트를 `palette[key]`로 바로 읽으면 그 순간 `tone.bg`에서 화면 전체가 죽는다.
 * 1.1.0(build 42)의 보유 휴가 화면이 `weekend_outing`에서 실제로 그랬다(Sentry
 * LEAVE-NATIVE-8) — 재원 칩 하나 때문에 화면이 열리지 않았다. 웹은 CSS
 * 속성 선택자(`[data-balance="..."]`)라 모르는 값이 기본 스타일로 흘러가 같은 사고가
 * 나지 않는다. 앱만 죽는 자리였다.
 *
 * 색 하나가 낯선 것과 화면이 열리지 않는 것은 무게가 다르다.
 */

import type { BalanceKey } from "@leave/shared";

export type BalanceTone = { readonly fg: string; readonly bg: string };
export type BalancePalette = Readonly<Record<BalanceKey, BalanceTone>>;

/** 모르는 재원은 `other`(중립 회색)로 접는다. 팔레트는 언제나 이 함수로 읽는다. */
export function balanceTone(
  palette: BalancePalette,
  key: BalanceKey,
): BalanceTone {
  // 타입은 BalanceKey지만 런타임 값은 서버가 준 문자열이다 — 없을 수 있는 칸으로 읽는다.
  const known: Partial<BalancePalette> = palette;
  return known[key] ?? palette.other;
}
