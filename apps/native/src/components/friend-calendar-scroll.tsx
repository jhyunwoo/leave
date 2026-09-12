/**
 * 친구 비교 달력의 세로 월 스크롤(네이티브).
 *
 * 사용처: apps/native/src/screens/friend-calendar.tsx.
 * 창을 넓히고 위쪽 이어붙이기를 보정하고 "오늘"로 돌아가는 부분은 부대 달력과
 * 같은 상태 기계를 쓴다(month-scroll-window). 여기서 다른 것은 칸에 무엇을
 * 그리는가 — 사람별 색 이니셜과 개인 일정 — 뿐이다.
 *
 * 부대 달력과 달리 볼 수 있는 달을 공유 달력의 조회 범위(과거 12개월 ~ 미래
 * 24개월)로 제한한다. 그 밖의 달은 서버가 어차피 돌려주지 않는다.
 */

import {
  buildMonthGrid,
  CALENDAR_QUERY_FUTURE_MONTHS,
  CALENDAR_QUERY_PAST_MONTHS,
  getHoliday,
  isWeekend,
  shiftMonth,
  todayInSeoul,
  type ISODate,
} from "@leave/shared";
import {
  friendDayPeople,
  useFriendCalendar,
  usePersonalEvents,
} from "@leave/client";
import {
  forwardRef,
  memo,
  useCallback,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  Pressable,
  Text,
  View,
} from "react-native";
import { useWindowSizeClass } from "@/adaptive";
import {
  BOTTOM_ALLOWANCE,
  INITIAL_SPAN,
  LABEL_H,
  monthBlockHeight,
  monthLabel,
  resolveCellHeight,
  ROW_GAP,
  useMonthScrollWindow,
} from "@/components/month-scroll-window";
import {
  makeStyles,
  radius,
  spacing,
  useAppColorScheme,
  useColors,
  type ColorScheme,
} from "@/theme";

function personHue(userId: string): number {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return hash;
}

export function friendPersonColor(userId: string): string {
  return `hsl(${personHue(userId)} 58% 38%)`;
}

/**
 * 속이 빈 외출 알약에 쓰는 색.
 *
 * `friendPersonColor`는 흰 글자를 얹는 **채움**이라 두 스킴에서 같은 어두운 값이어도
 * 됐다. 테두리와 글자로 쓰는 순간 이야기가 달라진다 — 다크에서 그 값은 칸 배경과
 * 거의 붙어 보이지 않는다. 색조는 그대로 두고 명도만 올려 같은 사람으로 읽히게 한다.
 */
export function friendPersonOutlineColor(
  userId: string,
  scheme: ColorScheme,
): string {
  return scheme === "dark"
    ? `hsl(${personHue(userId)} 62% 70%)`
    : friendPersonColor(userId);
}

export interface FriendCalendarScrollHandle {
  scrollToToday: () => void;
}

const FriendCalendarScrollImpl = forwardRef<
  FriendCalendarScrollHandle,
  {
    friendIds: readonly string[];
    selectedDate: ISODate | null;
    onSelectDate: (date: ISODate) => void;
    contentTopInset: number;
  }
>(function FriendCalendarScroll(props, ref) {
  const styles = useStyles();
  const { sizeClass } = useWindowSizeClass();
  const currentMonth = todayInSeoul().slice(0, 7);
  const [listHeight, setListHeight] = useState(0);

  const cellHeight = resolveCellHeight(
    sizeClass,
    listHeight - props.contentTopInset - BOTTOM_ALLOWANCE,
  );
  const itemHeight = monthBlockHeight(cellHeight);

  const {
    months,
    listRef,
    scrollToMonth,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    onEndReached,
  } = useMonthScrollWindow({
    itemHeight,
    currentMonth,
    earliestMonth: shiftMonth(currentMonth, -CALENDAR_QUERY_PAST_MONTHS),
    latestMonth: shiftMonth(currentMonth, CALENDAR_QUERY_FUTURE_MONTHS),
  });

  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    setListHeight(event.nativeEvent.layout.height);
  }, []);

  useImperativeHandle(
    ref,
    () => ({ scrollToToday: () => scrollToMonth(currentMonth) }),
    [currentMonth, scrollToMonth],
  );

  return (
    <View style={styles.root} onLayout={onListLayout}>
      <FlatList
        ref={listRef}
        data={months}
        keyExtractor={(month) => month}
        renderItem={({ item }) => (
          <FriendMonthBlock
            friendIds={props.friendIds}
            month={item}
            height={itemHeight}
            cellHeight={cellHeight}
            selectedDate={props.selectedDate}
            onSelectDate={props.onSelectDate}
          />
        )}
        getItemLayout={(_, index) => ({
          length: itemHeight,
          offset: itemHeight * index,
          index,
        })}
        contentOffset={{ x: 0, y: itemHeight * INITIAL_SPAN }}
        contentContainerStyle={{
          paddingTop: props.contentTopInset,
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing.xxl,
        }}
        contentInsetAdjustmentBehavior="never"
        initialNumToRender={3}
        windowSize={7}
        maxToRenderPerBatch={4}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onMomentumScrollEnd={onMomentumScrollEnd}
        onScrollToTop={() => scrollToMonth(currentMonth)}
        onEndReached={onEndReached}
        onEndReachedThreshold={1.5}
        scrollEventThrottle={32}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </View>
  );
});

export const FriendCalendarScroll = memo(FriendCalendarScrollImpl);

