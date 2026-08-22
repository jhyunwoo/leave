import { personalEventCreateSchema, todayInSeoul } from "@leave/shared";
import {
  useCreatePersonalEvent,
  useDeletePersonalEvent,
  usePersonalEvents,
  useUpdatePersonalEvent,
  type PersonalEvent,
} from "@leave/client";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Field, Input } from "@/components/field";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { makeStyles, spacing, useColors } from "@/theme";

export function PersonalEventFormScreen() {
  const router = useRouter();
  const colors = useColors();
  const params = useLocalSearchParams<{
    eventId?: string;
    date?: string;
    month?: string;
  }>();
  const month =
    params.month ?? params.date?.slice(0, 7) ?? todayInSeoul().slice(0, 7);
  const events = usePersonalEvents(month);

  if (params.eventId && events.isPending) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }
  const existing = events.data?.events.find(
    (event) => event.id === params.eventId,
  );
  if (params.eventId && !existing) {
    return (
      <SheetScaffold title="개인 일정" onClose={() => router.back()}>
        <Text>일정을 찾을 수 없어요.</Text>
      </SheetScaffold>
    );
  }
  return (
    <PersonalEventEditor
      key={existing?.id ?? `new-${params.date ?? month}`}
      existing={existing}
      initialDate={params.date ?? `${month}-01`}
      onClose={() => router.back()}
    />
  );
}

function PersonalEventEditor(props: {
  existing?: PersonalEvent;
  initialDate: string;
  onClose: () => void;
}) {
  const styles = useStyles();
  const [title, setTitle] = useState(props.existing?.title ?? "");
  const [startDate, setStartDate] = useState(
    props.existing?.startDate ?? props.initialDate,
  );
  const [endDate, setEndDate] = useState(
    props.existing?.endDate ?? props.initialDate,
  );
  const [startTime, setStartTime] = useState(props.existing?.startTime ?? "");
  const [endTime, setEndTime] = useState(props.existing?.endTime ?? "");
  const [note, setNote] = useState(props.existing?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const createEvent = useCreatePersonalEvent();
  const updateEvent = useUpdatePersonalEvent();
  const deleteEvent = useDeletePersonalEvent();
  const pending =
    createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const save = async () => {
    const parsed = personalEventCreateSchema.safeParse({
      title,
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      note: note || null,
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

  return (
    <SheetScaffold
      title={props.existing ? "개인 일정 수정" : "개인 일정 추가"}
      onClose={props.onClose}
      footer={
        <View style={styles.footer}>
          {props.existing ? (
            <Button
              title="삭제"
              variant="danger"
              disabled={pending}
              onPress={() =>
                Alert.alert("개인 일정 삭제", "이 일정을 삭제할까요?", [
                  { text: "취소", style: "cancel" },
                  {
                    text: "삭제",
                    style: "destructive",
                    onPress: () =>
                      void deleteEvent
                        .mutateAsync(props.existing!)
                        .then(props.onClose)
                        .catch((reason: unknown) =>
                          setError(
                            reason instanceof Error
                              ? reason.message
                              : "삭제하지 못했어요",
                          ),
                        ),
                  },
                ])
              }
            />
          ) : null}
          <Button
            title="저장"
            loading={pending}
            onPress={() => void save()}
            testID="personal-event-save"
          />
        </View>
      }
    >
      <>
        <Field label="제목">
          <Input
            value={title}
            onChangeText={setTitle}
            maxLength={80}
            autoFocus
            testID="personal-event-title"
          />
        </Field>
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
        <Field label="메모 (선택)" error={error}>
          <Input
            value={note}
            onChangeText={setNote}
            maxLength={500}
            multiline
            numberOfLines={4}
          />
        </Field>
        <Text style={styles.privacy}>
          나만 볼 수 있는 일정이며 휴가 계산·부대 통계·알림에 포함되지 않아요.
        </Text>
      </>
    </SheetScaffold>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  pair: { gap: spacing.md },
  footer: { flexDirection: "row", gap: spacing.sm },
  privacy: { color: colors.mute, fontSize: 12, lineHeight: 18 },
}));
