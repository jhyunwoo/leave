/**
 * 복무 진행률 표시에 쓰는 순수 계산.
 * 사용처: components/service-progress.tsx(프로필 카드), screens/service-progress-detail.tsx(전체 화면).
 *
 * 이 파일에는 React도 react-native도 들어오지 않는다. 두 가지 이유가 있다.
 *
 *  1) 여기 있는 함수는 UI 스레드의 워클릿에서 불린다. 순수하게 유지해야 프레임
 *     콜백 안에서 그대로 쓸 수 있다.
 *  2) 그래서 vitest(`environment: "node"`)가 그대로 import해 검증할 수 있다.
 *     components/calendar-drag/lattice.ts와 같은 자리다.
 */

/** 퍼센트 소수 자릿수. 마지막 세 자리가 프레임마다 흐르는 게 이 값의 목적이다. */
export const SERVICE_PERCENT_DECIMALS = 10;

/** 전체 화면 막대 안에서 큰 글자가 들고 가는 소수 자릿수. */
export const HERO_HEAD_DECIMALS = 2;

/** `serviceProgressAt`과 같은 계산의 퍼센트 판. 워클릿에서도 부르므로 순수하게 유지한다. */
export function percentBetween(
  start: number,
  span: number,
  now: number,
): number {
  "worklet";
  if (span <= 0) return 0;
  const ratio = (now - start) / span;
  return (ratio < 0 ? 0 : ratio > 1 ? 1 : ratio) * 100;
}

/**
 * `toFixed` 결과를 "큰 글자"와 "흐르는 꼬리"로 가른다.
 *
 *   splitPercentText("43.1234567890", 2) → { head: "43.12", tail: "34567890" }
 *
 * 정수부 자릿수가 1~3(0%, 43%, 100%)로 변하므로 고정 위치가 아니라 소수점을 찾아
 * 자른다. 두 조각을 한 문자열에서 한 번에 만들기 때문에 자리 올림이 일어나는
 * 프레임에도 둘이 어긋나지 않는다.
 */
export function splitPercentText(
  text: string,
  headDecimals: number,
): { head: string; tail: string } {
  "worklet";
  const dot = text.indexOf(".");
  if (dot < 0) return { head: text, tail: "" };
  const cut = dot + 1 + headDecimals;
  return { head: text.slice(0, cut), tail: text.slice(cut) };
}
