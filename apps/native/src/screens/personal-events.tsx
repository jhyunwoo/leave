import { fmtRange, shiftMonth, splitMonth, todayInSeoul } from "@leave/shared";
import { usePersonalEvents } from "@leave/client";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { makeStyles, radius, spacing, useColors } from "@/theme";

export function PersonalEventsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const [month, setMonth] = useState(todayInSeoul().slice(0, 7));
  const events = usePersonalEvents(month);
  const parts = splitMonth(month);
  const add = () =>
    router.push({
      pathname: "/(tabs)/(calendar)/personal-event",
      params: { date: `${month}-01`, month },
    });
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          variant="prominent"
          tintColor={colors.brand}
          onPress={add}
        >
          추가
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <View style={styles.nav}>
        <Button
          icon="left"
          title="이전"
          size="sm"
          variant="secondary"
          onPress={() => setMonth((value) => shiftMonth(value, -1))}
        />
        <Text style={styles.heading}>
          {parts.year}년 {parts.monthNum}월
        </Text>
        <Button
          icon="right"
          title="다음"
          size="sm"
          variant="secondary"
          onPress={() => setMonth((value) => shiftMonth(value, 1))}
        />
      </View>
      <Text style={styles.caption}>
        개인 일정은 나만 볼 수 있으며 휴가 집계와 잔여량에 영향을 주지 않아요.
      </Text>
      {events.isPending ? (
        <ActivityIndicator color={colors.ink} />
      ) : events.isError ? (
        <ContentPanel tone="danger" style={styles.card}>
          <Text style={styles.error}>개인 일정을 불러오지 못했어요.</Text>
        </ContentPanel>
      ) : events.data?.events.length ? (
        events.data.events.map((event) => (
          <Pressable
            key={event.id}
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/(calendar)/personal-event",
                params: { eventId: event.id, month },
              })
            }
            style={({ pressed }) => [styles.event, pressed && styles.pressed]}
          >
            <Text style={styles.title}>◇ {event.title}</Text>
            <Text style={styles.body}>
              {fmtRange(event.startDate, event.endDate)}
              {event.startTime
                ? ` · ${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
                : ""}
            </Text>
          </Pressable>
        ))
      ) : (
        <ContentPanel style={styles.card}>
          <Text style={styles.title}>이 달의 개인 일정이 없어요</Text>
          <Text style={styles.body}>
            휴가가 아닌 약속과 계획을 별도로 기록할 수 있어요.
          </Text>
          <Button icon="calendarAdd" title="개인 일정 추가" onPress={add} />
        </ContentPanel>
      )}
    </ScrollView>
  );
}
const useStyles = makeStyles(({ colors }) => ({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
    maxWidth: 720,
    width: "100%",
    alignSelf: "center",
  },
  nav: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  heading: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  caption: { color: colors.mute, fontSize: 12, lineHeight: 18 },
  event: {
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    gap: spacing.xs,
  },
  pressed: { transform: [{ scale: 0.98 }] },
  title: { color: colors.ink, fontSize: 16, fontWeight: "700" },
  body: { color: colors.body },
  error: { color: colors.negativeDeep },
  card: { padding: spacing.lg, gap: spacing.md },
}));
