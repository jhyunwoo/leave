import { describe, expect, it } from "vitest";
import {
  buildWidgetTimeline,
  TIMELINE_DAYS,
  type WidgetSource,
} from "../src/widgets/payload";
import {
  DEFAULT_METRIC,
  DEFAULT_SUMMARY_METRICS,
} from "../src/widgets/metrics";

/** 2026-06-15(월) 09:00 KST. 공휴일이 없는 두 주의 시작. */
const NOW = new Date("2026-06-15T00:00:00.000Z");
const TODAY = "2026-06-15";

function leave(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "leave-1",
    title: "정기외박",
    startDate: "2026-06-20",
    endDate: "2026-06-22",
    status: "approved",
    reason: null,
    segments: [],
    ...over,
  } as unknown as WidgetSource["leaves"][number];
}

function source(over: Partial<WidgetSource> = {}): WidgetSource {
  return {
    state: "ready",
    today: TODAY,
    profile: {
      enlistedAt: "2025-06-15",
      dischargeAt: "2026-12-14",
      rank: "corporal",
    },
    dutyDaysToday: 100,
    leaves: [leave()],
    unitHolidays: [],
    leaveRanges: [{ startDate: "2026-06-20", endDate: "2026-06-22" }],
    snapshot: {
      holdings: { remaining: 12, planned: 3, expiringSoon: 0, expired: 0 },
      headroom: {
        date: "2026-06-20",
        count: 4,
        allowed: 10,
        blocked: false,
      },
    },
    defaultMetric: DEFAULT_METRIC,
    summaryMetrics: DEFAULT_SUMMARY_METRICS,
    ...over,
  };
}

