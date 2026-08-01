import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { colors, radius, spacing } from "@/theme";

type Variant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";

export function Button(props: {
  title: string | ReactNode;
  onPress: () => void;
  variant?: Variant;
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const disabled = props.disabled || props.loading;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        size === "sm" && styles.sm,
        pressed && { transform: [{ scale: 0.97 }], opacity: 0.92 },
        disabled && { opacity: 0.45 },
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator
          color={variant === "primary" ? colors.onPrimary : colors.ink}
        />
      ) : typeof props.title === "string" ? (
        <Text
          style={[
            styles.label,
            size === "sm" && styles.labelSm,
            variant === "primary" && { color: colors.onPrimary },
            variant === "danger" && { color: colors.negativeDeep },
            variant === "ghost" && { color: colors.brand, fontWeight: "700" },
          ]}
        >
          {props.title}
        </Text>
      ) : (
        props.title
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.xl,
    minHeight: 48,
    borderCurve: "continuous",
  },
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 42,
  },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.hairline,
  },
  tertiary: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.ink,
  },
  danger: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.negative,
  },
  /** 배경·테두리 없는 텍스트 버튼. 헤더의 보조 액션("오늘")용. */
  ghost: { backgroundColor: "transparent", paddingHorizontal: spacing.sm },
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  labelSm: { fontSize: 14 },
});
