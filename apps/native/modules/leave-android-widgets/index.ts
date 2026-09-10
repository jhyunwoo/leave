import { requireOptionalNativeModule } from "expo";

export interface LeaveAndroidWidgets {
  setWidgetTimeline(payload: string): Promise<void>;
  clearWidgetData(): Promise<void>;
  refreshWidgets(): Promise<void>;
}

/** Lazy and optional: Expo Go/older binaries must still start and authenticate. */
export function getLeaveAndroidWidgets(): LeaveAndroidWidgets | null {
  return requireOptionalNativeModule<LeaveAndroidWidgets>(
    "LeaveAndroidWidgets",
  );
}
