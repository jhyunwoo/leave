/**
 * 날짜 칸의 길게 누르기 인식기.
 *
 * 칸에서는 길게 누르기만 인식한다. 활성화 뒤의 터치는 달력 루트가 맡아서,
 * 다른 달로 스크롤하며 이 칸이 언마운트되어도 드래그가 계속된다.
 *
 * 인식기가 **칸**에 붙는 것이 중요하다. 예전에는 재원 칩(11px 알약)에만 붙어 있어,
 * 92px 칸 안에서 조금만 빗나가면 드래그가 시작되지 않고 손을 떼는 순간 날짜가
 * 선택되어 버렸다. 무엇을 집을지는 손가락 위치로 정한다(`grab-target.ts`).
 */
import type { ISODate } from "@leave/shared/dates";
import { useContext, useMemo } from "react";
import {
  Gesture,
  type NativeGesture,
  type PanGesture,
  // TouchData는 타입뿐이라 컴파일에서 지워진다. 테스트의 require 셰임에 새 항목이
  // 필요 없다.
  type TouchData,
} from "react-native-gesture-handler";
import type { CalendarDragSubject } from "@/state/calendar-drag";
import { CalendarDragContext } from "./context";
import { nearestGrabTarget, type GrabRect } from "./grab-target";

export { isDragPressSuppressed, noteCalendarPressStart } from "./context";

/** 칸 안에서 항목이 놓이는 자리. 위에서 아래 순서다. */
export type DayCellSlot = "leave" | "personal";

export type DayCellSubject = {
  slot: DayCellSlot;
  subject: CalendarDragSubject;
};

/** 자리별 칸 안 세로 구간. 각 항목의 `onLayout`이 채운다. */
export type DayCellRects = Partial<Record<DayCellSlot, GrabRect>>;

export function useDayCellDrag(args: {
  /** 이 칸에서 집을 수 있는 것들. 칸에서 **위에 그려진 순서**로 넘긴다. */
  subjects: readonly DayCellSubject[];
  /**
   * 자리별 사각형을 담은 ref. `onLayout`이 값을 채우고 `onStart`가 읽는다.
   * 값이 아니라 ref인 이유는 제스처를 다시 만들지 않기 위해서다 — 인스턴스가
   * 바뀌면 RNGH의 `blocksExternalGesture` 관계가 매번 다시 맺어진다.
   */
  rects: React.RefObject<DayCellRects>;
  date: ISODate;
  scrollGesture: NativeGesture | null;
}): PanGesture {
  const { subjects, rects, date, scrollGesture } = args;
  const context = useContext(CalendarDragContext);
  return useMemo(() => {
    // runOnJS(true)여도 Expo는 인라인 콜백을 worklet factory로 변환한다.
    // let touch를 쓰면 onStart가 초기 null을 값으로 캡처한다. 같은 객체를
    // 공유해야 onTouchesDown이 기록한 실제 손가락을 onStart에서도 읽는다.
    const pointer: { touch: TouchData | null } = { touch: null };
    const pan = Gesture.Pan()
      .enabled(subjects.length > 0 && scrollGesture != null && context != null)
      // minDistance를 주면 길게 누르기 타이머보다 먼저 활성화되므로 설정하지 않는다.
      .activateAfterLongPress(250)
      .runOnJS(true)
      .onTouchesDown((event) => {
        pointer.touch ??= event.changedTouches[0] ?? null;
      })
      .onStart(() => {
        const touch = pointer.touch;
        if (!touch || !context) return;
        // y는 제스처가 붙은 뷰(= 칸) 기준이고, rects도 칸의 자식 레이아웃이라
        // 같은 기준계다. measure() 없이 바로 견줄 수 있다.
        const subject = nearestGrabTarget(
          touch.y,
          subjects.map((entry) => ({
            subject: entry.subject,
            rect: rects.current[entry.slot] ?? null,
          })),
        );
        if (subject) context.begin(subject, date, touch);
      })
      .onFinalize(() => {
        pointer.touch = null;
      });
    if (context) pan.simultaneousWithExternalGesture(context.gesture);
    return scrollGesture ? pan.blocksExternalGesture(scrollGesture) : pan;
  }, [subjects, rects, date, scrollGesture, context]);
}
