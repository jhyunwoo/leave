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
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useCalendar } from "@/api/queries";
import { MonthCalendar } from "@/components/month-calendar";
import type { MyLeaveDay } from "@/lib/my-leave-days";
import { colors, spacing } from "@/theme";

const INITIAL_SPAN = 2;
const PAGE_SIZE = 6;
const CELL_H = 72; // month-calendar 셀 minHeight와 동일
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
  },
  ref,
) {
  const currentMonth = todayInSeoul().slice(0, 7);
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );
  const listRef = useRef<FlatList<string>>(null);
  const prependLock = useRef(false);
  const settledMonth = useRef(currentMonth);

  // prepend 후 락 해제 (렌더 커밋 이후).
  useEffect(() => {
    prependLock.current = false;
  }, [months]);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    if (y < ITEM_H && !prependLock.current) {
      prependLock.current = true;
      setMonths((ms) => {
        const first = ms[0]!;
        const older: string[] = [];
        for (let i = PAGE_SIZE; i >= 1; i--) older.push(shiftMonth(first, -i));
        return [...older, ...ms];
      });
    }
  }, []);

  const onEndReached = useCallback(() => {
    setMonths((ms) => {
      const last = ms[ms.length - 1]!;
      const newer: string[] = [];
      for (let i = 1; i <= PAGE_SIZE; i++) newer.push(shiftMonth(last, i));
      return [...ms, ...newer];
    });
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const idx = months.indexOf(currentMonth);
      if (idx >= 0) {
        listRef.current?.scrollToOffset({
          offset: ITEM_H * idx,
          animated: true,
        });
      }
    },
  }));

  const onMomentumScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
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

const styles = StyleSheet.create({
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
});
