/**
 * 무한 스크롤 달력(네이티브).
 *
 * 사용처: apps/native/src/screens/calendar/index.tsx.
 * 스크롤이 위 끝에 닿으면 이전 달을, 아래 끝에 닿으면 다음 달을 이어 붙인다.
 * 위쪽에 덧붙일 때는 스크롤 위치를 보정해 화면이 튀지 않게 한다.
 *
 * iOS 상태바를 눌러 맨 위로 가는 동작은 목록의 첫 달이 아니라 입대한 달로
 * 데려간다(onScrollToTop). 입대 이전 달도 그대로 위로 스크롤해 볼 수 있다.
 *
 * 칸 높이는 좁은 창에서 고정(92)이고, 넓은 창에서는 보이는 높이에 맞춰 한 달이
 * 화면을 꽉 채우도록 늘린다. 태블릿 세로에서 달 블록을 그대로 두면 화면 아래가
 * 텅 비고 다음 달이 어중간하게 걸치는데, 늘려두면 한 화면 = 한 달이 되고 남는
 * 높이만큼 칸 안에 출타자 미리보기까지 들어간다.
 */

import { monthBounds, todayInSeoul, type ISODate } from "@leave/shared/dates";
import {
  cyclesInRange,
  type RegularOvernightConfig,
  type RegularOvernightCycle,
} from "@leave/shared/regular-overnight";
import { useAtomValue, useSetAtom } from "jotai";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  Text,
  View,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  type NativeGesture,
} from "react-native-gesture-handler";
import type { MyLeaveDay } from "@leave/client";
import { useCalendar, usePersonalEvents } from "@leave/client";
import { useWindowSizeClass } from "@/adaptive";
import { MonthCalendar } from "@/components/month-calendar";
import { CalendarDragContext } from "@/components/calendar-drag/context";
import { useCalendarDrag } from "@/components/calendar-drag/use-calendar-drag";
import {
  BOTTOM_ALLOWANCE,
  CELL_GAP,
  CELL_H_ATTENDEES,
  INITIAL_SPAN,
  LABEL_H,
  monthBlockHeight,
  monthLabel,
  resolveCellHeight,
  ROW_GAP,
  useMonthScrollWindow,
} from "@/components/month-scroll-window";
import {
  calendarDragActiveAtom,
  calendarGridMetricsAtom,
} from "@/state/calendar-drag";
import { makeStyles, spacing, useColors } from "@/theme";

export interface CalendarScrollHandle {
  scrollToToday: () => void;
}

/**
 * iOS 기본 캘린더식 세로 무한 스크롤. 여러 달을 FlatList로 쌓아 자유롭게
 * 스크롤하며, 위·아래 끝에 가까워지면 이전/다음 달을 이어 붙인다.
 * 손을 놓으면 가까운 월 시작점으로 부드럽게 스냅한다.
 */
export const CalendarScroll = forwardRef<
  CalendarScrollHandle,
  {
    unitId: string;
    selectedDate: ISODate | null;
    onSelectDate: (date: ISODate) => void;
    contentTopInset: number;
    myLeaveDays: Map<ISODate, MyLeaveDay>;
    regularOvernight: RegularOvernightConfig | null;
    currentCycle: RegularOvernightCycle | null;
    /** 입대한 달(YYYY-MM). 상태바 탭이 데려갈 목적지. 모르면 null. */
    enlistedMonth: string | null;
    /** 내 전역일. 그날 칸에 배지를 달고, 다음 날부터는 주기 표시를 멈춘다. */
    dischargeAt: ISODate | null;
  }
