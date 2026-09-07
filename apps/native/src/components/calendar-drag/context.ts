import type { ISODate } from "@leave/shared/dates";
import { createContext } from "react";
import type { ManualGesture } from "react-native-gesture-handler";
import type { CalendarTouch } from "./session";

export const CalendarDragContext = createContext<{
  gesture: ManualGesture;
  begin: (leaveId: string, date: ISODate, touch: CalendarTouch) => void;
} | null>(null);

let dragging = false;
let pendingPressSuppression = false;

export function setCalendarDragPressActive(active: boolean): void {
  dragging = active;
  pendingPressSuppression = true;
}

export function noteCalendarPressStart(): void {
  pendingPressSuppression = false;
}

export function isDragPressSuppressed(): boolean {
  if (dragging) return true;
  if (!pendingPressSuppression) return false;
  pendingPressSuppression = false;
  return true;
}
