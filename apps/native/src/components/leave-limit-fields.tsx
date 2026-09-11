/**
 * 출타 집계 기준 입력 — 하루 최대 출타 인원과, 외출을 거기에 넣을지.
 * 사용처: 그룹 생성(units 화면)과 그룹 관리(unit-manage 화면).
 * 이 값들이 달력 초과 판정의 기준이므로 두 화면이 같은 컴포넌트를 쓴다.
 */

import { Switch, Text, View } from "react-native";
import { Field, Input } from "@/components/field";
import { makeStyles, spacing, useColors } from "@/theme";

/** 하루 최대 출타 인원과 외출 포함 여부 — 부대 관리자가 직접 지정한다. */
export function LeaveLimitFields(props: {
  count: string;
  onCountChange: (value: string) => void;
  outingCounts: boolean;
  onOutingCountsChange: (value: boolean) => void;
  testID?: string;
  outingTestID?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const count = Number(props.count);
  const hint = Number.isFinite(count)
    ? `하루에 최대 ${Math.max(0, Math.floor(count))}명까지 출타할 수 있어요.`
    : "하루에 몇 명까지 나갈 수 있는지 인원으로 적어주세요.";

  return (
    <>
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

      <Field
        label="외출을 출타율에 포함"
        hint="끄면 외출한 날은 하루 최대 출타 인원 계산에서 빠져요. 출타 명단에는 그대로 보입니다."
      >
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>외출도 그날 출타 인원으로 센다</Text>
          <Switch
            value={props.outingCounts}
            onValueChange={props.onOutingCountsChange}
            trackColor={{ false: colors.surfaceStrong, true: colors.brand }}
            testID={props.outingTestID}
          />
        </View>
      </Field>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  countRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countInput: { width: 120, textAlign: "center" },
  unit: { fontSize: 16, fontWeight: "600", color: colors.ink },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    minHeight: 44,
  },
  toggleLabel: { flex: 1, fontSize: 14, color: colors.body },
}));
