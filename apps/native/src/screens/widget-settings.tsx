/**
 * 위젯 설정 화면 — 홈 화면 위젯이 무엇을 보여줄지 이 기기에서 고른다.
 *
 * 사용처: 라우트 `app/widget-settings.tsx`. 프로필 탭에서 들어온다.
 *
 * 값의 의미와 "왜 앱 안에서도 골라야 하는가"는 `widgets/preferences.ts` 머리주석에
 * 있다. 이 화면은 그 값을 고르는 방법만 담는다.
 */

import { ScrollView, Pressable, Text, View } from "react-native";
import { ContentPanel } from "@/components/content-panel";
import { NativeCheckbox } from "@/components/native-checkbox";
import { ResponsiveGrid, useWindowSizeClass } from "@/adaptive";
import { layout, makeStyles, radius, spacing } from "@/theme";
import {
  METRIC_DESCRIPTIONS,
  METRIC_KEYS,
  METRIC_TITLES,
  SUMMARY_MEDIUM_SLOTS,
  SUMMARY_METRIC_MAX,
  SUMMARY_METRIC_MIN,
  type MetricKey,
} from "@/widgets/metrics";
import { saveWidgetPreferences } from "@/widgets/preferences";
import { useWidgetPreferences } from "@/widgets/use-widget-preferences";

