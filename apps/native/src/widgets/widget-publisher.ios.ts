import { LeaveMetricWidget } from "./leave-metric.widget";
import { LeaveSummaryWidget } from "./leave-summary.widget";
import { publishWatchTimeline } from "./watch-publisher";
import type { WatchPublishContext } from "./watch-publisher";
import type { WidgetTimelineEntry } from "./payload";

export async function publishWidgetTimeline(
  entries: WidgetTimelineEntry[],
  context?: WatchPublishContext,
): Promise<void> {
  LeaveMetricWidget.updateTimeline(entries);
  LeaveSummaryWidget.updateTimeline(entries);
  publishWatchTimeline(entries, context);
}

/** iOS continues using the existing WidgetSync placeholder publishing path. */
export async function resetWidgetSession(
  _authenticated: boolean,
): Promise<void> {}
