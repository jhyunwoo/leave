/**
 * 네이티브 버튼의 최소 폭 어림 계산.
 * 사용처: button.ios.tsx / button.native.tsx.
 */

import { spacing } from "@/theme";

/**
 * SwiftUI/Compose 버튼을 감싸는 `Host`는 라벨을 재지 못해 폭이 0으로 찌그러진다.
 * 그래서 글자 수로 폭을 어림해 `minWidth`로 깔아준다.
 *
 * 다만 Yoga에서는 `minWidth`가 `maxWidth`와 부모 폭을 모두 이긴다. 어림값을
 * 그대로 쓰면 "8/10 ~ 8/10 · 최고 20%" 같은 긴 라벨이 화면보다 넓은 값을 만들어
 * 버튼이 카드와 화면 밖으로 밀려난다. 화면 폭으로 잘라 그 일을 막는다.
 */
export function estimateLabelWidth(
  label: string,
  windowWidth: number,
  hasIcon = false,
): number {
  const estimate = Math.max(
    72,
    [...label].length * 15 + 36 + (hasIcon ? 26 : 0),
  );
  // 가장 바깥 화면 여백(양쪽 spacing.xl)을 뺀 만큼이 실제로 쓸 수 있는 최대 폭이다.
  const usable = Math.max(72, windowWidth - spacing.xl * 2);
  return Math.min(estimate, usable);
}