describe("위젯 타임라인", () => {
  it("오늘부터 14일치를 날짜 순서로 만든다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    expect(entries).toHaveLength(TIMELINE_DAYS);
    expect(entries.map((entry) => entry.props.date)).toEqual([
      "2026-06-15",
      "2026-06-16",
      "2026-06-17",
      "2026-06-18",
      "2026-06-19",
      "2026-06-20",
      "2026-06-21",
      "2026-06-22",
      "2026-06-23",
      "2026-06-24",
      "2026-06-25",
      "2026-06-26",
      "2026-06-27",
      "2026-06-28",
    ]);
    for (let i = 1; i < entries.length; i += 1) {
      expect(entries[i]!.date.getTime()).toBeGreaterThan(
        entries[i - 1]!.date.getTime(),
      );
    }
  });

  it("첫 엔트리는 자정이 아니라 지금이다", () => {
    // 앱에서 밀어 넣은 값이 다음 자정까지 기다리지 않고 바로 보여야 한다.
    const entries = buildWidgetTimeline(source(), NOW);
    expect(entries[0]!.date).toEqual(NOW);
    // 그 다음부터는 한국시간 자정 = UTC 15:00.
    expect(entries[1]!.date.toISOString()).toBe("2026-06-15T15:00:00.000Z");
  });

  it("전역 D-Day가 하루씩 줄어든다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    expect(entries[0]!.props.metrics.discharge?.value).toBe("D-182");
    expect(entries[1]!.props.metrics.discharge?.value).toBe("D-181");
    expect(entries[13]!.props.metrics.discharge?.value).toBe("D-169");
  });

  it("전역 당일은 D-DAY, 그 뒤로는 지표가 사라진다", () => {
    const entries = buildWidgetTimeline(
      source({
        profile: {
          enlistedAt: "2025-06-15",
          dischargeAt: "2026-06-17",
          rank: "sergeant",
        },
      }),
      NOW,
    );
    expect(entries[2]!.props.metrics.discharge?.value).toBe("D-DAY");
    expect(entries[3]!.props.metrics.discharge).toBeUndefined();
  });

  it("남은 일과일은 지나간 일과일만큼 줄어든다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    // 6/15(월) 기준 100일. 6/16에는 6/15 하루를 보냈으므로 99.
    expect(entries[0]!.props.metrics.dutyDays?.value).toBe("100일");
    expect(entries[1]!.props.metrics.dutyDays?.value).toBe("99일");
    // 6/20(토)에 서면 6/15~6/19 다섯 날을 보냈다.
    expect(entries[5]!.props.metrics.dutyDays?.value).toBe("95일");
    // 주말(6/20·6/21)은 일과일이 아니라 값이 그대로 유지된다.
    expect(entries[6]!.props.metrics.dutyDays?.value).toBe("95일");
    // 6/22(월)은 휴가라 역시 빠진다 — 6/23에도 95일 그대로.
    expect(entries[8]!.props.metrics.dutyDays?.value).toBe("95일");
    // 6/23(화)을 보내고 나서야 하나 줄어든다.
    expect(entries[9]!.props.metrics.dutyDays?.value).toBe("94일");
  });

  it("남은 일과일은 0 아래로 내려가지 않는다", () => {
    const entries = buildWidgetTimeline(source({ dutyDaysToday: 2 }), NOW);
    expect(entries[13]!.props.metrics.dutyDays?.value).toBe("0일");
  });

  it("다음 휴가 D-Day가 휴가 중에는 복귀까지로 바뀐다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    expect(entries[0]!.props.metrics.nextLeave).toMatchObject({
      label: "다음 휴가",
      value: "D-5",
    });
    // 6/20 시작 — 그날은 휴가 중이고 종료(6/22)까지 이틀.
    expect(entries[5]!.props.metrics.nextLeave).toMatchObject({
      label: "휴가 중",
      value: "D-2",
    });
    // 6/22는 마지막 날.
    expect(entries[7]!.props.metrics.nextLeave?.value).toBe("D-DAY");
    // 휴가가 끝나면 셀 것이 없다.
    expect(entries[8]!.props.metrics.nextLeave).toBeUndefined();
  });

  it("초안·반려 휴가는 세지 않는다", () => {
    const entries = buildWidgetTimeline(
      source({ leaves: [leave({ status: "draft" })] }),
      NOW,
    );
    expect(entries[0]!.props.metrics.nextLeave).toBeUndefined();
  });

  it("복무율은 날마다 오른다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    const first = entries[0]!.props.metrics.progress!;
    const last = entries[13]!.props.metrics.progress!;
    expect(first.gauge).toBeGreaterThan(0);
    expect(last.gauge!).toBeGreaterThan(first.gauge!);
    expect(first.value).toMatch(/^\d+%$/);
  });

  it("병장은 진급 지표가 없다", () => {
    const withRank = (rank: "corporal" | "sergeant") =>
      buildWidgetTimeline(
        source({
          profile: {
            enlistedAt: "2025-06-15",
            dischargeAt: "2026-12-14",
            rank,
          },
        }),
        NOW,
      )[0]!.props.metrics.promotion;
    expect(withRank("corporal")).toBeDefined();
    expect(withRank("sergeant")).toBeUndefined();
  });

  it("그룹에 속하지 않으면 출타 여유가 없다", () => {
    const entries = buildWidgetTimeline(
      source({ snapshot: { holdings: null, headroom: null } }),
      NOW,
    );
    expect(entries[0]!.props.metrics.headroom).toBeUndefined();
    expect(entries[0]!.props.metrics.balance).toBeUndefined();
    // 나머지 지표는 그대로 나온다 — 그룹은 휴가 계산의 전제가 아니다.
    expect(entries[0]!.props.metrics.discharge).toBeDefined();
  });

  it("출타 기준을 정하지 않은 그룹은 여유를 말하지 않는다", () => {
    const entries = buildWidgetTimeline(
      source({
        snapshot: {
          holdings: null,
          headroom: {
            date: "2026-06-20",
            count: 4,
            allowed: 0,
            blocked: false,
          },
        },
      }),
      NOW,
    );
    expect(entries[0]!.props.metrics.headroom).toBeUndefined();
  });

  it("스냅샷 지표는 굴러가지 않고 기준 시각을 남긴다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    const values = entries.map((entry) => entry.props.metrics.balance?.value);
    expect(new Set(values)).toEqual(new Set(["12일"]));
    expect(entries[0]!.props.metrics.headroom?.value).toBe("6명");
    for (const entry of entries) {
      expect(entry.props.asOf).toBe(NOW.toISOString());
    }
  });

  it("복무정보가 없으면 날짜 지표를 만들지 않는다", () => {
    const entries = buildWidgetTimeline(
      source({ profile: null, dutyDaysToday: null }),
      NOW,
    );
    expect(entries[0]!.props.metrics.discharge).toBeUndefined();
    expect(entries[0]!.props.metrics.progress).toBeUndefined();
    expect(entries[0]!.props.metrics.dutyDays).toBeUndefined();
  });

  it("로그인 전에는 엔트리 하나만 만든다", () => {
    const entries = buildWidgetTimeline(source({ state: "signedOut" }), NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.props.state).toBe("signedOut");
    expect(entries[0]!.props.metrics).toEqual({});
  });

  it("스크린리더 문장은 D-표기를 풀어 쓴다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    expect(entries[0]!.props.metrics.discharge?.spoken).toBe(
      "전역까지 182일 남았어요",
    );
    expect(entries[7]!.props.metrics.nextLeave?.spoken).toBe(
      "오늘이 휴가 마지막 날이에요",
    );
  });
});

