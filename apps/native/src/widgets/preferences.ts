/**
 * "이 기기의 위젯은 무엇을 보여줄까" — 인앱 위젯 설정이 쓰는 값.
 *
 * 사용처: screens/widget-settings.tsx가 읽고 쓰고, widget-sync.native.tsx가
 * 위젯 props에 실어 보낸다.
 *
 * ## 왜 인앱 설정이 따로 필요한가
 *
 * iOS 17+에서는 위젯을 길게 눌러 지표를 고를 수 있다(app.json의 `configuration`).
 * 그런데 **Android는 위젯별 설정 화면이 없다** — expo-widgets의 안드로이드 플러그인이
 * configuration activity를 만들지 않아, 위젯을 길게 눌러도 고를 화면이 없다.
 * 그 자리에서 위젯이 무엇을 보여줄지 정할 방법이 앱 안 말고는 없다.
 * (iOS 16.x에는 지표 위젯 자체가 없다 — 자세한 배경은 docs/widgets.md.)
 *
 * 요약 위젯은 지표가 여럿이라 어느 플랫폼에서도 위젯 편집만으로는 고를 수 없다.
 * 그래서 구성은 항상 여기서 온다.
 *
 * 서버에 올리지 않는다 — 기기마다 위젯을 다르게 두는 것이 자연스럽고,
 * 계정 데이터가 아니라 이 홈 화면의 취향이다.
 */

import {
  DEFAULT_METRIC,
  DEFAULT_SUMMARY_METRICS,
  SUMMARY_METRIC_MAX,
  SUMMARY_METRIC_MIN,
  isMetricKey,
  type MetricKey,
} from "./metrics";
import { widgetStorage } from "./storage";

const STORAGE_KEY = "leave.widget.preferences";

export type WidgetPreferences = {
  /** 위젯별 편집을 쓸 수 없는 자리(Android·iOS 16)에서 지표 위젯이 보여줄 지표. */
  defaultMetric: MetricKey;
  /** 요약 위젯이 순서대로 보여줄 지표. */
  summaryMetrics: MetricKey[];
};

export const defaultWidgetPreferences: WidgetPreferences = {
  defaultMetric: DEFAULT_METRIC,
  summaryMetrics: [...DEFAULT_SUMMARY_METRICS],
};

/**
 * 저장된 값을 지금 코드가 아는 모양으로 좁힌다.
 *
 * 지표를 없애거나 이름을 바꾼 버전으로 업데이트하면, 기기에는 이제 존재하지 않는
 * key가 남아 있다. 그대로 쓰면 위젯이 빈 칸을 그리므로 읽는 자리에서 걸러낸다.
 */
export function normalizeWidgetPreferences(value: unknown): WidgetPreferences {
  const raw = (value ?? {}) as Partial<
    Record<keyof WidgetPreferences, unknown>
  >;

  const defaultMetric = isMetricKey(raw.defaultMetric)
    ? raw.defaultMetric
    : defaultWidgetPreferences.defaultMetric;

  const summary = Array.isArray(raw.summaryMetrics)
    ? raw.summaryMetrics.filter(isMetricKey)
    : [];
  // 중복은 화면에 같은 칸을 두 번 그린다. 순서는 사용자가 고른 순서를 지킨다.
  const unique = [...new Set(summary)].slice(0, SUMMARY_METRIC_MAX);

  return {
    defaultMetric,
    summaryMetrics:
      unique.length >= SUMMARY_METRIC_MIN
        ? unique
        : [...defaultWidgetPreferences.summaryMetrics],
  };
}

/**
 * 지금 값. 저장소는 비동기라 화면이 첫 프레임에 기다리지 않도록 메모리에 들고 있고,
 * `loadWidgetPreferences`가 한 번 채운 뒤로는 여기서만 읽는다.
 */
let current: WidgetPreferences = defaultWidgetPreferences;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeWidgetPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getWidgetPreferences(): WidgetPreferences {
  return current;
}

/** 저장소에서 한 번 읽어 온다. 두 번 불러도 한 번만 읽는다. */
export async function loadWidgetPreferences(): Promise<WidgetPreferences> {
  if (loaded) return current;
  loaded = true;
  try {
    const stored = await widgetStorage.getItem(STORAGE_KEY);
    if (stored) current = normalizeWidgetPreferences(JSON.parse(stored));
  } catch {
    // 못 읽으면 기본값으로 간다. 설정 하나 때문에 위젯이 멈추면 안 된다.
  }
  emit();
  return current;
}

export async function saveWidgetPreferences(
  next: WidgetPreferences,
): Promise<WidgetPreferences> {
  current = normalizeWidgetPreferences(next);
  loaded = true;
  emit();
  try {
    await widgetStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 저장 실패는 이번 실행을 막지 않는다 — 메모리 값으로 계속 동작한다.
  }
  return current;
}

/** 테스트 전용. 모듈 상태를 처음으로 되돌린다. */
export function resetWidgetPreferencesForTest(): void {
  current = defaultWidgetPreferences;
  loaded = false;
  listeners.clear();
}
