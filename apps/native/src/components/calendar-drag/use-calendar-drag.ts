/** 달력 전체에 붙어 원래 칩의 가상화와 무관하게 두 손가락을 추적한다. */
import type { ISODate } from "@leave/shared/dates";
import * as Haptics from "expo-haptics";
import { useStore } from "jotai";
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
  FlatList,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import {
  Gesture,
  type GestureTouchEvent,
  type GestureStateManager,
} from "react-native-gesture-handler";
import { runOnJS, useSharedValue } from "react-native-reanimated";
import {
  calendarDragAtom,
  calendarGridMetricsAtom,
} from "@/state/calendar-drag";
import { setCalendarDragPressActive } from "./context";
import { CalendarDragSession, type CalendarTouch } from "./session";

function selectionHaptic(): void {
  const feedback =
    process.env.EXPO_OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Long_Press)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  void feedback.catch(() => {});
}

export function useCalendarDrag(options: {
  listRef: React.RefObject<FlatList<string> | null>;
  initialOffset: number;
  viewportHeight: number;
  contentInset: number;
  onScrollBeginDrag: () => void;
  resetScrollFlags: () => void;
}) {
  const {
    listRef,
    initialOffset,
    viewportHeight,
    contentInset,
    onScrollBeginDrag,
    resetScrollFlags,
  } = options;
  const store = useStore();
  const session = useRef<CalendarDragSession | null>(null);
  const offset = useRef(initialOffset);
  const active = useSharedValue(false);

  const cancel = useCallback(() => {
    active.set(false);
    if (!session.current) return;
    session.current = null;
    setCalendarDragPressActive(false);
    resetScrollFlags();
    store.set(calendarDragAtom, null);
  }, [active, resetScrollFlags, store]);

  const publish = useCallback(() => {
    const current = session.current;
    if (!current) return;
    const previous = store.get(calendarDragAtom);
    if (
      previous?.hoverDate !== current.drag.hoverDate ||
      previous?.hasMoved !== current.drag.hasMoved
    ) {
      store.set(calendarDragAtom, { ...current.drag });
    }
    if (
      previous?.hoverDate !== current.drag.hoverDate &&
      current.drag.hoverDate
    ) {
      void Haptics.selectionAsync().catch(() => {});
    }
    if (offset.current !== current.scrollOffset) {
      offset.current = current.scrollOffset;
      listRef.current?.scrollToOffset({
        offset: offset.current,
        animated: false,
      });
    }
  }, [listRef, store]);

  const begin = useCallback(
    (leaveId: string, date: ISODate, touch: CalendarTouch) => {
      const metrics = store.get(calendarGridMetricsAtom);
      if (
        !metrics ||
        !metrics.months.includes(date.slice(0, 7)) ||
        store.get(calendarDragAtom)
      )
        return;
      session.current = new CalendarDragSession(
        leaveId,
        date,
        touch,
        metrics,
        offset.current,
      );
      active.set(true);
      setCalendarDragPressActive(true);
      resetScrollFlags();
      // 관성 스크롤 중 집었어도 현재 보이는 위치에서 멈춘다.
      listRef.current?.scrollToOffset({
        offset: offset.current,
        animated: false,
      });
      store.set(calendarDragAtom, { ...session.current.drag });
      selectionHaptic();
    },
    [active, listRef, resetScrollFlags, store],
  );

  const move = useCallback(
    (touches: CalendarTouch[]) => {
      const current = session.current;
      const metrics = store.get(calendarGridMetricsAtom);
      if (!current || !metrics) return;
      const before = current.scrollOffset;
      current.move(
        touches,
        Math.max(
          0,
          metrics.months.length * metrics.itemHeight +
            contentInset -
            viewportHeight,
        ),
      );
      if (before !== current.scrollOffset) onScrollBeginDrag();
      publish();
    },
    [store, contentInset, viewportHeight, onScrollBeginDrag, publish],
  );

  const release = useCallback(
    (touches: CalendarTouch[], allTouches: CalendarTouch[]) => {
      const current = session.current;
      if (!current) return;
      // 일부 플랫폼은 마지막 좌표를 move 없이 up에만 보낸다.
      move([
        ...allTouches.filter(
          (touch) => !touches.some((ended) => ended.id === touch.id),
        ),
        ...touches,
      ]);
      const result = current.release(touches.map((touch) => touch.id));
      if (!result) return;
      session.current = null;
      active.set(false);
      setCalendarDragPressActive(false);
      resetScrollFlags();
      store.set(calendarDragAtom, {
        ...current.drag,
        phase: result === "edit" ? "editing" : "dropped",
      });
    },
    [active, resetScrollFlags, store, move],
  );

  const onTouchesMove = useCallback(
    (event: GestureTouchEvent, manager: GestureStateManager) => {
      "worklet";
      if (!active.get()) return;
      manager.activate();
      runOnJS(move)(event.allTouches);
    },
    [active, move],
  );
  const onTouchesUp = useCallback(
    (event: GestureTouchEvent, manager: GestureStateManager) => {
      "worklet";
      runOnJS(release)(event.changedTouches, event.allTouches);
      if (event.numberOfTouches === 0) manager.end();
    },
    [release],
  );
  const onTouchesCancelled = useCallback(
    (_event: GestureTouchEvent, manager: GestureStateManager) => {
      "worklet";
      runOnJS(cancel)();
      manager.fail();
    },
    [cancel],
  );
  const onFinalize = useCallback(() => {
    "worklet";
    runOnJS(cancel)();
  }, [cancel]);
  // RNGH의 onTouches*는 콜백을 등록할 뿐 렌더 중 실행하지 않는다.
  // ref는 이벤트가 JS 스레드로 전달된 뒤에만 읽는다.
  /* eslint-disable react-hooks/refs */
  const gesture = useMemo(
    () =>
      Gesture.Manual()
        .onTouchesDown(onTouchesMove)
        .onTouchesMove(onTouchesMove)
        .onTouchesUp(onTouchesUp)
        .onTouchesCancelled(onTouchesCancelled)
        .onFinalize(onFinalize),
    [onTouchesMove, onTouchesUp, onTouchesCancelled, onFinalize],
  );
  /* eslint-enable react-hooks/refs */

  useEffect(
    () =>
      store.sub(calendarGridMetricsAtom, () => {
        const current = session.current;
        const metrics = store.get(calendarGridMetricsAtom);
        if (!current || !metrics) return;
        // 회전으로 칸 크기가 달라지면 잘못된 날짜에 저장하지 않고 취소한다.
        if (!current.rebase(metrics)) {
          cancel();
          return;
        }
        publish();
      }),
    [store, publish, cancel],
  );

  useEffect(() => cancel, [cancel]);

  const trackScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      // 드래그 중 오프셋은 둘째 손가락과 prepend 보정이 소유한다. 늦게 도착한
      // 네이티브 onScroll로 덮으면 보정 전 좌표로 되돌아가 날짜가 튄다.
      if (!session.current) offset.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  return {
    context: useMemo(() => ({ gesture, begin }), [gesture, begin]),
    trackScroll,
  };
}