describe("위젯 props는 property list 로 저장할 수 있어야 한다", () => {
  /**
   * iOS는 위젯 props를 App Group UserDefaults에 그대로 넣는다
   * (`WidgetsStorage.set` → `UserDefaults.set`). **`null`과 `undefined`는
   * property-list 타입이 아니라 그 write 전체가 거부된다** — 그러면
   * `updateTimeline`이 네이티브에서 던지고, 위젯은 마지막으로 성공한 값에
   * 머문 채 조용히 낡는다.
   *
   * 1.1.0(build 42)에서 실제로 났던 일이다. `gauge: null` 하나 때문에 홈 화면
   * 위젯이 "복무정보를 입력하세요"에서 움직이지 않았고, 앱에는 아무 증상이
   * 없어 Sentry(`source: home_widget`)로만 드러났다.
   */
  function nullishPaths(value: unknown, path = "props"): string[] {
    if (value === null) return [`${path} = null`];
    if (value === undefined) return [`${path} = undefined`];
    if (Array.isArray(value)) {
      return value.flatMap((item, i) => nullishPaths(item, `${path}[${i}]`));
    }
    if (typeof value === "object") {
      return Object.entries(value as Record<string, unknown>).flatMap(
        ([key, item]) => nullishPaths(item, `${path}.${key}`),
      );
    }
    return [];
  }

  it("모든 엔트리에 null·undefined가 없다", () => {
    const entries = buildWidgetTimeline(source(), NOW);
    const offenders = entries.flatMap((entry, i) =>
      nullishPaths(entry.props, `entries[${i}].props`),
    );
    expect(offenders).toEqual([]);
  });

  it("값이 없는 지표·비어 있는 상태에서도 없다", () => {
    for (const built of [
      buildWidgetTimeline(source({ state: "signedOut" }), NOW),
      buildWidgetTimeline(source({ state: "needsOnboarding" }), NOW),
      buildWidgetTimeline(
        source({
          profile: null,
          dutyDaysToday: null,
          leaves: [],
          snapshot: { holdings: null, headroom: null },
        }),
        NOW,
      ),
    ]) {
      const offenders = built.flatMap((entry, i) =>
        nullishPaths(entry.props, `entries[${i}].props`),
      );
      expect(offenders).toEqual([]);
    }
  });

  it("저장 가능한 값만 남는다 (문자열·숫자·불리언·배열·객체)", () => {
    function badTypes(value: unknown, path = "props"): string[] {
      if (Array.isArray(value)) {
        return value.flatMap((item, i) => badTypes(item, `${path}[${i}]`));
      }
      if (value !== null && typeof value === "object") {
        return Object.entries(value as Record<string, unknown>).flatMap(
          ([key, item]) => badTypes(item, `${path}.${key}`),
        );
      }
      return ["string", "number", "boolean"].includes(typeof value)
        ? []
        : [`${path} = ${typeof value}`];
    }
    const entries = buildWidgetTimeline(source(), NOW);
    expect(entries.flatMap((e) => badTypes(e.props))).toEqual([]);
  });
});
