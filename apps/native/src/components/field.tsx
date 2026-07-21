import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { colors, radius, spacing } from "@/theme";

export function Field(props: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children}
      {props.error ? (
        <Text style={styles.error}>{props.error}</Text>
      ) : props.hint ? (
        <Text style={styles.hint}>{props.hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={colors.mute}
      {...props}
      style={[styles.input, props.style]}
    />
  );
}

const styles = StyleSheet.create({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 12, color: colors.mute },
  error: { fontSize: 12, fontWeight: "600", color: colors.negativeDeep },
  input: {
    backgroundColor: colors.canvas,
    borderWidth: 1,
    borderColor: colors.ink,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.ink,
    minHeight: 48,
  },
});
