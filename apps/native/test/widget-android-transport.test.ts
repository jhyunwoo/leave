import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { todayInSeoul } from "@leave/shared/dates";
import { buildAndroidWidgetTimeline } from "../src/widgets/android-transport";
import { METRIC_KEYS, METRIC_LINKS } from "../src/widgets/metrics";
import {
  buildWidgetTimeline,
  emptyWidgetProps,
  type LeaveWidgetProps,
  type WidgetSource,
} from "../src/widgets/payload";

const now = new Date("2026-06-15T14:59:00Z");
const source: WidgetSource = {
  state: "ready",
  today: todayInSeoul(now),
  profile: {
    enlistedAt: "2026-01-01",
    dischargeAt: "2027-07-01",
    rank: "private",
  },
  dutyDaysToday: 200,
  leaves: [],
  unitHolidays: [],
  leaveRanges: [],
  snapshot: { holdings: null, headroom: null },
  defaultMetric: "discharge",
  summaryMetrics: ["promotion", "balance", "progress", "discharge"],
};
function transport(props: LeaveWidgetProps) {
  return buildAndroidWidgetTimeline([{ date: now, props }]);
}
function assertSerializable(value: unknown): void {
  expect(value).not.toBeNull();
  expect(value).not.toBeUndefined();
  if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  if (typeof value === "object")
    Object.values(value!).forEach(assertSerializable);
}

describe("Android widget render contract", () => {
  it("shares a serialized fixture with the Kotlin decoder", async () => {
    const payload = buildAndroidWidgetTimeline(
      buildWidgetTimeline(source, now),
    );
    await expect(`${JSON.stringify(payload, null, 2)}\n`).toMatchFileSnapshot(
      resolve(
        import.meta.dirname,
        "../modules/leave-android-widgets/android/src/test/resources/android-contract.json",
      ),
    );
  });

  it("preserves future instants and KST dates without serializing source profile or preferences", () => {
    const entries = buildWidgetTimeline(source, now);
    const payload = buildAndroidWidgetTimeline(entries);
    expect(payload.version).toBe(1);
    expect(payload.updatedAt).toBe(now.toISOString());
    expect(payload.entries).toHaveLength(14);
    expect(payload.entries[1]).toMatchObject({
      date: "2026-06-16",
      validFrom: Date.parse("2026-06-15T15:00:00Z"),
    });
    expect(payload.expiresAt).toBe(Date.parse("2026-06-28T15:00:00Z"));
    expect(payload.entries[0]).not.toHaveProperty("profile");
    expect(payload.entries[0]).not.toHaveProperty("defaultMetric");
    assertSerializable(payload);
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("uses the selected metric then the same first-available ordering as iOS", () => {
    const props = buildWidgetTimeline(source, now)[0]!.props;
    expect(
      transport({ ...props, defaultMetric: "progress" }).entries[0]!.metric
        ?.key,
    ).toBe("progress");
    expect(
      transport({ ...props, defaultMetric: "balance" }).entries[0]!.metric?.key,
    ).toBe("discharge");
    expect(transport({ ...props, metrics: {} }).entries[0]).not.toHaveProperty(
      "metric",
    );
  });

  it("skips missing summary metrics and preserves preference order", () => {
    const entry = buildAndroidWidgetTimeline(buildWidgetTimeline(source, now))
      .entries[0]!;
    expect(entry.summaryMetrics.map((metric) => metric.key)).toEqual([
      "promotion",
      "progress",
      "discharge",
    ]);
    expect(entry.url).toBe("leave:///");
  });

  it.each(["signedOut", "needsOnboarding"] as const)(
    "serializes %s without stale metric data",
    (state) => {
      const props = emptyWidgetProps(state, source.today, now);
      const payload = transport({
        ...props,
        metrics: buildWidgetTimeline(source, now)[0]!.props.metrics,
      });
      expect(payload.entries[0]).toMatchObject({
        state,
        summaryMetrics: [],
        url: "leave:///",
        message:
          state === "signedOut"
            ? "로그인하고 확인하세요"
            : "복무정보를 입력하세요",
      });
      expect(payload.entries[0]).not.toHaveProperty("metric");
      assertSerializable(payload);
    },
  );

  it.each(METRIC_KEYS)(
    "serializes the existing semantic destination and spoken value for %s",
    (key) => {
      const props = emptyWidgetProps("signedOut", source.today, now);
      const metric = {
        label: "지표",
        value: "12일",
        spoken: "12일 남았어요",
        compact: "지표 12일",
      };
      expect(
        transport({
          ...props,
          state: "ready",
          defaultMetric: key,
          metrics: { [key]: metric },
        }).entries[0]!.metric,
      ).toEqual({ ...metric, key, url: METRIC_LINKS[key] });
    },
  );

  it("keeps intraday transitions and renders return time honestly without a frozen countdown", () => {
    const props = buildWidgetTimeline(source, now)[0]!.props;
    const timer = {
      label: "휴가 중",
      value: "1시간",
      spoken: "복귀까지 1시간",
      compact: "복귀 1시간",
      timerStartAt: now.getTime(),
      timerEndAt: now.getTime() + 3600000,
    };
    const entries = [
      {
        date: now,
        props: {
          ...props,
          defaultMetric: "nextLeave" as const,
          metrics: { nextLeave: timer },
        },
      },
      { date: new Date(timer.timerEndAt), props },
    ];
    const payload = buildAndroidWidgetTimeline(entries);
    expect(payload.entries.map((entry) => entry.validFrom)).toEqual(
      entries.map((entry) => entry.date.getTime()),
    );
    expect(payload.entries[0]!.metric).toMatchObject({
      label: "복귀 예정",
      value: "00:59",
      caption: "6월 16일 · 한국시간",
      spoken: "6월 16일 한국시간 00:59 복귀 예정이에요",
    });
    expect(payload.entries[0]!.metric).not.toHaveProperty("timerEndAt");
  });
});