export function WidgetSettingsScreen() {
  const styles = useStyles();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const preferences = useWidgetPreferences();

  const chooseDefault = (defaultMetric: MetricKey) => {
    void saveWidgetPreferences({ ...preferences, defaultMetric });
  };

  const toggleSummary = (key: MetricKey, next: boolean) => {
    // 범위를 벗어나는 조작은 여기서 막는다. 그대로 저장하면
    // `normalizeWidgetPreferences`가 기본 구성으로 되돌려, 지표 하나를 뺐을 뿐인데
    // 고른 것이 통째로 바뀐 것처럼 보인다.
    const count = preferences.summaryMetrics.length;
    if (!next && count <= SUMMARY_METRIC_MIN) return;
    if (next && count >= SUMMARY_METRIC_MAX) return;

    // 고른 순서가 위젯에 그려지는 순서다. 그래서 켤 때는 뒤에 붙이고,
    // 끌 때는 그 자리만 뺀다 — 목록 순서로 다시 정렬하지 않는다.
    const summaryMetrics = next
      ? [...preferences.summaryMetrics, key]
      : preferences.summaryMetrics.filter((item) => item !== key);
    void saveWidgetPreferences({ ...preferences, summaryMetrics });
  };

  const chosen = preferences.summaryMetrics;
  const atMin = chosen.length <= SUMMARY_METRIC_MIN;
  const atMax = chosen.length >= SUMMARY_METRIC_MAX;

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: isCompact
            ? layout.readableContent
            : layout.workspaceContent,
        },
      ]}
      testID="widget-settings"
    >
      {process.env.EXPO_OS === "web" && (
        <Text style={styles.webTitle}>위젯 설정</Text>
      )}

      <ResponsiveGrid sizeClass={sizeClass} columns={{ compact: 1, medium: 2 }}>
        <ContentPanel style={styles.card}>
          <Text selectable style={styles.cardTitle}>
            지표 위젯
          </Text>
          <Text selectable style={styles.cardBody}>
            작은 위젯과 잠금화면 위젯이 보여줄 지표예요. iPhone에서는 위젯을
            길게 눌러 위젯마다 따로 고를 수 있고 그 선택이 우선합니다. 여기서
            고른 값은 Android에서 쓰이고, 고른 지표에 보여줄 값이 없을 때도
            여기로 돌아와요.
          </Text>
          <View accessibilityRole="radiogroup" style={styles.list}>
            {METRIC_KEYS.map((key) => {
              const selected = preferences.defaultMetric === key;
              return (
                <Pressable
                  key={key}
                  accessibilityRole="radio"
                  accessibilityState={{ selected, checked: selected }}
                  // react-native-web은 role="radio"에 accessibilityState를 옮겨 주지
                  // 않는다 — 눈에는 점이 찍히는데 스크린리더는 무엇이 골라졌는지
                  // 모른다. components/native-checkbox.tsx가 같은 이유로 같은 일을 한다.
                  aria-checked={selected}
                  onPress={() => chooseDefault(key)}
                  style={styles.row}
                  testID={`widget-default-${key}`}
                >
                  <View style={[styles.radio, selected && styles.radioOn]}>
                    {selected ? <View style={styles.radioDot} /> : null}
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{METRIC_TITLES[key]}</Text>
                    <Text style={styles.rowBody}>
                      {METRIC_DESCRIPTIONS[key]}
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        </ContentPanel>

        <ContentPanel style={styles.card}>
          <Text selectable style={styles.cardTitle}>
            요약 위젯
          </Text>
          <Text selectable style={styles.cardBody}>
            중간·큰 위젯에 고른 순서대로 놓여요. {SUMMARY_METRIC_MIN}~
            {SUMMARY_METRIC_MAX}개까지 고를 수 있고, 중간 크기에는 앞의{" "}
            {SUMMARY_MEDIUM_SLOTS}개까지 들어갑니다.
          </Text>
          <View style={styles.list}>
            {METRIC_KEYS.map((key) => {
              const order = chosen.indexOf(key);
              const selected = order >= 0;
              return (
                <View key={key} style={styles.checkRow}>
                  <View style={styles.checkBody}>
                    <NativeCheckbox
                      value={selected}
                      onValueChange={(next) => toggleSummary(key, next)}
                      label={METRIC_TITLES[key]}
                      testID={`widget-summary-${key}`}
                    />
                  </View>
                  {selected ? (
                    <View style={styles.orderBadge}>
                      <Text style={styles.orderBadgeText}>{order + 1}</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}
          </View>
          {atMin ? (
            <Text selectable style={styles.hint}>
              최소 {SUMMARY_METRIC_MIN}개는 남겨 주세요. 하나를 빼려면 다른
              지표를 먼저 고르면 됩니다.
            </Text>
          ) : null}
          {atMax ? (
            <Text selectable style={styles.hint}>
              {SUMMARY_METRIC_MAX}개까지 고를 수 있어요.
            </Text>
          ) : null}
        </ContentPanel>

        <ContentPanel style={styles.card}>
          <Text selectable style={styles.cardTitle}>
            위젯을 아직 못 찾았다면
          </Text>
          <Text selectable style={styles.cardBody}>
            홈 화면의 빈 곳을 길게 누른 다음 위젯 추가에서 &quot;리브&quot;를
            찾으면 돼요. 값이 남이 바꾸는 것(출타 여유)과 보유 휴가는 앱을 열 때
            새로 받아오고, 나머지 D-Day는 앱을 켜지 않아도 매일 스스로
            줄어듭니다.
          </Text>
        </ContentPanel>
      </ResponsiveGrid>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  webTitle: { fontSize: 28, fontWeight: "800", color: colors.ink },
  card: { padding: spacing.xl, gap: spacing.md },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  cardBody: { fontSize: 13, lineHeight: 20, color: colors.body },
  list: { gap: spacing.xs },
  row: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontSize: 15, fontWeight: "600", color: colors.ink },
  rowBody: { fontSize: 12, lineHeight: 17, color: colors.mute },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.hairline,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  radioOn: { borderColor: colors.primary },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.primary,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  checkBody: { flex: 1, minWidth: 0 },
  orderBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    backgroundColor: colors.primaryPale,
    alignItems: "center",
    justifyContent: "center",
  },
  orderBadgeText: { fontSize: 12, fontWeight: "700", color: colors.inkDeep },
  hint: { fontSize: 12, color: colors.mute },
}));
