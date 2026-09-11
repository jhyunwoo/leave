/**
 * 휴가 구간 한 줄 편집기 — 재원 선택 + 개수 + 삭제.
 *
 * 사용처: 휴가 등록/수정 시트(leave-form-modal.tsx).
 *
 * 사용자가 고르는 것은 **며칠 쓰는가**이고 날짜는 거기서 파생된다("연가 4개" →
 * 8/2–8/5). 그래서 이 행에는 날짜 선택기가 없다. 예전에는 구간마다 "이 종류를
 * 사용하는 마지막 날"을 골랐는데, 마지막 구간만 규칙이 달랐고("휴가 종료일에 고정")
 * 무엇보다 "연가 몇 개"를 말할 자리가 없었다.
 *
 * 행 전체가 꾹 눌러 드래그하는 손잡이다(`segment-reorder-list.tsx`). 그래서 행 안의
 * 누를 수 있는 것들은 모두 짧은 탭으로만 반응해야 한다.
 */

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  balanceUnitLabel,
  fmtDateShort,
  type BalanceKey,
  type ResolvedDraft,
} from "@leave/shared";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { makeStyles, radius, spacing, useBalanceColors } from "@/theme";

/**
 * 휴가 구간 한 줄. 개수를 바꾸면 이 행과 뒤 행들의 날짜가 함께 다시 계산된다.
 * 재원 선택기는 RN 뷰로 직접 그려 네이티브 wheel picker가 행 밖으로 넘치지 않는다.
 */
