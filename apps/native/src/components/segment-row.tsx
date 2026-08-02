import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  fmtDateShort,
  type BalanceKey,
  type ISODate,
  type ResolvedDraft,
} from "@leave/shared";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";
import { DatePickerRow } from "./date-picker";

/**
 * 휴가 구간 한 줄. 재원과 종료일을 고른다.
 * 시작일은 앞 구간에서 파생되고, 마지막 구간의 종료일은 휴가 종료일로 고정이라
 * 어떤 조작을 해도 구간들이 기간을 빈틈없이 덮는 상태가 유지된다.
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const tone = BALANCE_COLORS[props.draft.key];

  return (
    <View style={styles.root}>
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`휴가 재원 ${BALANCE_LABELS[props.draft.key]}, 변경하려면 누르세요`}
          onPress={() => setPickerOpen((open) => !open)}
          style={[styles.keyChip, { backgroundColor: tone.bg }]}
        >
          <Text style={[styles.keyChipText, { color: tone.fg }]}>
            {BALANCE_LABELS[props.draft.key]}
          </Text>
          <Text style={[styles.keyChipCaret, { color: tone.fg }]}>▾</Text>
        </Pressable>

        <Text style={styles.range} numberOfLines={1}>
          {fmtDateShort(props.draft.startDate)} –{" "}
          {fmtDateShort(props.draft.endDate)}
        </Text>
        <Text style={styles.days}>{props.draft.days}일</Text>

        {props.removable && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="이 구간 삭제"
            onPress={props.onRemove}
            style={styles.removeBtn}
          >
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        )}
      </View>

      {pickerOpen && (
        <View style={styles.keyGrid}>
          {BALANCE_KEYS.map((key) => {
            const selected = key === props.draft.key;
            const remaining = props.remainingByKey.get(key) ?? 0;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                onPress={() => {
                  props.onChangeKey(key);
                  setPickerOpen(false);
                }}
                style={[
                  styles.keyOption,
                  selected && { backgroundColor: BALANCE_COLORS[key].bg },
                ]}
              >
                <Text
                  style={[
                    styles.keyOptionText,
                    selected && {
                      color: BALANCE_COLORS[key].fg,
                      fontWeight: "700",
                    },
                  ]}
                >
                  {BALANCE_LABELS[key]}
                </Text>
                <Text style={styles.keyOptionMeta}>잔여 {remaining}일</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {!props.isLast && (
        <DatePickerRow
          label="이 구간 종료일"
          value={props.draft.endDate}
          min={props.draft.startDate}
          max={props.maxEnd}
          onChange={props.onChangeEnd}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(14, 15, 12, 0.12)",
  },
  top: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  keyChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    minHeight: 32,
  },
  keyChipText: { fontSize: 13, fontWeight: "700" },
  keyChipCaret: { fontSize: 10 },
  range: { flex: 1, minWidth: 0, fontSize: 13, color: colors.body },
  days: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  removeBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvasSoft,
  },
  removeText: { fontSize: 13, color: colors.body },
  keyGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    backgroundColor: colors.canvas,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  keyOption: {
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.canvasSoft,
    minWidth: 92,
  },
  keyOptionText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  keyOptionMeta: { fontSize: 10, color: colors.mute, paddingTop: 2 },
});
