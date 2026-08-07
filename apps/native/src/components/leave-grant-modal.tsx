/**
 * 적립분 추가·수정 시트(네이티브).
 * 사용처: 보유 휴가 화면(screens/leave-grants.tsx).
 * 재원은 수정할 때 바꿀 수 없다 — 옮기면 두 재원의 사용분 귀속이 조용히 뒤집힌다.
 */

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  leaveGrantCreateSchema,
  todayInSeoul,
  type BalanceKey,
} from "@leave/shared";
import { Picker } from "@expo/ui/community/picker";
import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import type { LeaveGrantItem } from "@leave/client";
import { useCreateLeaveGrant, useUpdateLeaveGrant } from "@leave/client";
import { Button } from "@/components/button";
import { DatePickerRow } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
import { FormSheet } from "@/components/form-sheet";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { colors, spacing } from "@/theme";

/**
 * 적립분 추가·수정 시트.
 *
 * 재원은 수정할 때 바꿀 수 없다 — 옮기면 두 재원의 사용분 귀속이 조용히 뒤집힌다.
 * 만기는 선택이고, 이미 지난 날짜도 고를 수 있다(뒤늦게 장부를 맞추는 일이 흔하다).
 */
export function LeaveGrantModal(props: {
  visible: boolean;
  editing: LeaveGrantItem | null;
  /** 새로 만들 때 미리 골라 둘 재원. */
  initialKey?: BalanceKey;
  /** 자동 적립을 쓰는 동안 손으로 만들 수 없는 재원. */
  lockedKey?: BalanceKey | null;
  onClose: () => void;
}) {
  const editing = props.editing;
  const create = useCreateLeaveGrant();
  const update = useUpdateLeaveGrant();

  const [balanceKey, setBalanceKey] = useState<BalanceKey>(
    editing?.balanceKey ?? props.initialKey ?? "award",
  );
  const [days, setDays] = useState(String(editing?.days ?? 1));
  const [hasExpiry, setHasExpiry] = useState(Boolean(editing?.expiresOn));
  const [expiresOn, setExpiresOn] = useState(editing?.expiresOn ?? "");
  const [showAdvanced, setShowAdvanced] = useState(Boolean(editing?.grantedOn));
  const [grantedOn, setGrantedOn] = useState(editing?.grantedOn ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    const input = {
      balanceKey,
      days: Number(days) || 0,
      expiresOn: hasExpiry && expiresOn ? expiresOn : null,
      grantedOn: showAdvanced && grantedOn ? grantedOn : null,
      note: note.trim() ? note.trim() : null,
    };
    const parsed = leaveGrantCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    if (hasExpiry && !expiresOn) {
      setError("만기 기한을 선택해주세요");
      return;
    }

    try {
      if (editing) {
        // 재원은 그대로 두고 나머지만 보낸다.
        const { balanceKey: _ignored, ...rest } = parsed.data;
        await update.mutateAsync({ id: editing.id, input: rest });
      } else {
        await create.mutateAsync(parsed.data);
      }
      props.onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <FormSheet
      isPresented={props.visible}
      onDismiss={props.onClose}
      testID="leave-grant-sheet"
    >
      <KeyboardAvoidingView
        behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
        style={styles.sheet}
      >
        <SheetScaffold
          title={editing ? "적립분 수정" : "적립분 추가"}
          onClose={props.onClose}
          closeTestID="leave-grant-close"
          footer={
            <Button
              title={editing ? "적립분 수정" : "적립분 추가"}
              loading={pending}
              onPress={() => void submit()}
              testID="leave-grant-submit"
            />
          }
        >
          <Field
            label="재원"
            hint={
              editing
                ? "재원은 바꿀 수 없어요. 옮기려면 지우고 다시 만들어주세요."
                : undefined
            }
          >
            <Picker
              selectedValue={balanceKey}
              enabled={!editing}
              onValueChange={(value) => setBalanceKey(value as BalanceKey)}
              style={styles.pickerHost}
              testID="leave-grant-balance-picker"
            >
              {BALANCE_KEYS.filter(
                (key) => key !== props.lockedKey || key === balanceKey,
              ).map((key) => (
                <Picker.Item
                  key={key}
                  value={key}
                  label={BALANCE_LABELS[key]}
                />
              ))}
            </Picker>
          </Field>

          <Field label="일수">
            <Input
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              accessibilityLabel="적립분 일수"
              style={{ fontVariant: ["tabular-nums"] }}
            />
          </Field>

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>사용 만기 기한</Text>
              <Text style={styles.hint}>
                끄면 만기 없이 언제든 쓸 수 있어요
              </Text>
            </View>
            <Switch
              value={hasExpiry}
              onValueChange={(next) => {
                setHasExpiry(next);
                if (next && !expiresOn) setExpiresOn(todayInSeoul());
              }}
              trackColor={{ true: colors.primary, false: colors.hairline }}
            />
          </View>
          {hasExpiry && (
            <DatePickerRow
              label="만기 기한"
              value={expiresOn}
              onChange={setExpiresOn}
            />
          )}

          <Pressable
            accessibilityRole="button"
            onPress={() => setShowAdvanced((open) => !open)}
          >
            <Text style={styles.disclosure}>
              {showAdvanced ? "자세히 접기" : "자세히"}
            </Text>
          </Pressable>
          {showAdvanced && (
            <>
              <DatePickerRow
                label="부여일 (이 날부터 사용)"
                value={grantedOn}
                onChange={setGrantedOn}
              />
              <Field label="메모">
                <Input
                  value={note}
                  onChangeText={setNote}
                  placeholder="예: 사격 우수"
                  maxLength={100}
                />
              </Field>
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </SheetScaffold>
      </KeyboardAvoidingView>
    </FormSheet>
  );
}

/** 삭제 확인 — 목록 쪽에서 쓰라고 여기 둔다. */
export function confirmGrantDelete(
  grant: LeaveGrantItem,
  onConfirm: () => void,
) {
  Alert.alert(
    "적립분 삭제",
    `${BALANCE_LABELS[grant.balanceKey]} ${grant.days}일을 지울까요?` +
      (grant.usedDays > 0
        ? `\n이미 ${grant.usedDays}일을 쓴 적립분이라, 지우면 그만큼 설명되지 않는 사용분이 생겨요.`
        : ""),
    [
      { text: "취소", style: "cancel" },
      { text: "삭제", style: "destructive", onPress: onConfirm },
    ],
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  pickerHost: { minHeight: 44 },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 12, color: colors.mute },
  disclosure: { fontSize: 13, fontWeight: "600", color: colors.brand },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
});
