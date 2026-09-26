import { getLeaveAndroidWidgets } from "../../modules/leave-android-widgets";
import { captureHandledError } from "@/lib/observability";
import { buildAndroidWidgetTimeline } from "./android-transport";
import type { WidgetTimelineEntry } from "./payload";
import type { WatchPublishContext } from "./watch-publisher";
import { createWidgetPublishQueue } from "./publish-queue";

const queue = createWidgetPublishQueue();

export function publishWidgetTimeline(
  entries: WidgetTimelineEntry[],
  _context?: WatchPublishContext,
): Promise<void> {
  return queue.publish(
    entries.some(({ props }) => props.state === "ready"),
    async () => {
      const native = getLeaveAndroidWidgets();
      if (native)
        await native.setWidgetTimeline(
          JSON.stringify(buildAndroidWidgetTimeline(entries)),
        );
    },
  );
}

/** Called before local authentication changes, including expiry and account deletion. */
export async function resetWidgetSession(
  authenticated: boolean,
): Promise<void> {
  try {
    await queue.reset(authenticated, async () => {
      await getLeaveAndroidWidgets()?.clearWidgetData();
    });
  } catch (error) {
    captureHandledError(error, { source: "home_widget" });
  }
}
