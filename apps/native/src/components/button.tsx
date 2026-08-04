import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
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
  const disabled = Boolean(props.disabled || props.loading);
  const foreground =
    variant === "primary"
      ? colors.onPrimary
      : variant === "danger"
        ? colors.negative
        : variant === "ghost"
          ? colors.brand
          : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: props.loading }}
      disabled={disabled}
      onPress={props.onPress}
      testID={props.testID}
      style={({ pressed }) => [
        styles.button,
        size === "sm" && styles.sm,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "tertiary" && styles.tertiary,
        variant === "danger" && styles.danger,
        variant === "ghost" && styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : typeof props.title === "string" ? (
        <Text style={[styles.label, { color: foreground }]}>{props.title}</Text>
      ) : (
        props.title
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  sm: { minHeight: 42, paddingHorizontal: 16 },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.canvas,
    borderColor: colors.hairline,
  },
  tertiary: { backgroundColor: colors.primaryPale },
  danger: {
    backgroundColor: colors.canvas,
    borderColor: colors.negative,
  },
  ghost: { backgroundColor: "transparent" },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  label: { fontSize: 15, fontWeight: "700" },
});
