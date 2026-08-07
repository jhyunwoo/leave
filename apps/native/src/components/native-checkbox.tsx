/**
 * 체크박스 — 웹(Expo Web)용 기본 구현.
 * 네이티브에서는 `native-checkbox.native.tsx`(시스템 체크박스)로 바뀐다.
 */

import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "@/theme";

export function NativeCheckbox(props: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  testID?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: props.value }}
      aria-checked={props.value}
      onPress={() => props.onValueChange(!props.value)}
      style={styles.row}
      testID={props.testID}
    >
      <View style={[styles.box, props.value && styles.boxChecked]}>
        {props.value ? <Text style={styles.check}>✓</Text> : null}
      </View>
      <Text style={styles.label}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: "stretch",
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  check: { color: colors.onPrimary, fontSize: 15, fontWeight: "800" },
  label: { flex: 1, fontSize: 13, lineHeight: 19, color: colors.body },
});
