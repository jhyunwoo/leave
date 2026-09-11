/** Android renders resolved values only. Keep schema v1 compatible with installed builds. */
import {
  addDays,
  KST_OFFSET_MS,
  kstMidnight,
  todayInSeoul,
} from "@leave/shared/dates";
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

/**
 * RemoteViews has no bounded WidgetKit timer. An absolute return time stays truthful offline.
 *
 * 시각을 `Intl.DateTimeFormat(...).formatToParts`로 쪼개지 않는다. 이 저장소에서
 * `formatToParts`를 쓰는 곳은 여기뿐이고(다른 자리는 모두 `.format()`),
 * Hermes/Android의 Intl에서 검증된 적이 없다. 여기서 던지면
 * `buildAndroidWidgetTimeline`이 던지고 네이티브 쓰기가 아예 나가지 않아 위젯이
 * 마지막 값에 머문 채 조용히 낡는다 — 1.1.0(build 42)의 `gauge: null` 사고와 같은
 * 모양이고 앱에는 아무 증상이 없다.
 *
 * 한국은 서머타임이 없어 고정 +9시간이 정확하다. `kstMidnight`이 같은 산술을 쓴다.
 */
function androidMetricValue(
  metric: MetricValue,
): Omit<MetricValue, "timerStartAt" | "timerEndAt"> {
  const { timerStartAt: _start, timerEndAt, ...value } = metric;
  if (timerEndAt === undefined) return value;
  const kst = new Date(timerEndAt + KST_OFFSET_MS);
  const pad = (n: number) => n.toString().padStart(2, "0");
  const date = `${kst.getUTCMonth() + 1}월 ${kst.getUTCDate()}일`;
  const time = `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;
  return {
    label: "복귀 예정",
    value: time,
    caption: `${date} · 한국시간`,
    spoken: `${date} 한국시간 ${time} 복귀 예정이에요`,
    compact: `${date} ${time} 복귀`,
  };
}