export function SegmentRow(props: {
  draft: ResolvedDraft;
  removable: boolean;
  remainingByKey: Map<BalanceKey, number>;
  onChangeKey: (key: BalanceKey) => void;
  onChangeDays: (days: number) => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const balance = useBalanceColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedTone = balance[props.draft.key];
  const selectedRemaining = props.remainingByKey.get(props.draft.key) ?? 0;
  // 외출은 일이 아니라 횟수다(@leave/shared의 balanceUnitLabel).
  const selectedUnit = balanceUnitLabel(props.draft.key);
  const days = props.draft.days;

  return (
    <View style={styles.root}>
      <View style={styles.summaryRow}>
        <View style={styles.rangeBlock}>
          <Text style={styles.range} numberOfLines={1}>
            {fmtDateShort(props.draft.startDate)} –{" "}
            {fmtDateShort(props.draft.endDate)}
          </Text>
        </View>

        {props.removable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${BALANCE_LABELS[props.draft.key]} 구간 삭제`}
            onPress={props.onRemove}
            hitSlop={6}
            style={({ pressed }) => [
              styles.removeButton,
              pressed && styles.pressed,
            ]}
            testID="segment-remove"
          >
            <Text style={styles.removeText}>삭제</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`휴가 종류 ${BALANCE_LABELS[props.draft.key]}, 사용 후 잔여 ${selectedRemaining}${selectedUnit}`}
        accessibilityHint="휴가 종류를 변경하려면 누르세요. 순서를 바꾸려면 길게 누른 채 끌어주세요"
        accessibilityState={{ expanded: pickerOpen }}
        onPress={() => setPickerOpen((open) => !open)}
        style={({ pressed }) => [
          styles.selectedBalance,
          { backgroundColor: selectedTone.bg },
          pressed && styles.pressed,
        ]}
        testID="segment-balance-picker"
      >
        <View
          style={[styles.balanceMarker, { backgroundColor: selectedTone.fg }]}
        />
        <View style={styles.balanceText}>
          <Text style={[styles.balanceLabel, { color: selectedTone.fg }]}>
            {BALANCE_LABELS[props.draft.key]}
          </Text>
          <Text style={[styles.balanceMeta, { color: selectedTone.fg }]}>
            이 구간 사용 후 잔여 {selectedRemaining}
            {selectedUnit}
          </Text>
        </View>
        <Text style={[styles.changeText, { color: selectedTone.fg }]}>
          {pickerOpen ? "접기" : "변경"}
        </Text>
      </Pressable>

      {pickerOpen ? (
        <View
          accessibilityLabel="휴가 종류 선택"
          style={styles.balanceGrid}
          testID="segment-balance-options"
        >
          {BALANCE_KEYS.map((key) => {
            const selected = key === props.draft.key;
            const remaining = props.remainingByKey.get(key) ?? 0;
            const insufficient = !selected && remaining < days;
            const tone = balance[key];
            // 외출은 일이 아니라 횟수다(@leave/shared의 balanceUnitLabel).
            const unit = balanceUnitLabel(key);

            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${BALANCE_LABELS[key]}, 잔여 ${remaining}${unit}`}
                accessibilityHint={
                  insufficient
                    ? `선택하면 ${days - remaining}${unit}이 부족합니다. 개수를 줄이거나 다른 종류를 골라주세요`
                    : undefined
                }
                accessibilityState={{ selected }}
                onPress={() => {
                  if (process.env.EXPO_OS === "ios") {
                    void Haptics.selectionAsync();
                  }
                  props.onChangeKey(key);
                  setPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.balanceOption,
                  selected && {
                    backgroundColor: tone.bg,
                    borderColor: tone.fg,
                  },
                  insufficient && styles.balanceOptionInsufficient,
                  pressed && styles.pressed,
                ]}
                testID={`segment-balance-option-${key}`}
              >
                <View style={styles.optionHeader}>
                  <Text
                    style={[styles.optionLabel, selected && { color: tone.fg }]}
                    numberOfLines={1}
                  >
                    {BALANCE_LABELS[key]}
                  </Text>
                  {selected ? (
                    <Text style={[styles.selectedMark, { color: tone.fg }]}>
                      ✓
                    </Text>
                  ) : null}
                </View>
                <Text
                  style={[
                    styles.optionMeta,
                    selected && { color: tone.fg },
                    insufficient && styles.optionMetaInsufficient,
                  ]}
                  numberOfLines={1}
                >
                  {insufficient
                    ? `${days - remaining}${unit} 부족 · 조정 필요`
                    : `잔여 ${remaining}${unit}`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <DaysStepper
        label={BALANCE_LABELS[props.draft.key]}
        days={days}
        onChange={props.onChangeDays}
      />
    </View>
  );
}

/**
 * 개수 조절기. 값을 글자로도 보여주는 이유는, 이 숫자가 곧 위 날짜 범위의 근거라
 * 눌러서 바꾼 결과가 어디에 반영됐는지 눈으로 이어져야 하기 때문이다.
 */
function DaysStepper(props: {
  label: string;
  days: number;
  onChange: (days: number) => void;
}) {
  const styles = useStyles();
  const atMinimum = props.days <= 1;

  const step = (delta: number) => {
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    props.onChange(props.days + delta);
  };

  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel} selectable>
        며칠 사용할까요
      </Text>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={`${props.label} 사용 일수`}
        accessibilityValue={{
          min: 1,
          now: props.days,
          text: `${props.days}일`,
        }}
        accessibilityActions={[
          { name: "increment", label: "하루 늘리기" },
          { name: "decrement", label: "하루 줄이기" },
        ]}
        onAccessibilityAction={(event) => {
          if (event.nativeEvent.actionName === "increment") step(1);
          if (event.nativeEvent.actionName === "decrement" && !atMinimum) {
            step(-1);
          }
        }}
        style={styles.stepper}
      >
        <Pressable
          // 접근성 트리에는 위 adjustable 하나로 충분하다. 버튼 두 개를 따로
          // 노출하면 같은 조작이 세 번 읽힌다.
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          disabled={atMinimum}
          onPress={() => step(-1)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stepperButton,
            atMinimum && styles.stepperButtonDisabled,
            pressed && !atMinimum && styles.pressed,
          ]}
          testID="segment-days-decrement"
        >
          <Text
            style={[
              styles.stepperSign,
              atMinimum && styles.stepperSignDisabled,
            ]}
          >
            −
          </Text>
        </Pressable>

        <Text style={styles.stepperValue} testID="segment-days-value">
          {props.days}일
        </Text>

        <Pressable
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          onPress={() => step(1)}
          hitSlop={6}
          style={({ pressed }) => [
            styles.stepperButton,
            pressed && styles.pressed,
          ]}
          testID="segment-days-increment"
        >
          <Text style={styles.stepperSign}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    width: "100%",
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  summaryRow: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rangeBlock: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
  },
  range: { flex: 1, minWidth: 0, fontSize: 13, color: colors.body },
  removeButton: {
    minWidth: 44,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.negativeTint,
  },
  removeText: { fontSize: 12, fontWeight: "700", color: colors.negativeDeep },
  selectedBalance: {
    width: "100%",
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderCurve: "continuous",
  },
  balanceMarker: { width: 8, height: 32, borderRadius: radius.pill },
  balanceText: { flex: 1, minWidth: 0, gap: 1 },
  balanceLabel: { fontSize: 15, fontWeight: "800" },
  balanceMeta: { fontSize: 11, opacity: 0.82 },
  changeText: { fontSize: 12, fontWeight: "800" },
  balanceGrid: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
  },
  balanceOption: {
    minWidth: 116,
    minHeight: 58,
    flexGrow: 1,
    flexBasis: "45%",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    backgroundColor: colors.canvasSoft,
  },
  balanceOptionInsufficient: { borderColor: colors.negative },
  optionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  optionLabel: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
  },
  selectedMark: { fontSize: 13, fontWeight: "900" },
  optionMeta: { fontSize: 10, color: colors.body },
  optionMetaInsufficient: { color: colors.negativeDeep },
  stepperRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  stepperLabel: { flex: 1, minWidth: 0, fontSize: 13, color: colors.body },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: radius.pill,
    backgroundColor: colors.canvas,
  },
  stepperButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.pill,
  },
  stepperButtonDisabled: { opacity: 0.4 },
  stepperSign: { fontSize: 20, fontWeight: "700", color: colors.ink },
  stepperSignDisabled: { color: colors.mute },
  stepperValue: {
    minWidth: 52,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  pressed: { opacity: 0.72 },
}));
