/**
 * 휴가 구간 한 줄 편집기 — 재원 선택 + 종료일 + 삭제.
 *
 * 사용처: 휴가 등록/수정 시트(leave-form-modal.tsx).
 * 마지막 구간의 종료일은 휴가 전체 종료일에 묶여 있어 고칠 수 없다.
 */

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  fmtDateShort,
  type BalanceKey,
  type ISODate,
  type ResolvedDraft,
} from "@leave/shared";
import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { makeStyles, radius, spacing, useBalanceColors } from "@/theme";
import { DatePickerRow } from "./date-picker";

/**
 * 휴가 구간 한 줄. 시작일은 앞 구간에서 파생하고 사용자는 재원과 경계만 고른다.
 * 재원 선택기는 RN 뷰로 직접 그려 네이티브 wheel picker가 행 밖으로 넘치지 않는다.
 */
export function SegmentRow(props: {
  draft: ResolvedDraft;
  /** 마지막 구간이면 종료일을 바꿀 수 없다(휴가 종료일에 고정). */
  isLast: boolean;
  removable: boolean;
  /** 뒤 구간들이 최소 하루씩은 가져가도록 계산한 이 구간의 종료일 상한. */
  maxEnd: ISODate;
  remainingByKey: Map<BalanceKey, number>;
  onChangeKey: (key: BalanceKey) => void;
  onChangeEnd: (date: ISODate) => void;
  onRemove: () => void;
}) {
  const styles = useStyles();
  const balance = useBalanceColors();
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedTone = balance[props.draft.key];
  const selectedRemaining = props.remainingByKey.get(props.draft.key) ?? 0;

  return (
    <View style={styles.root}>
      <View style={styles.summaryRow}>
        <View style={styles.rangeBlock}>
          <Text style={styles.range} numberOfLines={1}>
            {fmtDateShort(props.draft.startDate)} –{" "}
            {fmtDateShort(props.draft.endDate)}
          </Text>
          <Text style={styles.days}>{props.draft.days}일</Text>
        </View>

        {props.removable ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${fmtDateShort(props.draft.startDate)}부터 ${fmtDateShort(props.draft.endDate)}까지 구간 삭제`}
            onPress={props.onRemove}
            hitSlop={6}
            style={({ pressed }) => [
              styles.removeButton,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.removeText}>삭제</Text>
          </Pressable>
        ) : null}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`휴가 종류 ${BALANCE_LABELS[props.draft.key]}, 사용 후 잔여 ${selectedRemaining}일`}
        accessibilityHint="휴가 종류를 변경하려면 누르세요"
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
            이 구간 사용 후 잔여 {selectedRemaining}일
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
            const insufficient = !selected && remaining < props.draft.days;
            const tone = balance[key];

            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${BALANCE_LABELS[key]}, 잔여 ${remaining}일`}
                accessibilityHint={
                  insufficient
                    ? `선택하면 ${props.draft.days - remaining}일이 부족합니다. 다른 구간의 휴가 종류나 날짜를 조정해주세요`
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
                    ? `${props.draft.days - remaining}일 부족 · 조정 필요`
                    : `잔여 ${remaining}일`}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!props.isLast ? (
        <DatePickerRow
          label="이 종류를 사용하는 마지막 날"
          value={props.draft.endDate}
          min={props.draft.startDate}
          max={props.maxEnd}
          onChange={props.onChangeEnd}
          testID={`segment-end-${props.draft.startDate}`}
        />
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: {
    width: "100%",
    gap: spacing.sm,
    paddingTop: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  summaryRow: {
    minHeight: 44,
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
  days: {
    fontSize: 14,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  removeButton: {
    minWidth: 44,
    minHeight: 44,
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
  pressed: { opacity: 0.72 },
}));
