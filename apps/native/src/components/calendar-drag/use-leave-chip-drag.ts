/**
 * 달력의 내 휴가 칩을 길게 눌러 다른 날짜로 끌어 옮기는 제스처.
 *
 * 사용처: components/month-calendar.tsx의 칩 하나하나.
 *
 * ## 왜 칩마다 붙이나
 *
 * 목록이나 칸에 붙이면 휴가가 없는 자리에서도 250ms 동안 스크롤을 붙잡았다가
 * 놓아주게 된다. 칩에만 달면 달력의 나머지는 지금과 똑같이 스크롤되고, 손가락이
 * 실제로 휴가 위에 있을 때만 이 제스처가 존재한다.
 *
 * ## 목록 스크롤과의 관계
 *
 * `blocksExternalGesture`에 **FlatList의 ref를 넘기면 조용히 무시된다** — RNGH는
 * ref에서 `handlerTag`를 꺼내는데 RN 컴포넌트에는 그 속성이 없어 -1이 되고, 그대로
 * 걸러진다(에러도 경고도 없다). 그래서 `CalendarScroll`이 목록을 감싸는
 * `Gesture.Native()`를 만들어 넘겨주고, 여기서는 그 *제스처 객체*를 막는다.
 *
 * 손가락이 250ms 안에 움직이면 이 제스처는 실패하고 목록이 평소대로 스크롤한다.
 * 그래서 "빠르게 쓸면 스크롤, 누르고 있으면 드래그"가 된다.
 */

import { buildMonthGrid } from "@leave/shared/calendar";
import { diffDays, type ISODate } from "@leave/shared/dates";
import {
  isUserEditableLeaveStatus,
  type LeaveStatus,
} from "@leave/shared/leave";
import * as Haptics from "expo-haptics";
import { useStore } from "jotai";
import { useCallback, useEffect, useMemo } from "react";
import {
  Gesture,
  type NativeGesture,
  type PanGesture,
} from "react-native-gesture-handler";
import {
  calendarDragAtom,
  calendarGridMetricsAtom,
} from "@/state/calendar-drag";
import {
  locateDate,
  resolveDrop,
  type DragLattice,
  type LatticeCell,
} from "./lattice";

/**
 * 집었다고 인정하는 시간. 짧으면 스크롤하려다 휴가가 딸려 오고, 길면 집는 느낌이
 * 굼떠진다. iOS 기본 길게 누르기(500ms)보다는 빠르게 잡았다.
 */
const LONG_PRESS_MS = 250;

const isIOS = process.env.EXPO_OS === "ios";

/**
 * 진행 중인 드래그. 손가락은 하나뿐이라 앱 전체에 하나만 존재한다.
 *
 * 칩마다 ref로 들고 있으면 "지금 누가 끌고 있나"가 칩 수만큼 흩어지고, 제스처
 * 콜백을 만들 때마다 그 ref를 렌더 중에 넘기게 된다. 하나뿐인 것을 하나로 두면
 * 소유자 확인(`owns`)만으로 모든 경우가 정리된다.
 */
type DragSession = {
  leaveId: string;
  grabDate: ISODate;
  lattice: DragLattice;
  from: LatticeCell;
  hover: ISODate | null;
};

let session: DragSession | null = null;

/**
 * 드래그가 끝난 뒤 딱 한 번 무시할 탭이 남아 있는가.
 *
 * 네이티브에서는 Pan이 활성화되는 순간 RNGH가 RN 터치를 취소하므로 칸의 onPress가
 * 아예 울리지 않는다. 하지만 react-native-web에는 그 취소 경로가 없어서, 휴가를
 * 옮기고 손을 떼면 누르기 시작했던 칸의 날짜 상세 시트까지 함께 열린다.
 * iOS에서 그런 일이 생기면 시트와 다른 모달이 겹치려다 화면이 굳는다
 * (screens/calendar/index.tsx의 모달 규칙).
 *
 * 시간 창으로 재지 않는 이유: 놓는 순간 뜨는 알림(window.alert)이 자바스크립트를
 * 붙잡고 있는 동안 창이 지나가 버려 그대로 새어 나간다. 대신 한 번만 삼키고,
 * 다음 누름이 시작되면(onPressIn) 남은 표를 버려 네이티브에서 멀쩡한 탭을
 * 잡아먹지 않게 한다.
 */
let pendingPressSuppression = false;

/** 날짜 칸이 눌리기 시작했다. 남아 있던 억제 표는 여기서 만료된다. */
export function noteCalendarPressStart(): void {
  pendingPressSuppression = false;
}

/** 이 탭이 방금 끝난 드래그의 잔상인가. 칸의 onPress가 물어본다. */
export function isDragPressSuppressed(): boolean {
  if (session !== null) return true;
  if (!pendingPressSuppression) return false;
  pendingPressSuppression = false;
  return true;
}

function owns(leaveId: string | null, date: ISODate): boolean {
  return (
    session !== null && session.leaveId === leaveId && session.grabDate === date
  );
}

