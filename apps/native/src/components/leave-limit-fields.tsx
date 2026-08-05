import { StyleSheet, Text, View } from "react-native";
import { Field, Input } from "@/components/field";
import { colors, spacing } from "@/theme";

/** 하루 최대 출타 인원 — 부대 관리자가 직접 지정한다. */
export function LeaveLimitFields(props: {
  count: string;
  onCountChange: (value: string) => void;
  testID?: string;
}) {
  const count = Number(props.count);
  const hint = Number.isFinite(count)
    ? `하루에 최대 ${Math.max(0, Math.floor(count))}명까지 출타할 수 있어요.`
    : "하루에 몇 명까지 나갈 수 있는지 인원으로 적어주세요.";

  return (
    <Field label="하루 최대 출타 인원" hint={hint}>
      <View style={styles.countRow}>
        <Input
          value={props.count}
          onChangeText={props.onCountChange}
          keyboardType="number-pad"
          style={styles.countInput}
          accessibilityLabel="하루 최대 출타 인원"
          testID={props.testID}
        />
        <Text style={styles.unit}>명</Text>
      </View>
    </Field>
  );
}

const styles = StyleSheet.create({
  countRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countInput: { width: 120, textAlign: "center" },
  unit: { fontSize: 16, fontWeight: "600", color: colors.ink },
});
