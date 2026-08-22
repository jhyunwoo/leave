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

import {
  monthBounds,
  shiftMonth,
  splitMonth,
  todayInSeoul,
  type ISODate,
  type RegularOvernightConfig,
  type RegularOvernightCycle,
} from "@leave/shared";
import { cyclesInRange } from "@leave/shared";
import * as Haptics from "expo-haptics";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  View,
} from "react-native";
import type { MyLeaveDay } from "@leave/client";
import { useCalendar, usePersonalEvents } from "@leave/client";
import { useWindowSizeClass, type WindowSizeClass } from "@/adaptive";
import { MonthCalendar } from "@/components/month-calendar";
import { makeStyles, spacing, useColors } from "@/theme";

const INITIAL_SPAN = 2;
const PAGE_SIZE = 6;
/** 이전 달을 이어 붙이는 최소 간격(ms). 아래 onScroll 주석 참고. */
const PREPEND_INTERVAL_MS = 250;
/** 좁은 창의 칸 높이 — month-calendar가 좁은 창에서 쓰는 최대 구성과 같다. */
const CELL_H_MIN = 92;
/** 넓은 창에서도 이보다 커지면 칸이 비어 보인다. 정보량이 늘지 않는 여백일 뿐. */
const CELL_H_MAX = 132;
/** 이 높이부터 칸 안에 출타자 이니셜 한 줄(16+gap 3)이 들어간다. */
const CELL_H_ATTENDEES = 112;
const ROW_GAP = 2; // weekRow marginBottom
const ROWS = 6; // 그리드 최대 주 수
const LABEL_H = 44;
/**
 * 목록 아래쪽에서 탭바·홈 인디케이터에 가려지는 만큼. 넉넉히 잡아 한 달이 잘리지
 * 않게 한다 — 덜 잡으면 마지막 주가 탭바에 물리고, 더 잡아 봐야 칸이 조금 작아질
 * 뿐이라 손해가 비대칭이다.
 */
const BOTTOM_ALLOWANCE = 84;

/** 한 달 블록 높이. getItemLayout·snapToInterval이 이 값에 의존한다. */
function monthBlockHeight(cellHeight: number): number {
  return LABEL_H + ROWS * (cellHeight + ROW_GAP);
}

/**
 * 보이는 높이에 맞춘 칸 높이. 좁은 창에서는 지금 값을 그대로 유지한다 —
 * 휴대폰 달력은 이미 한 화면에 한 달이 들어오고, 여기서 흔들 이유가 없다.
 */
function resolveCellHeight(
  sizeClass: WindowSizeClass,
  visibleHeight: number,
): number {
  if (sizeClass === "compact" || visibleHeight <= 0) return CELL_H_MIN;
  const forGrid = visibleHeight - LABEL_H;
  const fitted = Math.floor(forGrid / ROWS) - ROW_GAP;
  return Math.max(CELL_H_MIN, Math.min(CELL_H_MAX, fitted));
}

function monthRange(center: string, span: number): string[] {
  const out: string[] = [];
  for (let i = -span; i <= span; i++) out.push(shiftMonth(center, i));
  return out;
}

