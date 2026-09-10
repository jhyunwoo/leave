import type { WidgetTimelineEntry } from "./payload";

/** Web has no launcher widgets. Metro selects .ios/.android on devices. */
export async function publishWidgetTimeline(
  _entries: WidgetTimelineEntry[],
): Promise<void> {}
export async function resetWidgetSession(
  _authenticated: boolean,
): Promise<void> {}
