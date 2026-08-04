import { Button as NativeButton, Host } from "@expo/ui";
import type { ReactNode } from "react";
import { StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "@/theme";

type Variant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";

export function Button(props: {
  title: string | ReactNode;
  onPress: () => void;
  variant?: Variant;
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  systemImage?: string;
  testID?: string;
}) {
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
  const nativeVariant =
    variant === "primary"
      ? "filled"
      : variant === "ghost"
        ? "text"
        : "outlined";
  const minimumLabelWidth = Math.max(72, [...label].length * 15 + 36);

  return (
    <Host
      matchContents
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
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: {
    minHeight: 48,
    minWidth: 44,
    alignSelf: "stretch",
  },
  sm: { minHeight: 42 },
});
