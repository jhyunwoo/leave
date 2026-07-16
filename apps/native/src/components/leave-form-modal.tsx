import {
  fmtDateShort,
  leaveCreateSchema,
  type LeaveCreateInput,
} from "@leave/shared";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { MyLeave } from "@/api/queries";
import { useCreateLeave, useUpdateLeave } from "@/api/queries";
import { Button } from "./button";
import { DatePickerRow } from "./date-picker";
import { Field, Input } from "./field";
import { colors, radius, spacing } from "@/theme";

export function LeaveFormModal(props: {
  visible: boolean;
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
}) {
  const editing = props.editing ?? null;
  const [title, setTitle] = useState(editing?.title ?? "");
  const [startDate, setStartDate] = useState(
    editing?.startDate ?? props.initialDate ?? "",
  );
  const [endDate, setEndDate] = useState(
    editing?.endDate ?? props.initialDate ?? "",
  );
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLeave();
  const update = useUpdateLeave();
  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const input: LeaveCreateInput = {
      title: title.trim(),
      startDate,
      endDate,
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다");
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
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>
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
              placeholder="예: 연가, 포상휴가"
            />
          </Field>
          <DatePickerRow
            label="시작일"
            value={startDate}
            onChange={(d) => {
              setStartDate(d);
              if (!endDate || endDate < d) setEndDate(d);
            }}
          />
          <DatePickerRow
            label="종료일"
            value={endDate}
            min={startDate || undefined}
            onChange={setEndDate}
          />
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

          {error && <Text style={styles.error}>{error}</Text>}

          <Button
            title={pending ? "저장 중…" : editing ? "변경사항 저장" : "휴가 등록"}
            onPress={() => void submit()}
            loading={pending}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: spacing.xl, gap: spacing.lg },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  closeText: { fontSize: 15, color: colors.ink },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
});
