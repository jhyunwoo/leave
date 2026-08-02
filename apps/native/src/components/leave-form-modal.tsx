import {
  addDays,
  BALANCE_LABELS,
  draftDaysByKey,
  draftsToSegments,
  fitDrafts,
  fmtDateShort,
  inclusiveDays,
  leaveCreateSchema,
  removeDraft,
  resolveDrafts,
  segmentBalanceKey,
  segmentsToDrafts,
  setDraftEnd,
  splitLastDraft,
  type BalanceKey,
  type LeaveCreateInput,
  type SegmentDraft,
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
import { SegmentRow } from "./segment-row";
import { colors, radius, spacing } from "@/theme";

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
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() =>
    editing?.segments.length
      ? segmentsToDrafts(editing.segments)
      : fitDrafts(
          [],
          editing?.startDate ?? props.initialDate ?? "",
          editing?.endDate ?? props.initialDate ?? "",
        ),
  );
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLeave();
  const update = useUpdateLeave();
  const pending = create.isPending || update.isPending;
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const duration = validRange ? inclusiveDays(startDate, endDate) : 0;
  const resolved = useMemo(
    () => (validRange ? resolveDrafts(startDate, drafts) : []),
    [validRange, startDate, drafts],
  );

  /** 기간이 바뀌면 구간을 다시 맞춰 항상 전체를 덮게 한다. */
  const applyRange = (nextStart: string, nextEnd: string) => {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDrafts((current) => fitDrafts(current, nextStart, nextEnd));
  };

  // 남은 잔여량: 수정 중이면 이 휴가가 이미 쓰고 있던 몫을 되돌려준다.
  const remainingByKey = useMemo(() => {
    const result = new Map<BalanceKey, number>(
      (balances.data?.balances ?? []).map((item) => [
        item.key,
        item.remainingDays,
      ]),
    );
    for (const segment of editing?.segments ?? []) {
      const key = segmentBalanceKey(segment);
      result.set(key, (result.get(key) ?? 0) + segment.days);
    }
    return result;
  }, [balances.data, editing]);

  // 폼에서 이미 배정한 몫까지 뺀 실제 남은 일수(재원 선택 칩에 보여준다).
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    return result;
  }, [remainingByKey, validRange, startDate, drafts]);

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    title.trim().length > 0;

  const submit = async () => {
    const input: LeaveCreateInput = {
      title: title.trim(),
      segments: draftsToSegments(startDate, drafts),
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
          "최대 출타 인원 초과",
          `등록은 완료됐지만 ${list}에 최대 출타 인원을 초과해요. 해당 날짜의 부대원들에게 알림을 보냈어요.`,
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
            onChange={(date) =>
              applyRange(date, !endDate || endDate < date ? date : endDate)
            }
          />
          <DatePickerRow
            label="종료일"
            value={endDate}
            min={startDate || undefined}
            onChange={(date) => applyRange(startDate, date)}
          />

          <View style={styles.segmentCard}>
            <View style={styles.segmentHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.segmentTitle} selectable>
                  휴가 구간
                </Text>
                <Text style={styles.segmentHint} selectable>
                  언제부터 언제까지가 어떤 휴가인지 나눠서 지정해요.
                </Text>
              </View>
              <Text style={styles.segmentTotal} selectable>
                {duration}일
              </Text>
            </View>

            {validRange ? (
              resolved.map((draft, index) => {
                const isLast = index === resolved.length - 1;
                // 뒤에 남은 구간 수만큼 최소 하루씩 남겨둬야 한다.
                const maxEnd = addDays(endDate, -(resolved.length - 1 - index));
                return (
                  <SegmentRow
                    key={index}
                    draft={draft}
                    isLast={isLast}
                    removable={resolved.length > 1}
                    maxEnd={maxEnd}
                    remainingByKey={availableByKey}
                    onChangeKey={(key) =>
                      setDrafts((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, key } : item,
                        ),
                      )
                    }
                    onChangeEnd={(date) =>
                      setDrafts((current) =>
                        setDraftEnd(current, index, date, startDate, endDate),
                      )
                    }
                    onRemove={() =>
                      setDrafts((current) =>
                        removeDraft(current, index, startDate, endDate),
                      )
                    }
                  />
                );
              })
            ) : (
              <Text style={styles.segmentHint}>
                시작일과 종료일을 먼저 골라주세요.
              </Text>
            )}

            {validRange && (
              <Button
                title="구간 추가"
                variant="secondary"
                size="sm"
                disabled={duration <= drafts.length}
                onPress={() =>
                  setDrafts((current) => {
                    const next = splitLastDraft(
                      current,
                      startDate,
                      endDate,
                      "regular_overnight",
                    );
                    return next ?? current;
                  })
                }
              />
            )}
          </View>

          {overused.length > 0 && (
            <Text selectable style={styles.error}>
              {overused
                .map(
                  ([key, remaining]) =>
                    `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
                )
                .join(", ")}
            </Text>
          )}

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
            disabled={!canSubmit}
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
  segmentCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.lg,
    gap: spacing.sm,
  },
  segmentHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.md,
  },
  segmentTitle: { fontSize: 16, fontWeight: "600", color: colors.ink },
  segmentHint: { fontSize: 12, color: colors.mute, paddingTop: 2 },
  segmentTotal: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
});
