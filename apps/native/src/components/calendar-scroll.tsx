/**
 * 무한 스크롤 달력(네이티브).
 *
 * 사용처: apps/native/src/screens/calendar/index.tsx.
 * 스크롤이 위 끝에 닿으면 이전 달을, 아래 끝에 닿으면 다음 달을 이어 붙인다.
 * 위쪽에 덧붙일 때는 스크롤 위치를 보정해 화면이 튀지 않게 한다.
 *
 * iOS 상태바를 눌러 맨 위로 가는 동작은 목록의 첫 달이 아니라 입대한 달로
 * 데려간다(onScrollToTop). 입대 이전 달도 그대로 위로 스크롤해 볼 수 있다.
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
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Text,
  View,
} from "react-native";
import { useCalendar } from "@leave/client";
import { MonthCalendar } from "@/components/month-calendar";
import type { MyLeaveDay } from "@leave/client";
import { makeStyles, spacing, useColors } from "@/theme";

const INITIAL_SPAN = 2;
const PAGE_SIZE = 6;
/** 이전 달을 이어 붙이는 최소 간격(ms). 아래 onScroll 주석 참고. */
const PREPEND_INTERVAL_MS = 250;
const CELL_H = 92; // month-calendar 셀 minHeight와 동일
const ROW_GAP = 2; // weekRow marginBottom
const ROWS = 6; // 그리드 최대 주 수
const LABEL_H = 64;

/** 한 달 블록의 고정 높이. getItemLayout·snapToInterval이 이 값에 의존한다. */
const ITEM_H = LABEL_H + ROWS * (CELL_H + ROW_GAP);

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
    limitSummary: string;
    myLeaveDays: Map<ISODate, MyLeaveDay>;
    regularOvernight: RegularOvernightConfig | null;
    currentCycle: RegularOvernightCycle | null;
    /** 입대한 달(YYYY-MM). 상태바 탭이 데려갈 목적지. 모르면 null. */
    enlistedMonth: string | null;
  }
>(function CalendarScroll(
  {
    unitId,
    selectedDate,
    onSelectDate,
    contentTopInset,
    limitSummary,
    myLeaveDays,
    regularOvernight,
    currentCycle,
    enlistedMonth,
  },
  ref,
) {
  const styles = useStyles();
  const currentMonth = todayInSeoul().slice(0, 7);
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );
  const listRef = useRef<FlatList<string>>(null);
  const prependLock = useRef(false);
  const lastPrependAt = useRef(0);
  const dragging = useRef(false);
  const momentumScrolling = useRef(false);
  // 목록을 다시 짠 뒤에 옮겨갈 달. 아래 scrollToMonth 참고.
  const pendingMonth = useRef<string | null>(null);
  const settledMonth = useRef(currentMonth);

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
      listRef.current?.scrollToOffset({ offset: ITEM_H * idx, animated: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [months]);

  /**
   * 원하는 달로 이동한다. 목록에 없는 달이면 그 달을 가운데 둔 목록으로 다시 짜고
   * 커밋 후에 옮긴다(위 useEffect).
   */
  const scrollToMonth = useCallback(
    (month: string) => {
      const idx = months.indexOf(month);
      if (idx >= 0) {
        listRef.current?.scrollToOffset({
          offset: ITEM_H * idx,
          animated: true,
        });
        return;
      }
      pendingMonth.current = month;
      setMonths(monthRange(month, INITIAL_SPAN));
    },
    [months],
  );

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    // 손으로 끌어 올릴 때만 이어 붙인다. 상태바 탭처럼 프로그램이 맨 위까지
    // 끌고 가는 스크롤에서도 붙이면, 애니메이션 한 번에 수십 년치가 쌓여
    // 1984년 같은 엉뚱한 달에 도착하고 달마다 달력 요청이 나간다.
    // 시간 간격은 관성 스크롤 중 끌기 표시가 남아 있을 때를 대비한 안전장치.
    const now = Date.now();
    if (
      y < ITEM_H &&
      (dragging.current || momentumScrolling.current) &&
      !prependLock.current &&
      now - lastPrependAt.current > PREPEND_INTERVAL_MS
    ) {
      prependLock.current = true;
      lastPrependAt.current = now;
      setMonths((ms) => {
        const first = ms[0]!;
        const older: string[] = [];
        for (let i = PAGE_SIZE; i >= 1; i--) older.push(shiftMonth(first, -i));
        return [...older, ...ms];
      });
    }
  }, []);

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
          Math.round(event.nativeEvent.contentOffset.y / ITEM_H),
        ),
      );
      const month = months[index];
      if (!month || month === settledMonth.current) return;
      settledMonth.current = month;
      if (process.env.EXPO_OS === "ios") {
        void Haptics.selectionAsync();
      }
    },
    [months],
  );

  return (
    <View style={styles.root}>
      <FlatList
        ref={listRef}
        data={months}
        keyExtractor={(m) => m}
        renderItem={({ item }) => (
          <MonthBlock
            unitId={unitId}
            month={item}
            height={ITEM_H}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
            limitSummary={item === currentMonth ? limitSummary : undefined}
            myLeaveDays={myLeaveDays}
            regularOvernight={regularOvernight}
            currentCycle={currentCycle}
          />
        )}
        getItemLayout={(_, index) => ({
          length: ITEM_H,
          offset: ITEM_H * index,
          index,
        })}
        contentOffset={{ x: 0, y: ITEM_H * INITIAL_SPAN }}
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
        snapToInterval={ITEM_H}
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
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  limitSummary?: string;
  myLeaveDays: Map<ISODate, MyLeaveDay>;
  regularOvernight: RegularOvernightConfig | null;
  currentCycle: RegularOvernightCycle | null;
}) {
  const styles = useStyles();
  const colors = useColors();
  const calendar = useCalendar(props.unitId, props.month);
  const cycles = useMemo(() => {
    const { start, end } = monthBounds(props.month);
    return cyclesInRange(props.regularOvernight, start, end);
  }, [props.month, props.regularOvernight]);

  return (
    <View style={[styles.monthBlock, { height: props.height }]}>
      <View style={styles.monthHeading}>
        <Text style={styles.monthLabel}>{monthLabel(props.month)}</Text>
        {props.limitSummary ? (
          <Text style={styles.limitSummary} numberOfLines={1}>
            {props.limitSummary}
          </Text>
        ) : null}
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
          hideWeekdays
          myLeaveDays={props.myLeaveDays}
          cycles={cycles}
          currentCycle={props.currentCycle}
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
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.canvasSoft,
  },
  monthLabel: {
    fontSize: 24,
    fontWeight: "900",
    color: colors.ink,
    letterSpacing: -0.4,
  },
  limitSummary: { fontSize: 11, color: colors.mute },
  monthLoading: { paddingVertical: spacing.xxxl, alignItems: "center" },
  monthError: { fontSize: 14, color: colors.body, paddingVertical: spacing.lg },
}));