export function useLeaveChipDrag(args: {
  /** 이 칩이 속한 휴가. 내 휴가가 아닌 칸(미리보기만 있는 칸)이면 null. */
  leaveId: string | null;
  status: LeaveStatus | null;
  date: ISODate;
  /** 목록 스크롤 제스처. 없으면(달력 스크롤 밖에서 쓰이면) 끌 수 없다. */
  scrollGesture: NativeGesture | null;
}): PanGesture {
  const { leaveId, status, date, scrollGesture } = args;
  const store = useStore();

  // 끝난 휴가(복귀 완료·반려·취소)는 손댈 수 없다. 서버의 PATCH /leaves/:id는
  // 상태 라우트와 달리 이걸 검사하지 않으므로 여기서 막아야 한다.
  const draggable =
    leaveId != null &&
    status != null &&
    isUserEditableLeaveStatus(status) &&
    scrollGesture != null;

  const cancel = useCallback(() => {
    if (!owns(leaveId, date)) return;
    session = null;
    pendingPressSuppression = true;
    store.set(calendarDragAtom, null);
  }, [leaveId, date, store]);

  const begin = useCallback(() => {
    if (!draggable || leaveId == null) return;
    const metrics = store.get(calendarGridMetricsAtom);
    if (!metrics) return;

    // 달 목록은 스크롤 중에 앞뒤로 자라고 꼬리가 잘린다. 제스처 내내 쓸 격자는
    // 지금 이 순간의 스냅샷이어야 인덱스가 밀리지 않는다.
    const lattice: DragLattice = {
      itemHeight: metrics.itemHeight,
      rowPitch: metrics.rowPitch,
      colPitch: metrics.colPitch,
      labelHeight: metrics.labelHeight,
      grids: metrics.months.map((month) => buildMonthGrid(month)),
    };
    const from = locateDate(lattice, date);
    if (!from) return;

    session = { leaveId, grabDate: date, lattice, from, hover: date };
    store.set(calendarDragAtom, {
      leaveId,
      grabDate: date,
      hoverDate: date,
      deltaDays: 0,
      phase: "dragging",
    });
    if (isIOS) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
  }, [draggable, leaveId, date, store]);

  const move = useCallback(
    (translationX: number, translationY: number) => {
      if (!owns(leaveId, date) || !session) return;
      const hover = resolveDrop(
        session.lattice,
        session.from,
        translationX,
        translationY,
      );
      if (hover === session.hover) return;
      session.hover = hover;
      store.set(calendarDragAtom, (current) =>
        current
          ? {
              ...current,
              hoverDate: hover,
              deltaDays: hover ? diffDays(date, hover) : 0,
            }
          : current,
      );
      if (isIOS && hover) void Haptics.selectionAsync();
    },
    [leaveId, date, store],
  );

  /** 손을 뗐다. 저장은 달력 화면이 이 상태를 보고 맡는다. */
  const drop = useCallback(() => {
    if (!owns(leaveId, date)) return;
    session = null;
    pendingPressSuppression = true;
    store.set(calendarDragAtom, (current) =>
      current ? { ...current, phase: "dropped" } : current,
    );
  }, [leaveId, date, store]);

  /**
   * 칩이 화면에서 사라졌는데 드래그가 살아 있으면 되돌린다.
   *
   * RNGH는 GestureDetector가 감싼 뷰가 언마운트되면 네이티브 핸들러를 버리고
   * onEnd·onFinalize를 **부르지 않는다**. 그러면 드래그 상태가 "들린 채"로 남아
   * 달력이 미리보기를 계속 그린다. React의 정리 함수는 그때도 불리므로 여기서 막는다.
   */
  useEffect(() => cancel, [cancel]);

  return useMemo(() => {
    const pan = Gesture.Pan()
      .enabled(draggable)
      .activateAfterLongPress(LONG_PRESS_MS)
      // minDistance는 **설정하지 않는다**. 값을 주면 RNGH의 shouldActivate가 그
      // 거리만 넘으면 바로 활성화해 버려서(0을 주면 첫 move에서 즉시)
      // activateAfterLongPress가 무력화되고, 칩을 누르는 순간 스크롤을 빼앗는다.
      // 비워 두면 활성화 경로가 길게 누르기 타이머 하나뿐이고, 타이머가 울리기 전에
      // 손가락이 10px 넘게 움직이면 shouldFail이 제스처를 실패시켜 목록이
      // 평소대로 스크롤한다 — "쓸면 스크롤, 누르고 있으면 드래그"가 여기서 나온다.
      .runOnJS(true)
      .onStart(begin)
      .onUpdate((event) => move(event.translationX, event.translationY))
      .onEnd((_event, success) => {
        if (success) drop();
      })
      .onFinalize(cancel);
    return scrollGesture ? pan.blocksExternalGesture(scrollGesture) : pan;
  }, [draggable, scrollGesture, begin, move, drop, cancel]);
}
