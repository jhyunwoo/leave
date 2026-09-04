import { describe, expect, it } from "vitest";
import {
  defaultWidgetPreferences,
  normalizeWidgetPreferences,
} from "../src/widgets/preferences";
import { SUMMARY_METRIC_MAX, SUMMARY_METRIC_MIN } from "../src/widgets/metrics";

describe("위젯 설정 정규화", () => {
  it("저장된 적 없으면 기본값", () => {
    expect(normalizeWidgetPreferences(undefined)).toEqual(
      defaultWidgetPreferences,
    );
    expect(normalizeWidgetPreferences({})).toEqual(defaultWidgetPreferences);
  });

  it("아는 값은 그대로 지킨다", () => {
    expect(
      normalizeWidgetPreferences({
        defaultMetric: "balance",
        summaryMetrics: ["nextLeave", "progress", "discharge"],
      }),
    ).toEqual({
      defaultMetric: "balance",
      summaryMetrics: ["nextLeave", "progress", "discharge"],
    });
  });

  it("모르는 지표는 걸러낸다", () => {
    // 지표를 없앤 버전으로 업데이트하면 기기에는 옛 key가 남아 있다.
    const result = normalizeWidgetPreferences({
      defaultMetric: "sortie",
      summaryMetrics: ["nextLeave", "sortie", "progress"],
    });
    expect(result.defaultMetric).toBe(defaultWidgetPreferences.defaultMetric);
    expect(result.summaryMetrics).toEqual(["nextLeave", "progress"]);
  });

  it("중복은 한 번만 남기고 순서는 지킨다", () => {
    expect(
      normalizeWidgetPreferences({
        summaryMetrics: ["balance", "discharge", "balance"],
      }).summaryMetrics,
    ).toEqual(["balance", "discharge"]);
  });

  it("최소 개수에 못 미치면 기본 구성으로 되돌린다", () => {
    expect(
      normalizeWidgetPreferences({ summaryMetrics: ["balance"] })
        .summaryMetrics,
    ).toEqual(defaultWidgetPreferences.summaryMetrics);
    expect(
      defaultWidgetPreferences.summaryMetrics.length,
    ).toBeGreaterThanOrEqual(SUMMARY_METRIC_MIN);
  });

  it("최대 개수를 넘으면 앞에서부터 자른다", () => {
    const many = [
      "discharge",
      "dutyDays",
      "progress",
      "nextLeave",
      "headroom",
      "balance",
      "promotion",
    ];
    const result = normalizeWidgetPreferences({ summaryMetrics: many });
    expect(result.summaryMetrics).toHaveLength(SUMMARY_METRIC_MAX);
    expect(result.summaryMetrics).toEqual(many.slice(0, SUMMARY_METRIC_MAX));
  });

  it("배열이 아닌 값도 견딘다", () => {
    expect(
      normalizeWidgetPreferences({ summaryMetrics: "discharge" })
        .summaryMetrics,
    ).toEqual(defaultWidgetPreferences.summaryMetrics);
  });
});
