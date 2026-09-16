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
 *
 * ## 칸을 여백이 아니라 선으로 나눈다
 *
 * 부대 달력은 모든 날에 출타율 알약이 들어 있어 여백만으로도 칸이 보인다. 친구
 * 달력은 아무도 나가지 않는 날이 대부분이라 같은 규칙을 쓰면 숫자만 떠 있고
 * 어디까지가 하루인지 읽히지 않는다. 그래서 칸 사이 여백을 걷어내고 hairline
 * 격자를 깐다 — 웹 달력(`.cal-cell`의 구분선)과 같은 말이다.
 *
 * 선은 칸 **안쪽**에 그린다. 네 변 모두 1px 테두리를 두되 위·왼쪽만 투명이라,
 * 고른 날에 테두리 색만 바꿔도 칸 높이가 그대로다 — 테두리 굵기가 바뀌면 고를
 * 때마다 안쪽 내용이 1px씩 밀린다.
 */

import {
  buildMonthGrid,
  CALENDAR_QUERY_FUTURE_MONTHS,
  CALENDAR_QUERY_PAST_MONTHS,
  getHoliday,
  isWeekend,
  personalEventCellLabel,
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
          {week.map((cell, dayIndex) => {
            const people = friendDayPeople(props.leaves, cell.date);
            const outings = people.filter(
              (person) => person.kind === "outing",
            ).length;
            const personal = props.events.filter(
              (event) =>
                event.startDate <= cell.date && cell.date <= event.endDate,
            );
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
                    ? `${Number(cell.date.slice(8))}일, 휴가 ${people.length - outings}명${outings ? `, 외출 ${outings}명` : ""}${personal.length ? `, 개인 일정 ${personal.map((event) => event.title).join(", ")}` : ""}`
                    : undefined
                }
                onPress={() => props.onSelectDate(cell.date)}
                style={({ pressed }) => [
                  styles.cell,
                  { height: props.cellHeight },
                  dayIndex === 6 && styles.lastColumn,
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
                    {personal.length ? (
                      <Text style={styles.personal} numberOfLines={1}>
                        {personalEventCellLabel(personal)}
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
  // 이 줄이 곧 격자의 윗변이다. 아래 칸들이 긋는 선과 같은 색이어야 한 장으로
  // 읽힌다.
  monthHeading: {
    height: LABEL_H,
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  monthLabel: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  monthLoading: { flex: 1, alignItems: "center", justifyContent: "center" },
  monthError: { paddingVertical: spacing.lg, color: colors.body },
  // 격자가 끊기지 않도록 주 사이에도 여백을 두지 않는다. 한 달 블록 높이
  // (monthBlockHeight)는 주마다 ROW_GAP을 포함한 값이라, 6주 달이라도 아래로
  // 12px 남을 뿐 블록을 넘치지 않는다.
  week: { flexDirection: "row" },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
    gap: 3,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "transparent",
    borderRightColor: colors.hairline,
    borderBottomColor: colors.hairline,
  },
  /** 격자의 바깥 오른쪽 끝. 왼쪽 끝에 선이 없으므로 여기도 비운다. */
  lastColumn: { borderRightColor: "transparent" },
  /**
   * 네 변을 모두 적어 준다. RN의 스타일 합치기는 키 단위라, borderColor 하나만
   * 두면 아래 칸의 borderRightColor·borderBottomColor(격자선)가 그대로 남는다.
   */
  selected: {
    borderColor: colors.brand,
    borderRightColor: colors.brand,
    borderBottomColor: colors.brand,
    borderRadius: radius.sm,
    backgroundColor: colors.primaryPale,
  },
  /**
   * 눌린 표시를 축소가 아니라 배경으로 준다. 칸이 줄어들면 그 칸이 맡고 있던
   * 격자선도 함께 안으로 들어가 누르는 동안 격자에 구멍이 뚫린다.
   */
  pressed: { backgroundColor: colors.canvasSoft },
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