>(function CalendarScroll(
  {
    unitId,
    selectedDate,
    onSelectDate,
    contentTopInset,
    myLeaveDays,
    regularOvernight,
    currentCycle,
    enlistedMonth,
    dischargeAt,
  },
  ref,
) {
  const styles = useStyles();
  const { sizeClass } = useWindowSizeClass();
  const currentMonth = todayInSeoul().slice(0, 7);
  // 목록이 실제로 차지한 높이. 헤더가 목록 위에 떠 있으므로 거기서
  // contentTopInset과 아래 탭바 몫을 빼야 "한 달이 보일 높이"가 나온다.
  const [listHeight, setListHeight] = useState(0);
  // 목록의 가로 폭. 좌우 여백을 빼면 격자 폭이고, 거기서 칸 간격이 나온다.
  const [listWidth, setListWidth] = useState(0);

  const cellHeight = resolveCellHeight(
    sizeClass,
    listHeight - contentTopInset - BOTTOM_ALLOWANCE,
  );
  const itemHeight = monthBlockHeight(cellHeight);

  // 창·보정·이동은 친구 달력과 같은 상태 기계를 쓴다(month-scroll-window).
  // 부대 달력은 볼 수 있는 범위를 제한하지 않는다 — 입대 이전 달도 계속 위로
  // 훑을 수 있어야 한다.
  const {
    months,
    listRef,
    scrollToMonth,
    resetScrollFlags,
    settleDragOffset,
    onScroll,
    onScrollBeginDrag,
    onScrollEndDrag,
    onMomentumScrollBegin,
    onMomentumScrollEnd,
    onEndReached,
  } = useMonthScrollWindow({ itemHeight, currentMonth });

  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    setListHeight(event.nativeEvent.layout.height);
    setListWidth(event.nativeEvent.layout.width);
  }, []);

  /**
   * 목록 자신의 스크롤 제스처. 휴가 칩의 드래그가 이걸 막아야 끌기가 시작된 뒤에
   * 달력이 따라 움직이지 않는다 — ref를 넘기면 RNGH가 조용히 무시하므로 반드시
   * 제스처 객체여야 하고, 인스턴스가 매 렌더 바뀌면 관계가 다시 맺어지므로 고정한다.
   */
  const scrollGesture = useMemo<NativeGesture>(() => Gesture.Native(), []);
  const drag = useCalendarDrag({
    listRef,
    initialOffset: itemHeight * INITIAL_SPAN,
    viewportHeight: listHeight,
    contentInset: contentTopInset + spacing.xxl,
    onScrollBeginDrag,
    resetScrollFlags,
    settleDragOffset,
  });
  const calendarGesture = useMemo(
    () => Gesture.Simultaneous(scrollGesture, drag.context.gesture),
    [scrollGesture, drag.context.gesture],
  );
  const dragActive = useAtomValue(calendarDragActiveAtom);
  const setGridMetrics = useSetAtom(calendarGridMetricsAtom);

  /**
   * 격자 치수를 드래그 쪽에 넘긴다. 휴가 칩은 이 값만으로 "이만큼 움직였으면 며칠
   * 옮긴 것"을 계산한다(calendar-drag/lattice.ts).
   */
  useEffect(() => {
    const gridWidth = listWidth - 2 * spacing.lg;
    if (gridWidth <= 0) return;
    setGridMetrics({
      itemHeight,
      rowPitch: cellHeight + ROW_GAP,
      colPitch: (gridWidth - 6 * CELL_GAP) / 7 + CELL_GAP,
      labelHeight: LABEL_H,
      months,
    });
  }, [setGridMetrics, itemHeight, cellHeight, listWidth, months]);

  useEffect(() => () => setGridMetrics(null), [setGridMetrics]);

  /**
   * 드래그가 시작되면 스크롤 플래그를 내린다.
   *
   * 관성 스크롤 도중에 scrollEnabled를 끄면 iOS가 onMomentumScrollEnd를 쏘지 않아
   * momentumScrolling이 true로 굳는다. 그 상태로 남으면 드래그가 끝난 뒤 첫
   * onScroll에서 이전 달 이어붙이기가 엉뚱하게 발동한다.
   */
  useEffect(() => {
    if (!dragActive) return;
    resetScrollFlags();
  }, [dragActive, resetScrollFlags]);

  /** iOS 상태바 탭으로 맨 위에 닿았을 때. 입대한 달로 데려간다. */
  const onScrollToTop = useCallback(() => {
    scrollToMonth(enlistedMonth ?? currentMonth);
  }, [scrollToMonth, enlistedMonth, currentMonth]);

  useImperativeHandle(
    ref,
    () => ({ scrollToToday: () => scrollToMonth(currentMonth) }),
    [scrollToMonth, currentMonth],
  );

  return (
    <View style={styles.root} onLayout={onListLayout}>
      <CalendarDragContext.Provider value={drag.context}>
        <GestureDetector gesture={calendarGesture}>
          <FlatList
            ref={listRef}
            data={months}
            keyExtractor={(m) => m}
            renderItem={({ item }) => (
              <MonthBlock
                unitId={unitId}
                month={item}
                height={itemHeight}
                cellHeight={cellHeight}
                showAttendees={cellHeight >= CELL_H_ATTENDEES}
                selectedDate={selectedDate}
                onSelectDate={onSelectDate}
                myLeaveDays={myLeaveDays}
                regularOvernight={regularOvernight}
                currentCycle={currentCycle}
                dischargeAt={dischargeAt}
                dragScrollGesture={scrollGesture}
              />
            )}
            getItemLayout={(_, index) => ({
              length: itemHeight,
              offset: itemHeight * index,
              index,
            })}
            contentOffset={{ x: 0, y: itemHeight * INITIAL_SPAN }}
            contentContainerStyle={{
              paddingTop: contentTopInset,
              paddingHorizontal: spacing.lg,
              paddingBottom: spacing.xxl,
            }}
            contentInsetAdjustmentBehavior="never"
            initialNumToRender={3}
            windowSize={7}
            maxToRenderPerBatch={4}
            // 드래그 중 prepend 보정은 세션이 맡아 이중으로 이동하지 않는다.
            maintainVisibleContentPosition={
              dragActive ? undefined : { minIndexForVisible: 1 }
            }
            onScroll={(event) => {
              drag.trackScroll(event);
              onScroll(event);
            }}
            onScrollBeginDrag={onScrollBeginDrag}
            onScrollEndDrag={onScrollEndDrag}
            onMomentumScrollBegin={onMomentumScrollBegin}
            onScrollToTop={onScrollToTop}
            // onScroll이 하는 일은 "지금 맨 위 근처인가" 하나뿐이고, 그 판정은
            // PREPEND_INTERVAL_MS(250ms)로 한 번 더 걸러진다. 매 프레임(16ms) 콜백을
            // 받을 이유가 없어 30Hz로 낮춘다 — 앱에서 가장 무거운 스크롤 구간의
            // JS 이벤트를 절반으로 줄이면서 판정은 그대로다.
            scrollEventThrottle={32}
            onEndReached={onEndReached}
            onEndReachedThreshold={1.5}
            snapToInterval={itemHeight}
            snapToAlignment="start"
            decelerationRate="fast"
            onMomentumScrollEnd={onMomentumScrollEnd}
            showsVerticalScrollIndicator={false}
            // 첫 손가락은 휴가만 옮긴다. 드래그 중의 목록 이동은 루트 제스처가
            // 둘째 손가락의 이동량으로 scrollToOffset을 호출해 제어한다.
            scrollEnabled={!dragActive}
            style={styles.list}
          />
        </GestureDetector>
      </CalendarDragContext.Provider>
    </View>
  );
});

