import { personalEventCreateSchema, todayInSeoul } from "@leave/shared";
import {
  useCreatePersonalEvent,
  useDeletePersonalEvent,
  usePersonalEvents,
  useUpdatePersonalEvent,
  type PersonalEvent,
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
import { DateRangePicker } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
import { TimePickerRow } from "@/components/time-picker";
import { confirmAction } from "@/lib/dialog";
import { layout, makeStyles, spacing, useColors } from "@/theme";

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
        <FormBody>
          <Text style={{ color: colors.body }}>일정을 찾을 수 없어요.</Text>
        </FormBody>
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
  const colors = useColors();
  const [title, setTitle] = useState(props.existing?.title ?? "");
  const [startDate, setStartDate] = useState(
    props.existing?.startDate ?? props.initialDate,
  );
  const [endDate, setEndDate] = useState(
    props.existing?.endDate ?? props.initialDate,
  );
  const [startTime, setStartTime] = useState(props.existing?.startTime ?? "");
  const [endTime, setEndTime] = useState(props.existing?.endTime ?? "");
  // 이미 시각이 붙어 있던 일정은 열자마자 그 값이 보여야 한다.
  const [timed, setTimed] = useState(
    Boolean(props.existing?.startTime || props.existing?.endTime),
  );
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
      // 스위치를 끈 채 저장하면 화면에 없는 시각이 따라가지 않는다.
      startTime: timed ? startTime || null : null,
      endTime: timed ? endTime || null : null,
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
      <FormBody>
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
        {/* 날짜를 손으로 적던 자리. 달력을 쓰면 공휴일이 보이고 기간이 며칠인지도
            배지로 바로 읽힌다 — 웹 개인 일정 모달과 같은 부품이다. */}
        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
          label="일정 기간"
          startInstruction="일정이 시작하는 날을 선택해주세요."
          endInstruction="일정의 마지막 날을 선택해주세요."
          testID="personal-event-range"
        />
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchLabel}>시간 지정</Text>
            <Text style={styles.switchHint}>
              끄면 날짜만 있는 하루 종일 일정으로 저장돼요
            </Text>
          </View>
          <Switch
            value={timed}
            onValueChange={(next) => {
              setTimed(next);
              if (!next) {
                setStartTime("");
                setEndTime("");
              }
            }}
            trackColor={{ true: colors.primary, false: colors.hairline }}
            testID="personal-event-timed"
          />
        </View>
        {timed ? (
          <>
            <TimePickerRow
              label="시작 시간"
              value={startTime}
              onChange={setStartTime}
              optional
              defaultTime="09:00"
              testID="personal-event-start-time"
            />
            <TimePickerRow
              label="종료 시간"
              value={endTime}
              onChange={setEndTime}
              optional
              // 시작을 이미 골랐으면 거기서 시작한다 — 굴릴 거리가 짧다.
              defaultTime={startTime || "18:00"}
              testID="personal-event-end-time"
            />
          </>
        ) : null}
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

        {/*
          동작 버튼은 고정 푸터가 아니라 본문 끝에 둔다. formSheet 화면 안에서는
          `flex: 1`로 높이를 나눠 갖는 구조가 성립하지 않아(스크롤 뷰가 찌그러진다),
          이 저장소의 다른 시트 화면들처럼 스크롤 하나만 화면 루트로 둔다.
          키보드가 올라와도 본문이 함께 밀려 저장 버튼에 닿을 수 있다.
        */}
        <View style={styles.actions}>
          {props.existing ? (
            <Button
              icon="trash"
              title="삭제"
              variant="danger"
              disabled={pending}
              onPress={() => void remove()}
              flexible
              style={styles.actionItem}
            />
          ) : null}
          <Button
            icon="save"
            title="저장"
            loading={pending}
            onPress={() => void save()}
            testID="personal-event-save"
            flexible
            style={styles.actionItem}
          />
        </View>
      </FormBody>
    </>
  );
}

/**
 * 시트 본문 — 스크롤 하나가 곧 화면 루트다.
 *
 * `contentInsetAdjustmentBehavior="automatic"`이라야 시스템 바 아래에서 콘텐츠가
 * 시작한다. `units`·`unit-manage` 시트도 같은 구조다.
 */
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
        headerRight: () => (
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
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    maxWidth: layout.formContent,
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  switchRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  switchLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  switchHint: { fontSize: 12, color: colors.mute },
  // 삭제·저장을 한 줄에 나란히 둔다. `flexible`이 있어야 iOS/Android 구현이
  // 라벨 폭만큼 minWidth를 깔지 않아 둘이 칸을 반씩 나눠 갖는다.
  actions: {
    width: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionItem: { flexGrow: 1, flexBasis: 130, minWidth: 130 },
  privacy: { color: colors.mute, fontSize: 12, lineHeight: 18 },
}));
