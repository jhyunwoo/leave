import { LeaveMetricWidget } from "./leave-metric.widget";
import { LeaveSummaryWidget } from "./leave-summary.widget";
import type { WidgetTimelineEntry } from "./payload";

export async function publishWidgetTimeline(
  entries: WidgetTimelineEntry[],
): Promise<void> {
  LeaveMetricWidget.updateTimeline(entries);
  LeaveSummaryWidget.updateTimeline(entries);
}

/** iOS continues using the existing WidgetSync placeholder publishing path. */
export async function resetWidgetSession(
  _authenticated: boolean,
): Promise<void> {}