const FriendMonthBlock = memo(function FriendMonthBlock(props: {
  friendIds: readonly string[];
  month: string;
  height: number;
  cellHeight: number;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const calendar = useFriendCalendar(props.friendIds, props.month);
  const personalEvents = usePersonalEvents(props.month);

  return (
    <View style={{ height: props.height }}>
      <View style={styles.monthHeading}>
        <Text style={styles.monthLabel}>{monthLabel(props.month)}</Text>
      </View>
      {calendar.isPending ? (
        <View style={styles.monthLoading}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : calendar.isError || !calendar.data ? (
        <Text style={styles.monthError}>
          이 달을 불러오지 못했어요. 친구 관계를 확인해주세요.
        </Text>
      ) : (
        <FriendMonthGrid
          month={props.month}
          cellHeight={props.cellHeight}
          people={calendar.data.people}
          leaves={calendar.data.leaves}
          events={personalEvents.data?.events ?? []}
          selectedDate={
            props.selectedDate?.slice(0, 7) === props.month
              ? props.selectedDate
              : null
          }
          onSelectDate={props.onSelectDate}
        />
      )}
    </View>
  );
});

const FriendMonthGrid = memo(function FriendMonthGrid(props: {
  month: string;
  cellHeight: number;
  people: NonNullable<ReturnType<typeof useFriendCalendar>["data"]>["people"];
  leaves: NonNullable<ReturnType<typeof useFriendCalendar>["data"]>["leaves"];
  events: NonNullable<ReturnType<typeof usePersonalEvents>["data"]>["events"];
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const scheme = useAppColorScheme();
  const weeks = useMemo(() => buildMonthGrid(props.month), [props.month]);
  const personById = useMemo(
    () => new Map(props.people.map((person) => [person.userId, person])),
    [props.people],
  );

  return (
    <View accessibilityLabel={`${props.month} 친구 달력`}>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={styles.week}>
          {week.map((cell) => {
            const people = friendDayPeople(props.leaves, cell.date);
            const outings = people.filter(
              (person) => person.kind === "outing",
            ).length;
            const personalCount = props.events.filter(
              (event) =>
                event.startDate <= cell.date && cell.date <= event.endDate,
            ).length;
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            return (
              <Pressable
                key={cell.date}
                disabled={!cell.inMonth}
                accessibilityRole="button"
                accessibilityState={{
                  selected: props.selectedDate === cell.date,
                  disabled: !cell.inMonth,
                }}
                accessibilityLabel={
                  cell.inMonth
                    ? `${Number(cell.date.slice(8))}일, 휴가 ${people.length - outings}명${outings ? `, 외출 ${outings}명` : ""}${personalCount ? `, 개인 일정 ${personalCount}개` : ""}`
                    : undefined
                }
                onPress={() => props.onSelectDate(cell.date)}
                style={({ pressed }) => [
                  styles.cell,
                  { height: props.cellHeight },
                  props.selectedDate === cell.date && styles.selected,
                  pressed && styles.pressed,
                ]}
              >
                {cell.inMonth ? (
                  <>
                    <Text
                      style={[
                        styles.day,
                        (isWeekend(cell.date) || holiday) && {
                          color: colors.negative,
                        },
                      ]}
                    >
                      {Number(cell.date.slice(8))}
                    </Text>
                    {holiday ? (
                      <Text style={styles.holiday} numberOfLines={1}>
                        {holiday}
                      </Text>
                    ) : null}
                    <View style={styles.people}>
                      {people.slice(0, 3).map(({ userId, kind }) => {
                        const person = personById.get(userId);
                        const outing = kind === "outing";
                        const color = outing
                          ? friendPersonOutlineColor(userId, scheme)
                          : friendPersonColor(userId);
                        return (
                          <View
                            key={userId}
                            style={[
                              styles.person,
                              outing
                                ? { borderColor: color }
                                : { backgroundColor: color },
                              outing && styles.outingPerson,
                            ]}
                          >
                            <Text
                              style={[styles.personText, outing && { color }]}
                            >
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
                    {personalCount ? (
                      <Text style={styles.personal} numberOfLines={1}>
                        ◇ 개인{personalCount > 1 ? ` ${personalCount}` : ""}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
});

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1 },
  list: { flex: 1 },
  monthHeading: {
    height: LABEL_H,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.canvasSoft,
  },
  monthLabel: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  monthLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  monthError: { paddingVertical: spacing.lg, color: colors.body },
  week: { flexDirection: "row", gap: 2, marginBottom: ROW_GAP },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
    gap: 3,
    overflow: "hidden",
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
  },
  selected: {
    borderColor: colors.brand,
    backgroundColor: colors.primaryPale,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  day: { fontSize: 14, fontWeight: "700", color: colors.ink },
  holiday: {
    maxWidth: "100%",
    paddingHorizontal: 2,
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    color: colors.negative,
  },
  people: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    flexWrap: "wrap",
    gap: 2,
  },
  person: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 3,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  /** 외출은 당일 복귀라 채우지 않는다 — 채운 알약(휴가)과 한눈에 갈려야 한다. */
  outingPerson: { borderWidth: 1.5, backgroundColor: "transparent" },
  personText: { color: "white", fontSize: 8, fontWeight: "900" },
  more: { fontSize: 9, color: colors.mute },
  personal: {
    maxWidth: "100%",
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.pill,
    fontSize: 9,
    lineHeight: 13,
    fontWeight: "700",
    color: colors.brand,
  },
}));
