import { requireOptionalNativeModule } from "expo";

export interface LeaveWatch {
  /** Sends the widget timeline JSON to the paired watch via WCSession applicationContext. */
  publishWatchTimeline(payload: string): void;
  watchStatus(): { paired: boolean; installed: boolean };
}

export function getLeaveWatch(): LeaveWatch | null {
  return requireOptionalNativeModule<LeaveWatch>("LeaveWatch");
}
