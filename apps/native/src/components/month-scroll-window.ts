/**
 * 세로 월 스크롤의 공통 상태 기계(네이티브).
 *
 * 부대 달력(calendar-scroll)과 친구 비교 달력(friend-calendar-scroll)은 그리는
 * 내용만 다르고 "달을 어떻게 쌓고 어디로 옮기는가"는 같아야 한다. 그 부분 —
 * 창 넓히기, 상한, 위쪽 이어붙이기 보정, 특정 달로 이동 — 만 여기에 둔다.
 * 창 계산 자체는 month-window의 순수 함수들이 맡는다.
 *
 * FlatList 자체는 각 화면에 남겨 둔다. 부대 달력은 휴가 칩 드래그 때문에
 * GestureDetector와 scrollEnabled를 함께 다뤄야 하고, 친구 달력은 그럴 일이
 * 없다. 목록 JSX까지 합치면 한쪽에만 필요한 소품이 계속 새는 쪽이 된다.
 */

import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import {
  appendMonths,
  INITIAL_SPAN,
  monthRange,
  PREPEND_INTERVAL_MS,
  prependMonths,
  settledMonthOffset,
} from "@/components/month-window";

export * from "@/components/month-window";

export interface MonthScrollWindow {
  /** 지금 목록에 담긴 달들. FlatList의 data. */
  months: string[];
  listRef: React.RefObject<FlatList<string> | null>;
  /** 그 달로 옮긴다. 목록에 없으면 그 달을 가운데 둔 목록으로 다시 짠다. */
  scrollToMonth: (month: string) => void;
  /**
   * 끌기·관성 표시를 내린다. 관성 스크롤 도중 scrollEnabled를 끄면 iOS가
   * onMomentumScrollEnd를 쏘지 않아 표시가 굳는 것에 대한 대비.
   */
  resetScrollFlags: () => void;
  settleDragOffset: (offset: number, targetDate?: string | null) => number;
  onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onScrollBeginDrag: () => void;
  onScrollEndDrag: () => void;
  onMomentumScrollBegin: () => void;
  onMomentumScrollEnd: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onEndReached: () => void;
}

/**
 * 세로 월 스크롤의 창·보정·이동을 맡는다.
 *
 * `itemHeight`가 바뀌면(회전·Split View·첫 측정) 보고 있던 달로 다시 맞춘다.
 * 오프셋은 픽셀이라, 블록 높이만 바뀌면 같은 오프셋이 엉뚱한 달을 가리킨다.
 */
export function useMonthScrollWindow(options: {
  /** 한 달 블록 높이. getItemLayout·snapToInterval과 같은 값이어야 한다. */
  itemHeight: number;
  /** 가운데에 둘 달(보통 오늘이 든 달). */
  currentMonth: string;
  /** 이 달보다 앞으로는 넓히지 않는다. 없으면 제한하지 않는다. */
  earliestMonth?: string;
  /** 이 달보다 뒤로는 넓히지 않는다. 없으면 제한하지 않는다. */
  latestMonth?: string;
}): MonthScrollWindow {
  const { itemHeight, currentMonth, earliestMonth, latestMonth } = options;
  const [months, setMonths] = useState(() =>
    monthRange(currentMonth, INITIAL_SPAN),
  );
  const listRef = useRef<FlatList<string> | null>(null);
  const prependLock = useRef(false);
  const lastPrependAt = useRef(0);
  const dragging = useRef(false);
  const momentumScrolling = useRef(false);
  // 목록을 다시 짠 뒤에 옮겨갈 달. scrollToMonth 참고.
  const pendingMonth = useRef<string | null>(null);
  const settledMonth = useRef(currentMonth);
  // 첫 렌더의 contentOffset이 이 값으로 계산되므로, 이후 값이 바뀌면 아래
  // useEffect가 보고 있던 달로 다시 맞춘다.
  const initialItemHeight = useRef(itemHeight);

  // prepend 후 락 해제(렌더 커밋 이후). 다시 짠 목록이면 목적지로 옮긴다.
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

  const scrollToMonth = useCallback(
    (month: string) => {
      const idx = months.indexOf(month);
      settledMonth.current = month;
      if (idx >= 0) {
        listRef.current?.scrollToOffset({
          offset: itemHeight * idx,
          animated: true,
        });
        return;
      }
      pendingMonth.current = month;
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
        setMonths((ms) => prependMonths(ms, earliestMonth));
      }
    },
    [itemHeight, earliestMonth],
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

  const resetScrollFlags = useCallback(() => {
    dragging.current = false;
    momentumScrolling.current = false;
  }, []);

  const settleDragOffset = useCallback(
    (offset: number, targetDate?: string | null) => {
      const settled = settledMonthOffset(
        offset,
        itemHeight,
        months.length,
        targetDate ? months.indexOf(targetDate.slice(0, 7)) : -1,
      );
      settledMonth.current = months[settled.index] ?? settledMonth.current;
      listRef.current?.scrollToOffset({
        offset: settled.offset,
        animated: false,
      });
      return settled.offset;
    },
    [itemHeight, months],
  );

  const onEndReached = useCallback(() => {
    setMonths((ms) => appendMonths(ms, latestMonth));
  }, [latestMonth]);

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

  return {
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
  };
}
