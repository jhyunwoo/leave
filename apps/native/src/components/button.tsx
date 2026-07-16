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

type Variant = "primary" | "secondary" | "tertiary" | "danger";

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
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        disabled && { opacity: 0.45 },
        props.style,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={variant === "primary" ? colors.onPrimary : colors.ink} />
      ) : typeof props.title === "string" ? (
        <Text
          style={[
            styles.label,
            size === "sm" && styles.labelSm,
            variant === "danger" && { color: colors.negativeDeep },
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
  },
  sm: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    minHeight: 38,
  },
  primary: { backgroundColor: colors.primary },
  secondary: { backgroundColor: colors.canvasSoft },
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
  label: {
    fontSize: 16,
    fontWeight: "600",
    color: colors.ink,
  },
  labelSm: { fontSize: 14 },
});
