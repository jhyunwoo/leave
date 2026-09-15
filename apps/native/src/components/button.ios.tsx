/**
 * 버튼 — iOS용 SwiftUI 구현(@expo/ui).
 * 시스템 버튼을 그대로 써서 눌림 반응·접근성·Dynamic Type이 OS와 완전히 같아진다.
 * 라벨 폭 어림 계산이 필요한 이유는 ./button-width.ts 주석 참고.
 */

import { Label } from "@expo/ui/swift-ui";
import { type ButtonIcon, buttonIcons } from "./button-icons";

import { Button as NativeButton, Host } from "@expo/ui";
import {
  buttonBorderShape,
  buttonStyle,
  controlSize,
  frame,
  tint,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactNode } from "react";
import {
  StyleSheet,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useTheme } from "@/theme";
import { estimateLabelWidth } from "./button-width";

type Variant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";

export function Button(props: {
  title: string | ReactNode;
  onPress: () => void;
  variant?: Variant;
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * 부모가 폭을 정한다(예: `flex: 1`로 나눠 가지는 한 줄). 그러면 라벨 폭
   * 어림값을 깔지 않는다 — `estimateLabelWidth`가 만든 `minWidth`는 Yoga에서
   * 부모 폭을 이기므로, 한 줄에 셋을 넣으면 합이 칸보다 넓어져 카드 밖으로
   * 밀린다. 폭이 이미 정해져 있으면 어림값 자체가 필요 없다.
   */
  flexible?: boolean;
  icon?: ButtonIcon;
  systemImage?: string;
  testID?: string;
}) {
  // SwiftUI 호스트에는 DynamicColorIOS 객체가 아니라 확정된 hex를 넘긴다.
  // 스킴이 바뀌면 이 컴포넌트가 다시 렌더되며 새 값이 내려간다.
  const { colors, scheme } = useTheme();
  const { width: windowWidth } = useWindowDimensions();
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const disabled = props.disabled || props.loading;
  const label =
    typeof props.title === "string"
      ? props.loading
        ? "처리 중…"
        : props.title
      : props.loading
        ? "처리 중…"
        : "계속";
  const minimumLabelWidth = props.flexible
    ? undefined
    : estimateLabelWidth(
        label,
        windowWidth,
        Boolean(props.icon && !props.loading),
      );
  // 주 동작만 채운 캡슐이고 나머지는 전부 `bordered` — 즉 모든 변형이 캡슐을
  // 가진다. 예전에는 ghost가 `text`/`plain`, tertiary가 `plain`이라 배경도
  // 테두리도 없는 글자로 그려졌고, 그 변형만 놓인 자리("닫기", "선택 해제",
  // "정기외박 설정 저장")에서는 누를 수 있는 것인지가 드러나지 않았다.
  // 무게 차이는 tint와 채움 여부가 계속 말해 준다.
  const nativeVariant = variant === "primary" ? "filled" : "outlined";
  const modifiers = [
    buttonStyle(variant === "primary" ? "borderedProminent" : "bordered"),
    controlSize(size === "sm" ? "regular" : "large"),
    buttonBorderShape("capsule"),
    frame({ minHeight: size === "sm" ? 44 : 48, maxWidth: Infinity }),
    tint(variant === "danger" ? colors.negative : colors.brand),
  ];

  return (
    <Host
      matchContents={{ vertical: true }}
      colorScheme={scheme}
      seedColor={variant === "danger" ? colors.negative : colors.primary}
      style={[
        styles.host,
        { minWidth: minimumLabelWidth },
        size === "sm" && styles.sm,
        props.style,
      ]}
      testID={props.testID}
    >
      <NativeButton
        label={label}
        onPress={props.onPress}
        variant={nativeVariant}
        disabled={disabled}
        modifiers={modifiers}
        testID={props.testID}
      >
        {props.icon && !props.loading ? (
          <Label title={label} systemImage={buttonIcons[props.icon].symbol} />
        ) : undefined}
      </NativeButton>
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    minHeight: 48,
    minWidth: 44,
    alignSelf: "stretch",
  },
  sm: { minHeight: 44 },
});
