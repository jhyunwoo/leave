/**
 * 칩에서는 길게 누르기만 인식한다. 활성화 뒤의 터치는 달력 루트가 맡아서,
 * 다른 달로 스크롤하며 이 칩이 언마운트되어도 드래그가 계속된다.
 */
import type { ISODate } from "@leave/shared/dates";
import {
  isUserEditableLeaveStatus,
  type LeaveStatus,
} from "@leave/shared/leave";
import { useContext, useMemo } from "react";
import {
  Gesture,
  type NativeGesture,
  type PanGesture,
} from "react-native-gesture-handler";
import { CalendarDragContext } from "./context";
import type { CalendarTouch } from "./session";

export { isDragPressSuppressed, noteCalendarPressStart } from "./context";

export function useLeaveChipDrag(args: {
  leaveId: string | null;
  status: LeaveStatus | null;
  date: ISODate;
  scrollGesture: NativeGesture | null;
}): PanGesture {
  const { leaveId, status, date, scrollGesture } = args;
  const context = useContext(CalendarDragContext);
  return useMemo(() => {
    let touch: CalendarTouch | null = null;
    const pan = Gesture.Pan()
      .enabled(
        leaveId != null &&
          status != null &&
          isUserEditableLeaveStatus(status) &&
          scrollGesture != null &&
          context != null,
      )
      // minDistance를 주면 길게 누르기 타이머보다 먼저 활성화되므로 설정하지 않는다.
      .activateAfterLongPress(250)
      .runOnJS(true)
      .onTouchesDown((event) => {
        touch ??= event.changedTouches[0] ?? null;
      })
      .onStart(() => {
        if (leaveId && touch) context?.begin(leaveId, date, touch);
      })
      .onFinalize(() => {
        touch = null;
      });
    if (context) pan.simultaneousWithExternalGesture(context.gesture);
    return scrollGesture ? pan.blocksExternalGesture(scrollGesture) : pan;
  }, [leaveId, status, date, scrollGesture, context]);
}
