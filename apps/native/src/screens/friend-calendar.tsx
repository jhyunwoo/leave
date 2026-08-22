import {
  buildMonthGrid,
  getHoliday,
  isWeekend,
  normalizeFriendIds,
  shiftMonth,
  splitMonth,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { useFriendCalendar, usePersonalEvents } from "@leave/client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
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

function personColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 58% 38%)`;
}

export function FriendCalendarScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ friendIds?: string }>();
  const friendIds = normalizeFriendIds((params.friendIds ?? "").split(","));
  const today = todayInSeoul();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<ISODate>(today);
  const calendar = useFriendCalendar(friendIds, month);
  const events = usePersonalEvents(month);
  const parts = splitMonth(month);
  const selectedLeaves =
    calendar.data?.leaves.filter(
      (leave) =>
        leave.startDate <= selectedDate && selectedDate <= leave.endDate,
    ) ?? [];
  const selectedEvents =
    events.data?.events.filter(
      (event) =>
        event.startDate <= selectedDate && selectedDate <= event.endDate,
    ) ?? [];
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button onPress={() => setMonth(today.slice(0, 7))}>
          오늘
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
      <View style={styles.monthNav}>
        <Button
          title="이전"
          size="sm"
          variant="secondary"
          onPress={() => setMonth((value) => shiftMonth(value, -1))}
        />
        <Text style={styles.heading}>
          {parts.year}년 {parts.monthNum}월
        </Text>
        <Button
          title="다음"
          size="sm"
          variant="secondary"
          onPress={() => setMonth((value) => shiftMonth(value, 1))}
        />
      </View>
      {friendIds.length === 0 ? (
        <ContentPanel style={styles.card}>
          <Text style={styles.body}>친구 탭에서 1명 이상 선택해주세요.</Text>
        </ContentPanel>
      ) : calendar.isPending ? (
        <ActivityIndicator color={colors.ink} />
      ) : calendar.isError || !calendar.data ? (
        <ContentPanel tone="danger" style={styles.card}>
          <Text style={styles.error}>
            친구 달력을 볼 수 없어요. 친구 관계나 차단 상태를 확인해주세요.
          </Text>
        </ContentPanel>
      ) : (
        <>
          <View
            accessibilityLabel={`${parts.year}년 ${parts.monthNum}월 친구 달력`}
          >
            <View style={styles.week}>
              {WEEKDAYS.map((weekday, index) => (
                <Text
                  key={weekday}
                  style={[
                    styles.weekday,
                    (index === 0 || index === 6) && styles.red,
                  ]}
                >
                  {weekday}
                </Text>
              ))}
            </View>
            {buildMonthGrid(month).map((week, index) => (
              <View key={index} style={styles.week}>
                {week.map((cell) => {
                  const leaves = calendar.data.leaves.filter(
                    (leave) =>
                      leave.startDate <= cell.date &&
                      cell.date <= leave.endDate,
                  );
                  const people = [
                    ...new Set(leaves.map((leave) => leave.userId)),
                  ];
                  const personal = events.data?.events.some(
                    (event) =>
                      event.startDate <= cell.date &&
                      cell.date <= event.endDate,
                  );
                  return (
                    <Pressable
                      key={cell.date}
                      disabled={!cell.inMonth}
                      accessibilityRole="button"
                      accessibilityState={{
                        selected: selectedDate === cell.date,
                        disabled: !cell.inMonth,
                      }}
                      accessibilityLabel={
                        cell.inMonth
                          ? `${Number(cell.date.slice(8))}일, 휴가 ${people.length}명${personal ? ", 개인 일정 있음" : ""}`
                          : undefined
                      }
                      onPress={() => setSelectedDate(cell.date)}
                      style={({ pressed }) => [
                        styles.cell,
                        selectedDate === cell.date && styles.selected,
                        pressed && styles.pressed,
                      ]}
                    >
                      <Text
                        style={[
                          styles.day,
                          (isWeekend(cell.date) || getHoliday(cell.date)) &&
                            styles.red,
                          !cell.inMonth && styles.muted,
                        ]}
                      >
                        {Number(cell.date.slice(8))}
                      </Text>
                      <View style={styles.dots}>
                        {people.slice(0, 3).map((userId) => {
                          const person = calendar.data.people.find(
                            (item) => item.userId === userId,
                          );
                          return (
                            <View
                              key={userId}
                              style={[
                                styles.dot,
                                { backgroundColor: personColor(userId) },
                              ]}
                            >
                              <Text style={styles.dotText}>
                                {person?.isViewer
                                  ? "나"
                                  : person?.name.slice(0, 1)}
                              </Text>
                            </View>
                          );
                        })}
                        {people.length > 3 ? (
                          <Text style={styles.more}>+{people.length - 3}</Text>
                        ) : null}
                      </View>
                      {personal ? (
                        <Text style={styles.personal}>◇ 개인</Text>
                      ) : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
          <View style={styles.legend}>
            {calendar.data.people.map((person) => (
              <View key={person.userId} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: personColor(person.userId) },
                  ]}
                />
                <Text style={styles.legendText}>
                  {person.isViewer ? "나" : person.name}
                </Text>
              </View>
            ))}
          </View>
          <ContentPanel style={styles.card}>
            <Text style={styles.heading}>{selectedDate}</Text>
            {selectedLeaves.map((leave) => {
              const person = calendar.data.people.find(
                (item) => item.userId === leave.userId,
              );
              return (
                <View
                  key={leave.leaveId}
                  style={[
                    styles.item,
                    { borderLeftColor: personColor(leave.userId) },
                  ]}
                >
                  <Text style={styles.itemTitle}>
                    {person?.isViewer ? "나" : person?.name}
                  </Text>
                  <Text style={styles.caption}>공유 휴가 · {leave.status}</Text>
                </View>
              );
            })}
            {selectedEvents.map((event) => (
              <Pressable
                key={event.id}
                style={styles.item}
                onPress={() =>
                  router.push({
                    pathname: "/(tabs)/(calendar)/personal-event",
                    params: { eventId: event.id, month },
                  })
                }
              >
                <Text style={styles.itemTitle}>◇ {event.title}</Text>
                <Text style={styles.caption}>나만 보는 개인 일정</Text>
              </Pressable>
            ))}
            {!selectedLeaves.length && !selectedEvents.length ? (
              <Text style={styles.body}>이 날의 일정이 없어요.</Text>
            ) : null}
            <Button
              title="이 날에 개인 일정 추가"
              variant="secondary"
              onPress={() =>
                router.push({
                  pathname: "/(tabs)/(calendar)/personal-event",
                  params: { date: selectedDate, month },
                })
              }
            />
          </ContentPanel>
        </>
      )}
    </ScrollView>
  );
}
const useStyles = makeStyles(({ colors }) => ({
  content: {
    padding: spacing.lg,
    paddingBottom: spacing.xxxl * 2,
    gap: spacing.lg,
    maxWidth: 900,
    width: "100%",
    alignSelf: "center",
  },
  monthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  heading: {
    flex: 1,
    textAlign: "center",
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
  },
  week: { flexDirection: "row", gap: 2 },
  weekday: {
    flex: 1,
    textAlign: "center",
    paddingVertical: spacing.sm,
    color: colors.mute,
    fontSize: 12,
    fontWeight: "700",
  },
  cell: {
    flex: 1,
    minHeight: 72,
    alignItems: "center",
    padding: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    gap: 3,
  },
  selected: { borderColor: colors.brand, backgroundColor: colors.primaryPale },
  pressed: { transform: [{ scale: 0.97 }] },
  day: { fontSize: 14, fontWeight: "700", color: colors.ink },
  red: { color: colors.negative },
  muted: { opacity: 0 },
  dots: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    flexWrap: "wrap",
    justifyContent: "center",
  },
  dot: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  dotText: { color: "white", fontSize: 8, fontWeight: "900" },
  more: { fontSize: 9, color: colors.mute },
  personal: { fontSize: 9, fontWeight: "700", color: colors.brand },
  legend: { flexDirection: "row", gap: spacing.md, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: radius.pill },
  legendText: { fontSize: 13, fontWeight: "700", color: colors.ink },
  card: { padding: spacing.lg, gap: spacing.md },
  body: { color: colors.body },
  error: { color: colors.negativeDeep },
  item: {
    padding: spacing.md,
    borderLeftWidth: 4,
    borderLeftColor: colors.brand,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.sm,
  },
  itemTitle: { color: colors.ink, fontWeight: "700" },
  caption: { color: colors.mute, fontSize: 12 },
}));
