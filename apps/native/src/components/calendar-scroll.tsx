import {
  shiftMonth,
  splitMonth,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
} from "@leave/shared";
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
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
import { colors, spacing } from "@/theme";

const WINDOW = 12; // 한 방향으로 채우는 개월 수
const CELL_H = 72; // month-calendar 셀 minHeight와 동일
const ROW_GAP = 2; // weekRow marginBottom
const ROWS = 6; // 그리드 최대 주 수
const GRID_H = ROWS * (CELL_H + ROW_GAP); // 6주 고정 높이 (짧은 달은 하단 여백)
const LABEL_H = 44;
const ITEM_H = LABEL_H + GRID_H; // getItemLayout용 고정 높이

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
 * 요일 헤더는 상단에 고정.
 */
export const CalendarScroll = forwardRef<
  CalendarScrollHandle,
  {
    unitId: string;
    selectedDate: ISODate | null;
    onSelectDate: (date: ISODate) => void;
  }
>(function CalendarScroll({ unitId, selectedDate, onSelectDate }, ref) {
  const currentMonth = todayInSeoul().slice(0, 7);
  const [months, setMonths] = useState(() => monthRange(currentMonth, WINDOW));
  const listRef = useRef<FlatList<string>>(null);
  const prependLock = useRef(false);

  // prepend 후 락 해제 (렌더 커밋 이후).
  useEffect(() => {
    prependLock.current = false;
  }, [months]);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      if (y < ITEM_H && !prependLock.current) {
        prependLock.current = true;
        setMonths((ms) => {
          const first = ms[0]!;
          const older: string[] = [];
          for (let i = WINDOW; i >= 1; i--) older.push(shiftMonth(first, -i));
          return [...older, ...ms];
        });
      }
    },
    [],
  );

  const onEndReached = useCallback(() => {
    setMonths((ms) => {
      const last = ms[ms.length - 1]!;
      const newer: string[] = [];
      for (let i = 1; i <= WINDOW; i++) newer.push(shiftMonth(last, i));
      return [...ms, ...newer];
    });
  }, []);

  useImperativeHandle(ref, () => ({
    scrollToToday: () => {
      const idx = months.indexOf(currentMonth);
      if (idx >= 0) {
        listRef.current?.scrollToIndex({ index: idx, animated: true });
      }
    },
  }));

  return (
    <View>
      <View style={styles.weekRow}>
        {WEEKDAYS.map((w, i) => (
          <Text
            key={w}
            style={[styles.weekday, i === 0 && { color: colors.negative }]}
          >
            {w}
          </Text>
        ))}
      </View>
      <FlatList
        ref={listRef}
        data={months}
        keyExtractor={(m) => m}
        renderItem={({ item }) => (
          <MonthBlock
            unitId={unitId}
            month={item}
            selectedDate={selectedDate}
            onSelectDate={onSelectDate}
          />
        )}
        getItemLayout={(_, index) => ({
          length: ITEM_H,
          offset: ITEM_H * index,
          index,
        })}
        initialScrollIndex={WINDOW}
        initialNumToRender={3}
        windowSize={7}
        maxToRenderPerBatch={4}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        onEndReached={onEndReached}
        onEndReachedThreshold={1.5}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(() => {
            listRef.current?.scrollToOffset({
              offset: ITEM_H * index,
              animated: true,
            });
          }, 60);
        }}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </View>
  );
});

function MonthBlock(props: {
  unitId: string;
  month: string;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
}) {
  const calendar = useCalendar(props.unitId, props.month);
  return (
    <View style={styles.monthBlock}>
      <Text style={styles.monthLabel}>{monthLabel(props.month)}</Text>
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
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { height: GRID_H * 1.05, maxHeight: 560 },
  weekRow: {
    flexDirection: "row",
    gap: 2,
    marginBottom: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.canvasSoft,
    paddingBottom: spacing.xs,
  },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.mute,
  },
  monthBlock: { height: ITEM_H },
  monthLabel: {
    height: LABEL_H,
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    paddingTop: spacing.sm,
  },
  monthLoading: { paddingVertical: spacing.xxxl, alignItems: "center" },
  monthError: { fontSize: 14, color: colors.body, paddingVertical: spacing.lg },
});
