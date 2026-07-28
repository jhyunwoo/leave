import { Pressable, StyleSheet, Text, View } from "react-native";
import { Field, Input } from "@/components/field";
import { colors, radius, spacing } from "@/theme";

export type LeaveLimitMode = "ratio" | "count";

const RATIO_PRESETS = [
  { n: 1, d: 3 },
  { n: 1, d: 4 },
  { n: 1, d: 5 },
] as const;

export function LeaveLimitFields(props: {
  mode: LeaveLimitMode;
  onModeChange: (mode: LeaveLimitMode) => void;
  numerator: number;
  denominator: number;
  onNumeratorChange: (value: number) => void;
  onDenominatorChange: (value: number) => void;
  count: string;
  onCountChange: (value: string) => void;
  basis: number;
  basisLabel: string;
}) {
  const count = Number(props.count) || 0;
  const ratioAllowed =
    props.denominator > 0
      ? Math.floor((props.basis * props.numerator) / props.denominator)
      : 0;
  const hint =
    props.mode === "count"
      ? `하루 최대 ${count}명까지 출타할 수 있어요.`
      : `${props.basisLabel} 기준 하루 최대 ${ratioAllowed}명까지 출타할 수 있어요.`;

  return (
    <Field label="최대 출타 기준" hint={hint}>
      <View style={styles.modeSwitch}>
        {(
          [
            ["ratio", "비율로 계산"],
            ["count", "인원 직접 지정"],
          ] as const
        ).map(([mode, label]) => {
          const active = props.mode === mode;
          return (
            <Pressable
              key={mode}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              onPress={() => props.onModeChange(mode)}
              style={[styles.modeButton, active && styles.modeButtonActive]}
            >
              <Text style={[styles.modeText, active && styles.modeTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {props.mode === "ratio" ? (
        <View style={styles.ratioRow}>
          {RATIO_PRESETS.map((preset) => {
            const active =
              props.numerator === preset.n && props.denominator === preset.d;
            return (
              <Pressable
                key={`${preset.n}/${preset.d}`}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => {
                  props.onNumeratorChange(preset.n);
                  props.onDenominatorChange(preset.d);
                }}
                style={[styles.ratioButton, active && styles.ratioButtonActive]}
              >
                <Text
                  style={[styles.ratioText, active && styles.ratioTextActive]}
                >
                  {preset.n}/{preset.d}
                </Text>
              </Pressable>
            );
          })}
          <View style={styles.ratioInputs}>
            <Input
              value={String(props.numerator)}
              onChangeText={(value) =>
                props.onNumeratorChange(Number(value) || 0)
              }
              keyboardType="number-pad"
              style={styles.ratioInput}
              accessibilityLabel="출타율 분자"
            />
            <Text style={styles.slash}>/</Text>
            <Input
              value={String(props.denominator)}
              onChangeText={(value) =>
                props.onDenominatorChange(Number(value) || 0)
              }
              keyboardType="number-pad"
              style={styles.ratioInput}
              accessibilityLabel="출타율 분모"
            />
          </View>
        </View>
      ) : (
        <View style={styles.countRow}>
          <Input
            value={props.count}
            onChangeText={props.onCountChange}
            keyboardType="number-pad"
            style={styles.countInput}
            accessibilityLabel="하루 최대 출타 인원"
          />
          <Text style={styles.unit}>명</Text>
        </View>
      )}
    </Field>
  );
}

const styles = StyleSheet.create({
  modeSwitch: {
    flexDirection: "row",
    padding: 4,
    borderRadius: radius.md,
    backgroundColor: colors.canvasSoft,
    gap: 4,
  },
  modeButton: {
    flex: 1,
    minHeight: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
  },
  modeButtonActive: { backgroundColor: colors.canvas },
  modeText: { fontSize: 13, fontWeight: "600", color: colors.mute },
  modeTextActive: { color: colors.ink },
  ratioRow: {
    flexDirection: "row",
    gap: spacing.sm,
    alignItems: "center",
    flexWrap: "wrap",
  },
  ratioButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.canvasSoft,
  },
  ratioButtonActive: { backgroundColor: colors.primary },
  ratioText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  ratioTextActive: { color: colors.onPrimary },
  ratioInputs: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginLeft: "auto",
  },
  ratioInput: {
    width: 56,
    textAlign: "center",
    paddingHorizontal: spacing.sm,
    minHeight: 42,
  },
  slash: { fontWeight: "600", color: colors.ink },
  countRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  countInput: { width: 120, textAlign: "center" },
  unit: { fontSize: 16, fontWeight: "600", color: colors.ink },
});
