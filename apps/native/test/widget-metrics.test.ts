/**
 * `app.json`의 위젯 설정과 `src/widgets/metrics.ts`가 어긋나지 않는지 본다.
 *
 * iOS는 위젯 편집 메뉴를 `app.json`의 enum에서 만들고, 고른 값은 문자열 그대로
 * 위젯 코드에 들어온다. 두 목록이 갈라지면 편집에서 고른 지표가 코드에 없는 key가
 * 되어 위젯이 조용히 빈 화면을 그린다 — 실행해 보기 전에는 드러나지 않는 종류의
 * 어긋남이라 여기서 잡는다.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import appConfig from "../app.json";
import {
  DEFAULT_METRIC,
  DEFAULT_SUMMARY_METRICS,
  METRIC_DESCRIPTIONS,
  METRIC_KEYS,
  METRIC_LINKS,
  METRIC_TITLES,
  METRICS_PENDING_IOS_MENU,
  SUMMARY_METRIC_MAX,
  SUMMARY_METRIC_MIN,
  isMetricKey,
} from "../src/widgets/metrics";

type WidgetPluginConfig = {
  groupIdentifier: string;
  enableAndroid: boolean;
  widgets: {
    name: string;
    displayName: string;
    description: string;
    supportedFamilies: string[];
    configuration?: {
      parameters: {
        metric: {
          type: string;
          default: string;
          values: { name: string; value: string }[];
        };
      };
    };
  }[];
};

// app.json은 리터럴 타입으로 추론되어 플러그인마다 다른 튜플이 된다. 우리가
// 확인하려는 것은 "이 표에 무엇이 적혀 있는가"이므로 모양을 다시 붙여 읽는다.
const plugins = appConfig.expo.plugins as unknown as (
  string | [string, Record<string, unknown>]
)[];
const widgetsPlugin = plugins.find(
  (plugin): plugin is [string, WidgetPluginConfig] =>
    Array.isArray(plugin) && plugin[0] === "expo-widgets",
);

describe("위젯 설정", () => {
  it("app.json에 expo-widgets 플러그인이 등록되어 있다", () => {
    expect(widgetsPlugin).toBeDefined();
  });

  const config = widgetsPlugin![1];
  const metricWidget = config.widgets.find(
    (widget) => widget.name === "LeaveMetric",
  );

  /**
   * 편집 목록은 여전히 **정확히 일치**해야 한다 — 다만 기준이 METRIC_KEYS 전체가
   * 아니라 "다음 빌드 대기분을 뺀 것"이다.
   *
   * 부분집합 검사로 느슨하게 풀지 않는 이유: 그러면 app.json을 **진짜로 빠뜨린**
   * 경우를 영영 못 잡는다. 대기분을 `METRICS_PENDING_IOS_MENU`에 손으로 적게 해
   * "지금은 일부러 뒤처져 있다"를 코드에 남기고, 적지 않으면 빌드에서 깨지게 둔다.
   */
  it("지표 위젯의 편집 목록이 METRIC_KEYS와 같다(다음 빌드 대기분 제외)", () => {
    const listed = METRIC_KEYS.filter(
      (key) => !METRICS_PENDING_IOS_MENU.includes(key),
    );
    const values = metricWidget!.configuration!.parameters.metric.values;
    expect(values.map((item) => item.value)).toEqual(listed);
    // 이름도 한 곳에서만 온다 — 편집 메뉴와 설정 화면이 다른 말을 쓰면 안 된다.
    expect(values.map((item) => item.name)).toEqual(
      listed.map((key) => METRIC_TITLES[key]),
    );
  });

  it("편집 메뉴 대기 목록은 실재하는 지표만 담는다", () => {
    // 지표를 지우거나 이름을 바꾼 뒤 이 목록만 남으면 조용히 뜻을 잃는다.
    for (const key of METRICS_PENDING_IOS_MENU) {
      expect(isMetricKey(key)).toBe(true);
      expect(METRIC_KEYS).toContain(key);
    }
    expect(new Set(METRICS_PENDING_IOS_MENU).size).toBe(
      METRICS_PENDING_IOS_MENU.length,
    );
    // 기본 지표가 대기 중이면 iOS 위젯이 첫 화면부터 고를 수 없는 값을 가리킨다.
    expect(METRICS_PENDING_IOS_MENU).not.toContain(DEFAULT_METRIC);
  });

  it("편집 목록의 기본값이 코드의 기본 지표와 같다", () => {
    expect(metricWidget!.configuration!.parameters.metric.default).toBe(
      DEFAULT_METRIC,
    );
    expect(isMetricKey(DEFAULT_METRIC)).toBe(true);
  });

  it("두 종류의 위젯을 등록한다", () => {
    expect(config.widgets.map((widget) => widget.name)).toEqual([
      "LeaveMetric",
      "LeaveSummary",
    ]);
    // 잠금화면(accessory*)은 지표 위젯에만 붙는다. 요약은 그 자리에 들어가지 않는다.
    // 목록을 통째로 못 박는 이유: 크기를 하나 더하면 레이아웃 함수에도 그 분기를
    // 넣어야 하는데(`environment.widgetFamily`), 빠뜨리면 조용히 소형 모양이 늘어난다.
    expect(metricWidget!.supportedFamilies).toEqual([
      "systemSmall",
      "systemMedium",
      "systemLarge",
      "accessoryCircular",
      "accessoryRectangular",
      "accessoryInline",
    ]);
    expect(
      config.widgets.find((widget) => widget.name === "LeaveSummary")!
        .supportedFamilies,
    ).toEqual(["systemMedium", "systemLarge"]);
  });

  it("App Group은 앱 번들 id에서 나온다", () => {
    // 기본값(`group.<bundleId>`)에 기대지 않고 못 박는다. 이 값이 바뀌면
    // 이미 배포된 위젯이 앱과 다른 상자를 보게 된다.
    expect(config.groupIdentifier).toBe(
      `group.${appConfig.expo.ios.bundleIdentifier}`,
    );
  });

  it("expo-widgets의 Android 스텁은 내보내지 않는다", () => {
    // expo-widgets 57.0.16의 안드로이드 구현은 껍데기다 — JS쪽 native 모듈은
    // `updateTimeline`이 빈 함수인 no-op 스텁이고, Glance 위젯은 `Text(widgetName)`
    // 한 줄이라 화면에 "LeaveMetric"이라는 글자가 그려진다. 켜 두면 동작하지 않는
    // 위젯을 내주지 않는다. Android는 로컬 leave-android-widgets 모듈이 담당한다.
    expect(config.enableAndroid).toBe(false);
  });

  it("모든 지표에 이름·설명·착지점이 있다", () => {
    for (const key of METRIC_KEYS) {
      expect(METRIC_TITLES[key]).toBeTruthy();
      expect(METRIC_DESCRIPTIONS[key]).toBeTruthy();
      // 위젯 전용 라우트를 만들지 않기로 했다 — 전부 `leave://` 스킴이어야 한다.
      expect(METRIC_LINKS[key]).toMatch(/^leave:\/\/\//);
    }
  });

  /**
   * 지표 위젯의 레이아웃 함수는 바깥 스코프를 볼 수 없어(`'widget'` 지시어 —
   * leave-metric.widget.tsx 머리주석) 대체 순서와 착지점 표를 함수 안에 리터럴로
   * 다시 적는다. 여기가 METRIC_KEYS와 갈라지면 새 지표가 대체 후보에서 빠지거나
   * 눌러도 홈으로 떨어지는데, iOS 위젯을 실제로 붙여 보기 전에는 드러나지 않는다.
   * app.json 표와 같은 이유로 같은 장치를 둔다.
   */
  const widgetSource = readFileSync(
    new URL("../src/widgets/leave-metric.widget.tsx", import.meta.url),
    "utf8",
  );

  it("지표 위젯 안에 다시 적힌 대체 순서가 METRIC_KEYS와 같다", () => {
    const order = widgetSource.match(/const order = \[([^\]]*)\]/)![1]!;
    expect([...order.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([
      ...METRIC_KEYS,
    ]);
  });

  it("지표 위젯 안에 다시 적힌 착지점이 METRIC_LINKS와 같다", () => {
    const links = widgetSource.match(
      /const links: Record<string, string> = \{([^}]*)\}/,
    )![1]!;
    expect(
      Object.fromEntries(
        [...links.matchAll(/(\w+): "([^"]+)"/g)].map((m) => [m[1], m[2]]),
      ),
    ).toEqual(METRIC_LINKS);
  });

  it("요약 위젯 기본 구성이 고를 수 있는 범위 안이다", () => {
    expect(DEFAULT_SUMMARY_METRICS.length).toBeGreaterThanOrEqual(
      SUMMARY_METRIC_MIN,
    );
    expect(DEFAULT_SUMMARY_METRICS.length).toBeLessThanOrEqual(
      SUMMARY_METRIC_MAX,
    );
    expect(new Set(DEFAULT_SUMMARY_METRICS).size).toBe(
      DEFAULT_SUMMARY_METRICS.length,
    );
    for (const key of DEFAULT_SUMMARY_METRICS)
      expect(isMetricKey(key)).toBe(true);
  });
});
