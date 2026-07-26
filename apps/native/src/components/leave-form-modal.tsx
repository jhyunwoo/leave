import {
  allocationBalanceKey,
  BALANCE_KEYS,
  BALANCE_LABELS,
  fmtDateShort,
  inclusiveDays,
  leaveCreateSchema,
  type BalanceKey,
  type LeaveAllocationInput,
  type LeaveCreateInput,
} from "@leave/shared";
import { useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MyLeave } from "@/api/queries";
import {
  useCreateLeave,
  useLeaveBalances,
  useUpdateLeave,
} from "@/api/queries";
import { Button } from "./button";
import { DatePickerRow } from "./date-picker";
import { Field, Input } from "./field";
import { colors, radius, spacing } from "@/theme";

function allocationForKey(key: BalanceKey, days: number): LeaveAllocationInput {
  if (key === "regular_overnight") {
    return { category: "overnight", overnightKind: "regular", days };
  }
  if (key === "other_overnight") {
    return { category: "overnight", overnightKind: "other", days };
  }
  return { category: key, days };
}

function initialAmounts(editing: MyLeave | null): Record<BalanceKey, number> {
  const result = Object.fromEntries(
    BALANCE_KEYS.map((key) => [key, 0]),
  ) as Record<BalanceKey, number>;
  for (const allocation of editing?.allocations ?? []) {
    result[allocationBalanceKey(allocation)] = allocation.days;
  }
  return result;
}

export function LeaveFormModal(props: {
  visible: boolean;
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
}) {
  const editing = props.editing ?? null;
  const balances = useLeaveBalances();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [startDate, setStartDate] = useState(
    editing?.startDate ?? props.initialDate ?? "",
  );
  const [endDate, setEndDate] = useState(
    editing?.endDate ?? props.initialDate ?? "",
  );
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [amounts, setAmounts] = useState(() => initialAmounts(editing));
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLeave();
  const update = useUpdateLeave();
  const pending = create.isPending || update.isPending;
  const duration =
    startDate && endDate && startDate <= endDate
      ? inclusiveDays(startDate, endDate)
      : 0;
  const allocated = Object.values(amounts).reduce((sum, days) => sum + days, 0);
  const remainingByKey = useMemo(() => {
    const result = new Map(
      (balances.data?.balances ?? []).map((item) => [
        item.key,
        item.remainingDays,
      ]),
    );
    for (const allocation of editing?.allocations ?? []) {
      const key = allocationBalanceKey(allocation);
      result.set(key, (result.get(key) ?? 0) + allocation.days);
    }
    return result;
  }, [balances.data, editing]);

  const submit = async () => {
    const allocations = BALANCE_KEYS.filter((key) => amounts[key] > 0).map(
      (key) => allocationForKey(key, amounts[key]),
    );
    const input: LeaveCreateInput = {
      title: title.trim(),
      startDate,
      endDate,
      allocations,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    const parsed = leaveCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    setError(null);
    try {
      const result = editing
        ? await update.mutateAsync({ id: editing.id, input: parsed.data })
        : await create.mutateAsync(parsed.data);
      props.onClose();
      if (result.exceededDates.length > 0) {
        const list = result.exceededDates.map(fmtDateShort).join(", ");
        Alert.alert(
          "출타율 초과",
          `등록은 완료됐지만 ${list}에 부대 출타율이 초과돼요. 해당 날짜의 부대원들에게 알림을 보냈어요.`,
        );
      }
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <Modal
      visible={props.visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onClose}
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <ScrollView
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title} selectable>
              {editing ? "휴가 수정" : "휴가 등록"}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="닫기"
              onPress={props.onClose}
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          <Field label="휴가 제목">
            <Input
              value={title}
              onChangeText={setTitle}
              placeholder="예: 제주도 가족여행"
            />
          </Field>
          <DatePickerRow
            label="시작일"
            value={startDate}
            onChange={(date) => {
              setStartDate(date);
              if (!endDate || endDate < date) setEndDate(date);
            }}
          />
          <DatePickerRow
            label="종료일"
            value={endDate}
            min={startDate || undefined}
            onChange={setEndDate}
          />

          <View style={styles.allocationCard}>
            <View style={styles.allocationHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.allocationTitle} selectable>
                  휴가 재원 배분
                </Text>
                <Text style={styles.allocationHint} selectable>
                  기간과 재원 합계가 같아야 해요.
                </Text>
              </View>
              <Text
                selectable
                style={[
                  styles.allocationTotal,
                  allocated === duration && duration > 0
                    ? styles.totalValid
                    : styles.totalInvalid,
                ]}
              >
                {allocated} / {duration}일
              </Text>
            </View>
            {BALANCE_KEYS.map((key) => (
              <View key={key} style={styles.allocationRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.allocationLabel} selectable>
                    {BALANCE_LABELS[key]}
                  </Text>
                  <Text style={styles.allocationRemaining} selectable>
                    사용 가능 {remainingByKey.get(key) ?? 0}일
                  </Text>
                </View>
                <Input
                  value={String(amounts[key])}
                  onChangeText={(value) =>
                    setAmounts((current) => ({
                      ...current,
                      [key]: Math.max(0, Number(value) || 0),
                    }))
                  }
                  keyboardType="number-pad"
                  accessibilityLabel={`${BALANCE_LABELS[key]} 사용 일수`}
                  style={styles.dayInput}
                />
              </View>
            ))}
          </View>

          <Field label="사유 (선택)">
            <Input
              value={reason}
              onChangeText={setReason}
              placeholder="사유를 남기면 부대원들이 함께 볼 수 있어요"
              multiline
              numberOfLines={3}
              style={{ minHeight: 80, textAlignVertical: "top" }}
            />
          </Field>

          {error && (
            <Text selectable style={styles.error}>
              {error}
            </Text>
          )}

          <Button
            title={
              pending ? "저장 중…" : editing ? "변경사항 저장" : "휴가 등록"
            }
            onPress={() => void submit()}
            loading={pending}
            disabled={allocated !== duration || duration === 0}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.canvas },
  content: {
    padding: spacing.xl,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "600", color: colors.ink },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontSize: 15, color: colors.ink },
  allocationCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.md,
  },
  allocationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  allocationTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  allocationHint: { fontSize: 12, color: colors.mute, paddingTop: 2 },
  allocationTotal: {
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  totalValid: { color: colors.positiveDeep },
  totalInvalid: { color: colors.negativeDeep },
  allocationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  allocationLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  allocationRemaining: { fontSize: 11, color: colors.mute, paddingTop: 2 },
  dayInput: {
    width: 84,
    minHeight: 42,
    paddingVertical: spacing.sm,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
});
