import type { WidgetTimelineEntry } from "./payload";
import type { WatchPublishContext } from "./watch-publisher";

/** Web has no launcher widgets. Metro selects .ios/.android on devices. */
export async function publishWidgetTimeline(
  _entries: WidgetTimelineEntry[],
  _context?: WatchPublishContext,
): Promise<void> {}
export async function resetWidgetSession(
  _authenticated: boolean,
): Promise<void> {}
