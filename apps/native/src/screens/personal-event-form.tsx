import { personalEventCreateSchema, todayInSeoul } from "@leave/shared";
import {
  useCreatePersonalEvent,
  useDeletePersonalEvent,
  usePersonalEvents,
  useUpdatePersonalEvent,
  type PersonalEvent,
} from "@leave/client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { Button } from "@/components/button";
import { Field, Input } from "@/components/field";
import { SheetScaffold } from "@/components/sheet-scaffold";
import { confirmAction } from "@/lib/dialog";
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
      <>
        <SheetTitle title="개인 일정" onClose={() => router.back()} />
        <SheetScaffold>
          <Text>일정을 찾을 수 없어요.</Text>
        </SheetScaffold>
      </>
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

  const remove = async () => {
    const existing = props.existing;
    if (!existing) return;
    const confirmed = await confirmAction({
      title: "개인 일정 삭제",
      message: "이 일정을 삭제할까요?",
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
        title={props.existing ? "개인 일정 수정" : "개인 일정 추가"}
        onClose={props.onClose}
      />
      <SheetScaffold
        footer={
          <View style={styles.footer}>
            <Button
              title="저장"
              loading={pending}
              onPress={() => void save()}
              testID="personal-event-save"
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
        }
      >
        <>
          <Field label="제목">
            {/*
            autoFocus를 걸지 않는다. 시트가 올라오는 애니메이션 도중 키보드가 뜨면
            UIKit이 포커스된 입력을 보이려고 스크롤 본문을 밀어 올려, 제목 칸이
            헤더 위로 튀어나온 채 굳는다. 앱의 다른 시트들도 열자마자 포커스하지 않는다.
          */}
            <Input
              value={title}
              onChangeText={setTitle}
              maxLength={80}
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
    </>
  );
}

/**
 * 시트의 제목과 닫기 버튼을 시스템 내비게이션 바에 실어 보낸다.
 *
 * 시트 안에 RN으로 헤더를 그리지 않는 이유는 `(tabs)/(calendar)/_layout.tsx`에
 * 적어 두었다 — formSheet 안에서는 그 헤더만 레이아웃 자리를 못 잡아 입력칸이
 * 제목과 닫기 버튼을 덮었다.
 */
function SheetTitle(props: { title: string; onClose: () => void }) {
  const colors = useColors();
  return (
    <Stack.Screen
      options={{
        title: props.title,
        // 내비게이션 바 안에는 SwiftUI 호스트(@expo/ui Button) 대신 평범한
        // 텍스트 버튼을 둔다. 호스트는 자기 크기를 스스로 정해 바 높이에 맞지 않는다.
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            onPress={props.onClose}
            hitSlop={12}
            testID="personal-event-close"
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
  pair: { gap: spacing.md },
  // 저장은 시트 폭을 꽉 채워 가운데에 놓고, 삭제는 그 아래 같은 폭으로 쌓는다.
  // 한 줄에 나란히 두면 저장이 내용 폭만큼만 줄어 왼쪽에 치우친다.
  footer: { width: "100%", gap: spacing.sm },
  privacy: { color: colors.mute, fontSize: 12, lineHeight: 18 },
}));