function MonthBlock(props: {
  unitId: string;
  month: string;
  height: number;
  cellHeight: number;
  showAttendees: boolean;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  myLeaveDays: Map<ISODate, MyLeaveDay>;
  regularOvernight: RegularOvernightConfig | null;
  currentCycle: RegularOvernightCycle | null;
  dischargeAt: ISODate | null;
  dragScrollGesture: NativeGesture;
}) {
  const styles = useStyles();
  const colors = useColors();
  const calendar = useCalendar(props.unitId, props.month);
  const personalEvents = usePersonalEvents(props.month);
  const cycles = useMemo(() => {
    const { start, end } = monthBounds(props.month);
    return cyclesInRange(props.regularOvernight, start, end);
  }, [props.month, props.regularOvernight]);

  return (
    <View style={[styles.monthBlock, { height: props.height }]}>
      <View style={styles.monthHeading}>
        <Text style={styles.monthLabel}>{monthLabel(props.month)}</Text>
      </View>
      {calendar.isPending ? (
        <View style={styles.monthLoading}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : calendar.isError || !calendar.data ? (
        <Text style={styles.monthError}>이 달을 불러오지 못했어요.</Text>
      ) : (
        <MonthCalendar
          calendar={calendar.data}
          selectedDate={props.selectedDate}
          onSelectDate={props.onSelectDate}
          cellHeight={props.cellHeight}
          showAttendees={props.showAttendees}
          hideWeekdays
          myLeaveDays={props.myLeaveDays}
          cycles={cycles}
          currentCycle={props.currentCycle}
          dischargeAt={props.dischargeAt}
          personalEvents={personalEvents.data?.events}
          dragScrollGesture={props.dragScrollGesture}
        />
      )}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1 },
  list: { flex: 1 },
  monthBlock: {},
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
  monthLoading: { paddingVertical: spacing.xxxl, alignItems: "center" },
  monthError: { fontSize: 14, color: colors.body, paddingVertical: spacing.lg },
}));
