/**
 * 버튼 — Android용 Compose 구현(@expo/ui).
 * iOS 구현과 props가 같고, Material 스타일만 다르다.
 */

import { Icon, Row, Text } from "@expo/ui/jetpack-compose";
import { buttonIconSources } from "./button-icon-sources.native";
import { type ButtonIcon } from "./button-icons";

import { Button as NativeButton, Host } from "@expo/ui";
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
  // Compose의 Material 팔레트 생성기에는 확정된 ARGB가 필요하다.
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
  // ghost도 테두리를 가진다(`text`가 아니라 `outlined`). 배경도 테두리도 없는
  // 글자는 그 변형만 놓인 자리("닫기", "선택 해제")에서 누를 수 있는 것으로
  // 읽히지 않았다. iOS 구현도 같은 이유로 모든 변형이 캡슐을 가진다.
  const nativeVariant = variant === "primary" ? "filled" : "outlined";
  const minimumLabelWidth = props.flexible
    ? undefined
    : estimateLabelWidth(
        label,
        windowWidth,
        Boolean(props.icon && !props.loading),
      );

  return (
    <Host
      matchContents
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
        testID={props.testID}
      >
        {props.icon && !props.loading ? (
          <Row
            horizontalArrangement={{ spacedBy: 8 }}
            verticalAlignment="center"
          >
            <Icon source={buttonIconSources[props.icon]} size={18} />
            <Text>{label}</Text>
          </Row>
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
