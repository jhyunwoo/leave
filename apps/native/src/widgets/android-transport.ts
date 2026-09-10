/** Android renders resolved values only. Keep schema v1 compatible with installed builds. */
import { addDays, kstMidnight, todayInSeoul } from "@leave/shared/dates";
import {
  METRIC_KEYS,
  METRIC_LINKS,
  SUMMARY_LINK,
  type MetricKey,
} from "./metrics";
import type { MetricValue, WidgetState, WidgetTimelineEntry } from "./payload";

export type AndroidWidgetMetric = Omit<
  MetricValue,
  "timerStartAt" | "timerEndAt"
> & { key: MetricKey; url: string };
export type AndroidWidgetEntry = {
  validFrom: number;
  date: string;
  asOf: string;
  updatedLabel: string;
  state: WidgetState;
  message: string;
  url: string;
  metric?: AndroidWidgetMetric;
  summaryMetrics: AndroidWidgetMetric[];
};
export type AndroidWidgetTimeline = {
  version: 1;
  updatedAt: string;
  expiresAt: number;
  entries: AndroidWidgetEntry[];
};

export function buildAndroidWidgetTimeline(
  timeline: readonly WidgetTimelineEntry[],
): AndroidWidgetTimeline {
  if (!timeline.length) throw new Error("Widget timeline is empty");
  return {
    version: 1,
    updatedAt: timeline[0]!.props.asOf,
    // Valid through the last KST day, including intraday return transitions.
    expiresAt: kstMidnight(
      addDays(timeline[timeline.length - 1]!.props.date, 1),
    ),
    entries: timeline.map(({ date, props }) => {
      const resolve = (key: MetricKey): AndroidWidgetMetric | undefined => {
        const value = props.metrics[key];
        return value
          ? { ...androidMetricValue(value), key, url: METRIC_LINKS[key] }
          : undefined;
      };
      const ready = props.state === "ready";
      const selected = ready
        ? (resolve(props.defaultMetric) ??
          METRIC_KEYS.map(resolve).find(Boolean))
        : undefined;
      return {
        validFrom: date.getTime(),
        date: props.date,
        asOf: props.asOf,
        updatedLabel: `${todayInSeoul(new Date(props.asOf))} 업데이트`,
        state: props.state,
        message:
          props.state === "signedOut"
            ? "로그인하고 확인하세요"
            : props.state === "needsOnboarding"
              ? "복무정보를 입력하세요"
              : "아직 보여줄 값이 없어요",
        url: SUMMARY_LINK,
        ...(selected ? { metric: selected } : {}),
        summaryMetrics: ready
          ? props.summaryMetrics
              .map(resolve)
              .filter((metric) => metric !== undefined)
          : [],
      };
    }),
  };
}

/** RemoteViews has no bounded WidgetKit timer. An absolute return time stays truthful offline. */
function androidMetricValue(
  metric: MetricValue,
): Omit<MetricValue, "timerStartAt" | "timerEndAt"> {
  const { timerStartAt: _start, timerEndAt, ...value } = metric;
  if (timerEndAt === undefined) return value;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timerEndAt));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)!.value;
  const date = `${part("month")}월 ${part("day")}일`;
  const time = `${part("hour")}:${part("minute")}`;
  return {
    label: "복귀 예정",
    value: time,
    caption: `${date} · 한국시간`,
    spoken: `${date} 한국시간 ${time} 복귀 예정이에요`,
    compact: `${date} ${time} 복귀`,
  };
}
