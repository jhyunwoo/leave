import {
  normalizeFriendIds,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import { useFriendCalendar, usePersonalEvents } from "@leave/client";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SplitPane, useWindowSizeClass } from "@/adaptive";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import {
  FriendCalendarScroll,
  friendPersonColor,
  type FriendCalendarScrollHandle,
} from "@/components/friend-calendar-scroll";
import { LiquidGlassSurface } from "@/components/liquid-glass-surface";
import { NativeBottomSheet } from "@/components/native-bottom-sheet";
import {
  SHEET_EXTENDS_UNDER_BOTTOM_INSET,
  SHEET_GRABBER_INSET,
  SheetScaffold,
} from "@/components/sheet-scaffold";
import { makeStyles, radius, spacing, useColors } from "@/theme";
import { FriendDayPanel } from "./day-panel";

const LEGEND_HEIGHT = 42;
const WEEK_ROW_HEIGHT = 32;
const STRIP_TOP_GAP = spacing.xs;
const NATIVE_HEADER_HEIGHT = 44;

type PendingPersonalNavigation =
  | { kind: "new"; date: ISODate }
  | { kind: "edit"; eventId: string; month: string };

export function FriendCalendarScreen() {
  const styles = useStyles();
  const colors = useColors();
  const router = useRouter();
  const params = useLocalSearchParams<{ friendIds?: string }>();
  const friendIds = useMemo(
    () => normalizeFriendIds((params.friendIds ?? "").split(",")),
    [params.friendIds],
  );
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState<ISODate | null>(null);
  const { sizeClass, isCompact, height: windowHeight } = useWindowSizeClass();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<FriendCalendarScrollHandle>(null);
  const pendingAfterSheet = useRef<PendingPersonalNavigation | null>(null);
  const panelMonth = selectedDate?.slice(0, 7) ?? today.slice(0, 7);
  const calendar = useFriendCalendar(friendIds, panelMonth);
  const events = usePersonalEvents(panelMonth);
  const stripHeight = STRIP_TOP_GAP + LEGEND_HEIGHT + WEEK_ROW_HEIGHT;
  // Android는 스택이 헤더 공간을 확보하므로 수동 여백을 중복 적용하지 않는다.
  const headerTopInset =
    process.env.EXPO_OS === "android" ? 0 : insets.top + NATIVE_HEADER_HEIGHT;
  const contentTopInset = headerTopInset + stripHeight;

  const selectDate = (date: ISODate) => {
    pendingAfterSheet.current = null;
    setSelectedDate((current) => (current === date ? null : date));
  };

  const pushPersonalNavigation = (navigation: PendingPersonalNavigation) => {
    if (isCompact && selectedDate) {
      pendingAfterSheet.current = navigation;
      setSelectedDate(null);
      return;
    }
    if (navigation.kind === "edit") {
      router.push({
        pathname: "/(tabs)/(calendar)/personal-event",
        params: { eventId: navigation.eventId, month: navigation.month },
      });
      return;
    }
    router.push({
      pathname: "/(tabs)/(calendar)/personal-event",
      params: { date: navigation.date, month: navigation.date.slice(0, 7) },
    });
  };

  const calendarPane = (
    <View style={styles.calendarPane}>
      {friendIds.length === 0 ? (
        <View style={styles.center}>
          <ContentPanel style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>비교할 친구를 선택해주세요</Text>
            <Text style={styles.body}>친구 탭에서 1명 이상 선택해주세요.</Text>
          </ContentPanel>
        </View>
      ) : calendar.isError && !calendar.data ? (
        <View style={styles.center}>
          <ContentPanel tone="danger" style={styles.emptyCard}>
            <Text style={styles.error}>
              친구 달력을 볼 수 없어요. 친구 관계나 차단 상태를 확인해주세요.
            </Text>
          </ContentPanel>
        </View>
      ) : (
        <>
          <FriendCalendarScroll
            ref={scrollRef}
            friendIds={friendIds}
            selectedDate={selectedDate}
            contentTopInset={contentTopInset}
            onSelectDate={selectDate}
          />
          <LiquidGlassSurface
            style={[
              styles.glassStrip,
              {
                top: headerTopInset,
                height: stripHeight,
              },
            ]}
          >
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.legendScroll}
              contentContainerStyle={styles.legend}
              accessibilityLabel="사람 구분"
            >
              {(calendar.data?.people ?? []).map((person) => (
                <View key={person.userId} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: friendPersonColor(person.userId) },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    {person.isViewer ? "나" : person.name}
                  </Text>
                </View>
              ))}
              <View style={styles.legendItem}>
                <View style={styles.outingLegend} />
                <Text style={styles.legendText}>외출</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={styles.personalLegend} />
                <Text style={styles.legendText}>개인 일정</Text>
              </View>
            </ScrollView>
            <View style={styles.weekRow}>
              {WEEKDAYS.map((weekday, index) => (
                <Text
                  key={weekday}
                  style={[
                    styles.weekday,
                    (index === 0 || index === 6) && {
                      color: colors.negative,
                    },
                  ]}
                >
                  {weekday}
                </Text>
              ))}
            </View>
          </LiquidGlassSurface>
        </>
      )}
    </View>
  );

  const dayPanel = (style?: StyleProp<ViewStyle>) =>
    selectedDate ? (
      <FriendDayPanel
        date={selectedDate}
        calendar={calendar.data}
        events={events.data?.events ?? []}
        style={style}
        onAdd={() =>
          pushPersonalNavigation({ kind: "new", date: selectedDate })
        }
        onEdit={(event) =>
          pushPersonalNavigation({
            kind: "edit",
            eventId: event.id,
            month: selectedDate.slice(0, 7),
          })
        }
      />
    ) : null;

  const inspectorPane = (
    <View style={styles.inspectorPane} testID="friend-calendar-day-inspector">
      <ScrollView
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.inspectorContent,
          {
            paddingTop: headerTopInset + spacing.sm,
            paddingBottom: insets.bottom + spacing.xxxl * 2,
          },
        ]}
      >
        <View style={styles.inspectorHeader}>
          <Text style={styles.inspectorTitle}>날짜 상세</Text>
          <Button
            title="선택 해제"
            variant="ghost"
            size="sm"
            onPress={() => setSelectedDate(null)}
            testID="friend-calendar-clear-selection"
          />
        </View>
        {calendar.isPending ? (
          <ActivityIndicator color={colors.ink} />
        ) : (
          dayPanel(styles.panelInInspector)
        )}
      </ScrollView>
    </View>
  );

  const daySheetPresented = isCompact && selectedDate != null;
  const daySheetHeight = Math.round(windowHeight * 0.75);

  return (
    <>
      <SplitPane
        sizeClass={sizeClass}
        primary={calendarPane}
        inspector={inspectorPane}
        collapsed={!selectedDate}
        gap={0}
        style={styles.root}
      />

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          disabled={friendIds.length === 0}
          onPress={() => scrollRef.current?.scrollToToday()}
        >
          오늘
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      <NativeBottomSheet
        isPresented={daySheetPresented}
        snapPoints={[{ height: daySheetHeight }]}
        testID="friend-calendar-day-sheet"
        onDismiss={() => {
          pendingAfterSheet.current = null;
          if (isCompact) setSelectedDate(null);
        }}
        onClosed={() => {
          const navigation = pendingAfterSheet.current;
          if (!navigation) return;
          pendingAfterSheet.current = null;
          if (navigation.kind === "edit") {
            router.push({
              pathname: "/(tabs)/(calendar)/personal-event",
              params: {
                eventId: navigation.eventId,
                month: navigation.month,
              },
            });
            return;
          }
          router.push({
            pathname: "/(tabs)/(calendar)/personal-event",
            params: {
              date: navigation.date,
              month: navigation.date.slice(0, 7),
            },
          });
        }}
      >
        <SheetScaffold
          title="날짜 상세"
          onClose={() => setSelectedDate(null)}
          contentContainerStyle={styles.sheetContent}
          headerTopInset={SHEET_GRABBER_INSET}
          extendsUnderBottomInset={SHEET_EXTENDS_UNDER_BOTTOM_INSET}
        >
          {calendar.isPending ? (
            <View style={styles.sheetLoading}>
              <ActivityIndicator color={colors.ink} />
            </View>
          ) : (
            dayPanel()
          )}
        </SheetScaffold>
      </NativeBottomSheet>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvas },
  calendarPane: { flex: 1, backgroundColor: colors.canvas },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
  },
  emptyCard: {
    width: "100%",
    maxWidth: 420,
    padding: spacing.xxl,
    gap: spacing.md,
  },
  emptyTitle: { fontSize: 22, fontWeight: "800", color: colors.ink },
  body: { color: colors.body },
  error: { color: colors.negativeDeep },
  glassStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    zIndex: 10,
    paddingTop: STRIP_TOP_GAP,
    borderRadius: 0,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  legendScroll: { height: LEGEND_HEIGHT },
  legend: {
    minWidth: "100%",
    height: LEGEND_HEIGHT,
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  legendDot: { width: 12, height: 12, borderRadius: radius.pill },
  /** 칸의 외출 알약과 같은 모양 — 속이 빈 것이 외출이라는 말을 여기서 한다. */
  outingLegend: {
    width: 12,
    height: 12,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.body,
  },
  legendText: { fontSize: 12, fontWeight: "700", color: colors.ink },
  personalLegend: {
    width: 11,
    height: 11,
    borderWidth: 2,
    borderColor: colors.brand,
    transform: [{ rotate: "45deg" }],
  },
  weekRow: {
    height: WEEK_ROW_HEIGHT,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 11,
    fontWeight: "600",
    color: colors.mute,
  },
  inspectorPane: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: colors.hairline,
  },
  inspectorContent: { paddingHorizontal: spacing.lg, gap: spacing.lg },
  inspectorHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  inspectorTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
  /** 여백은 패널이 들고 있다(day-panel.tsx) — 시트는 자리만 내준다. */
  sheetContent: { padding: 0, gap: 0 },
  sheetLoading: { padding: spacing.xxxl, alignItems: "center" },
  /** 인스펙터는 이미 양옆 여백과 머리글을 갖고 있어 패널의 여백을 덜어 낸다. */
  panelInInspector: { paddingHorizontal: 0, paddingTop: 0 },
}));