function monthLabel(month: string): string {
  const { year, monthNum } = splitMonth(month);
  return `${year}년 ${monthNum}월`;
}

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
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );
  // 목록이 실제로 차지한 높이. 헤더가 목록 위에 떠 있으므로 거기서
  // contentTopInset과 아래 탭바 몫을 빼야 "한 달이 보일 높이"가 나온다.
  const [listHeight, setListHeight] = useState(0);
  const listRef = useRef<FlatList<string>>(null);
  const prependLock = useRef(false);
  const lastPrependAt = useRef(0);
  const dragging = useRef(false);
  const momentumScrolling = useRef(false);
  // 목록을 다시 짠 뒤에 옮겨갈 달. 아래 scrollToMonth 참고.
  const pendingMonth = useRef<string | null>(null);
  const settledMonth = useRef(currentMonth);

  const cellHeight = resolveCellHeight(
    sizeClass,
    listHeight - contentTopInset - BOTTOM_ALLOWANCE,
  );
  const itemHeight = monthBlockHeight(cellHeight);
  // 첫 렌더의 contentOffset이 이 값으로 계산되므로, 이후 값이 바뀌면 아래
  // useEffect가 보고 있던 달로 다시 맞춘다.
  const initialItemHeight = useRef(itemHeight);

  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    setListHeight(event.nativeEvent.layout.height);
  }, []);

  // prepend 후 락 해제 (렌더 커밋 이후). 다시 짠 목록이면 목적지로 옮긴다.
  useEffect(() => {
    prependLock.current = false;
    const target = pendingMonth.current;
    if (target == null) return;
    const idx = months.indexOf(target);
    if (idx < 0) return;
    pendingMonth.current = null;
    // 셀 마운트가 끝난 다음 프레임에 옮겨야 새 콘텐츠 높이가 반영된 뒤 자리 잡는다.
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: itemHeight * idx,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [months, itemHeight]);

  /**
   * 칸 높이가 바뀌면(회전·Split View 크기 조절·첫 측정) 스크롤 위치를 보고 있던
   * 달에 다시 맞춘다. 오프셋은 픽셀이라, 블록 높이만 바뀌면 같은 오프셋이 엉뚱한
   * 달을 가리킨다.
   */
  useEffect(() => {
    if (initialItemHeight.current === itemHeight) return;
    initialItemHeight.current = itemHeight;
    const idx = months.indexOf(settledMonth.current);
    if (idx < 0) return;
    const frame = requestAnimationFrame(() => {
      listRef.current?.scrollToOffset({
        offset: itemHeight * idx,
        animated: false,
      });
    });
    return () => cancelAnimationFrame(frame);
    // months는 의도적으로 제외한다 — 목록이 늘어난 것만으로 스크롤을 옮기면
    // 위쪽 이어붙이기가 매번 화면을 튀게 한다(그 보정은 위 useEffect의 몫).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemHeight]);

  /**
   * 원하는 달로 이동한다. 목록에 없는 달이면 그 달을 가운데 둔 목록으로 다시 짜고
   * 커밋 후에 옮긴다(위 useEffect).
   */
  const scrollToMonth = useCallback(
    (month: string) => {
      const idx = months.indexOf(month);
      if (idx >= 0) {
        settledMonth.current = month;
        listRef.current?.scrollToOffset({
          offset: itemHeight * idx,
          animated: true,
        });
        return;
      }
      pendingMonth.current = month;
      settledMonth.current = month;
      setMonths(monthRange(month, INITIAL_SPAN));
    },
    [months, itemHeight],
  );

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      // 손으로 끌어 올릴 때만 이어 붙인다. 상태바 탭처럼 프로그램이 맨 위까지
      // 끌고 가는 스크롤에서도 붙이면, 애니메이션 한 번에 수십 년치가 쌓여
      // 1984년 같은 엉뚱한 달에 도착하고 달마다 달력 요청이 나간다.
      // 시간 간격은 관성 스크롤 중 끌기 표시가 남아 있을 때를 대비한 안전장치.
      const now = Date.now();
      if (
        y < itemHeight &&
        (dragging.current || momentumScrolling.current) &&
        !prependLock.current &&
        now - lastPrependAt.current > PREPEND_INTERVAL_MS
      ) {
        prependLock.current = true;
        lastPrependAt.current = now;
        setMonths((ms) => {
          const first = ms[0]!;
          const older: string[] = [];
          for (let i = PAGE_SIZE; i >= 1; i--)
            older.push(shiftMonth(first, -i));
          return [...older, ...ms];
        });
      }
    },
    [itemHeight],
  );

  const onScrollBeginDrag = useCallback(() => {
    dragging.current = true;
  }, []);

  const onScrollEndDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  const onMomentumScrollBegin = useCallback(() => {
    momentumScrolling.current = true;
  }, []);

  /** iOS 상태바 탭으로 맨 위에 닿았을 때. 입대한 달로 데려간다. */
  const onScrollToTop = useCallback(() => {
    scrollToMonth(enlistedMonth ?? currentMonth);
  }, [scrollToMonth, enlistedMonth, currentMonth]);

  const onEndReached = useCallback(() => {
    setMonths((ms) => {
      const last = ms[ms.length - 1]!;
      const newer: string[] = [];
      for (let i = 1; i <= PAGE_SIZE; i++) newer.push(shiftMonth(last, i));
      return [...ms, ...newer];
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({ scrollToToday: () => scrollToMonth(currentMonth) }),
    [scrollToMonth, currentMonth],
  );

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      dragging.current = false;
      momentumScrolling.current = false;
      const index = Math.max(
        0,
        Math.min(
          months.length - 1,
          Math.round(event.nativeEvent.contentOffset.y / itemHeight),
        ),
      );
      const month = months[index];
      if (!month || month === settledMonth.current) return;
      settledMonth.current = month;
      if (process.env.EXPO_OS === "ios") {
        void Haptics.selectionAsync();
      }
    },
    [months, itemHeight],
  );

  return (
    <View style={styles.root} onLayout={onListLayout}>
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
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onScroll={onScroll}
        onScrollBeginDrag={onScrollBeginDrag}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollBegin={onMomentumScrollBegin}
        onScrollToTop={onScrollToTop}
        scrollEventThrottle={16}
        onEndReached={onEndReached}
        onEndReachedThreshold={1.5}
        snapToInterval={itemHeight}
        snapToAlignment="start"
        decelerationRate="fast"
        onMomentumScrollEnd={onMomentumScrollEnd}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
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
