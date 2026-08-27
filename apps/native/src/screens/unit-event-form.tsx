import { todayInSeoul, unitEventCreateSchema } from "@leave/shared";
import {
  useCalendar,
  useCreateUnitEvent,
  useDeleteUnitEvent,
  useMe,
  useUpdateUnitEvent,
  type UnitEvent,
} from "@leave/client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";
import { Button } from "@/components/button";
import { Field, Input } from "@/components/field";
import { confirmAction } from "@/lib/dialog";
import { layout, makeStyles, radius, spacing, useColors } from "@/theme";

export function UnitEventFormScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    eventId?: string;
    date?: string;
    month?: string;
  }>();
  const me = useMe();
  const unitId = me.data?.unit?.id ?? null;
  const month =
    params.month ?? params.date?.slice(0, 7) ?? todayInSeoul().slice(0, 7);
  const calendar = useCalendar(unitId, month);

  if (me.isPending || (params.eventId && calendar.isPending)) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  const unit = me.data?.unit;
  if (!unit || unit.adminId !== me.data?.user.id) {
    return (
      <>
        <SheetTitle title="부대 일정" onClose={() => router.back()} />
        <FormBody>
          <Text selectable style={{ color: colors.body }}>
            부대 관리자만 부대 일정을 관리할 수 있어요.
          </Text>
        </FormBody>
      </>
    );
  }
  const existing = calendar.data?.events.find(
    (event) => event.id === params.eventId,
  );
  if (params.eventId && !existing) {
    return (
      <>
        <SheetTitle title="부대 일정" onClose={() => router.back()} />
        <FormBody>
          <Text selectable style={{ color: colors.body }}>
            부대 일정을 찾을 수 없어요.
          </Text>
        </FormBody>
      </>
    );
  }
  return (
    <UnitEventEditor
      key={existing?.id ?? `new-${params.date ?? month}`}
      unitId={unit.id}
      existing={existing}
      initialDate={params.date ?? `${month}-01`}
      onClose={() => router.back()}
    />
  );
}

function UnitEventEditor(props: {
  unitId: string;
  existing?: UnitEvent;
  initialDate: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const [title, setTitle] = useState(props.existing?.title ?? "");
  const [isHoliday, setIsHoliday] = useState(
    props.existing?.isHoliday ?? false,
  );
  const [startDate, setStartDate] = useState(
    props.existing?.startDate ?? props.initialDate,
  );
  const [endDate, setEndDate] = useState(
    props.existing?.endDate ?? props.initialDate,
  );
  const [startTime, setStartTime] = useState(props.existing?.startTime ?? "");
  const [endTime, setEndTime] = useState(props.existing?.endTime ?? "");
  const [details, setDetails] = useState(props.existing?.details ?? "");
  const [error, setError] = useState<string | null>(null);
  const createEvent = useCreateUnitEvent(props.unitId);
  const updateEvent = useUpdateUnitEvent(props.unitId);
  const deleteEvent = useDeleteUnitEvent(props.unitId);
  const pending =
    createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const save = async () => {
    const parsed = unitEventCreateSchema.safeParse({
      title,
      isHoliday,
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      details: details || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      if (props.existing) {
        await updateEvent.mutateAsync({
          id: props.existing.id,
          input: parsed.data,
          previous: props.existing,
        });
      } else {
        await createEvent.mutateAsync(parsed.data);
      }
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "저장하지 못했어요");
    }
  };

  const remove = async () => {
    const existing = props.existing;
    if (!existing) return;
    const confirmed = await confirmAction({
      title: "부대 일정 삭제",
      message: "모든 부대원의 달력에서 이 일정을 삭제할까요?",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await deleteEvent.mutateAsync(existing);
      props.onClose();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "삭제하지 못했어요");
    }
  };

  return (
    <>
      <SheetTitle
        title={props.existing ? "부대 일정 수정" : "부대 일정 추가"}
        onClose={props.onClose}
      />
      <FormBody>
        <Field label="부대 일정명">
          <Input
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            testID="unit-event-title"
          />
        </Field>
        <View style={styles.kindRow}>
          <View style={styles.kindCopy}>
            <Text selectable style={styles.kindTitle}>
              휴일 일정
            </Text>
            <Text selectable style={styles.kindHint}>
              켜면 달력에서 공휴일처럼 빨간색으로 표시돼요.
            </Text>
          </View>
          <Switch
            value={isHoliday}
            onValueChange={setIsHoliday}
            trackColor={{ false: colors.surfaceStrong, true: colors.negative }}
            testID="unit-event-holiday"
          />
        </View>
        <View style={styles.pair}>
          <Field label="시작일" hint="YYYY-MM-DD">
            <Input
              value={startDate}
              onChangeText={setStartDate}
              autoCapitalize="none"
            />
          </Field>
          <Field label="종료일" hint="YYYY-MM-DD">
            <Input
              value={endDate}
              onChangeText={setEndDate}
              autoCapitalize="none"
            />
          </Field>
        </View>
        <View style={styles.pair}>
          <Field label="시작 시간 (선택)" hint="HH:mm">
            <Input
              value={startTime}
              onChangeText={setStartTime}
              autoCapitalize="none"
            />
          </Field>
          <Field label="종료 시간 (선택)" hint="HH:mm">
            <Input
              value={endTime}
              onChangeText={setEndTime}
              autoCapitalize="none"
            />
          </Field>
        </View>
        <Field label="상세 정보 (선택)" error={error}>
          <Input
            value={details}
            onChangeText={setDetails}
            maxLength={1000}
            multiline
            numberOfLines={5}
          />
        </Field>
        <Text selectable style={styles.sharedHint}>
          저장하면 같은 부대의 모든 부대원에게 일정명과 상세 정보가 공유돼요.
        </Text>
        <View style={styles.actions}>
          <Button
            title="저장"
            loading={pending}
            onPress={() => void save()}
            testID="unit-event-save"
          />
          {props.existing ? (
            <Button
              title="삭제"
              variant="danger"
              disabled={pending}
              onPress={() => void remove()}
            />
          ) : null}
        </View>
      </FormBody>
    </>
  );
}

function FormBody(props: { children: ReactNode }) {
  const styles = useStyles();
  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
    >
      {props.children}
    </ScrollView>
  );
}

function SheetTitle(props: { title: string; onClose: () => void }) {
  const colors = useColors();
  return (
    <Stack.Screen
      options={{
        title: props.title,
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            hitSlop={12}
            testID="unit-event-close"
          >
            {({ pressed }) => (
              <Text
                style={{
                  color: colors.brand,
                  fontSize: 17,
                  opacity: pressed ? 0.5 : 1,
                }}
              >
                닫기
              </Text>
            )}
          </Pressable>
        ),
      }}
    />
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    maxWidth: layout.formContent,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  pair: { gap: spacing.md },
  kindRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceCard,
  },
  kindCopy: { flex: 1, gap: spacing.xs },
  kindTitle: { color: colors.ink, fontSize: 15, fontWeight: "600" },
  kindHint: { color: colors.mute, fontSize: 12, lineHeight: 18 },
  sharedHint: { color: colors.mute, fontSize: 12, lineHeight: 18 },
  actions: { width: "100%", gap: spacing.sm, marginTop: spacing.sm },
}));
