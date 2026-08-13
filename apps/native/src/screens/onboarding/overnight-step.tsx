/**
 * 정기외박 기준일 단계 (해군·공군만, 네이티브).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 예전에는 규정 근거 패널을 늘 펼쳐 뒀는데, 질문 하나짜리 화면에 본문보다 긴
 * 각주가 붙는 꼴이었다. 접어두되 없애지는 않는다 — 공식 일정이 아니라는 고지와
 * 출처가 사라지면 안 되는 화면이다.
 */

import {
  REGULAR_OVERNIGHT_DEFAULTS,
  REGULAR_OVERNIGHT_SOURCES,
  REGULAR_OVERNIGHT_VERIFIED_AT,
  addDays,
  isValidISODate,
  regularOvernightGuidance,
  type Branch,
  type ISODate,
} from "@leave/shared";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DatePickerRow } from "@/components/date-picker";
import { makeStyles, radius, spacing } from "@/theme";
import { StepError, StepNext, StepShell, StepSkip } from "./step-shell";

export function OvernightStep(props: {
  branch: Branch;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  pending: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const guidance = regularOvernightGuidance(props.branch);
  if (!guidance) return null;

  return (
    <StepShell step="overnight" lead={guidance.summary}>
      <DatePickerRow
        label="주기 기준일"
        value={props.value as ISODate | ""}
        onChange={props.onChange}
        testID="onboarding-overnight-start"
      />

      <View style={styles.metrics}>
        <ContentPanel style={styles.metric}>
          <Text style={styles.metricLabel}>주기</Text>
          <Text style={styles.metricValue}>
            {REGULAR_OVERNIGHT_DEFAULTS.intervalDays}일
          </Text>
        </ContentPanel>
        <ContentPanel style={styles.metric}>
          <Text style={styles.metricLabel}>회당</Text>
          <Text style={styles.metricValue}>
            {REGULAR_OVERNIGHT_DEFAULTS.daysPerGrant}일
          </Text>
        </ContentPanel>
      </View>

      {isValidISODate(props.value) ? (
        <Animated.Text entering={FadeIn.duration(240)} style={styles.live}>
          첫 사용 가능 주기는{" "}
          <Text style={styles.liveStrong}>
            {addDays(
              props.value as ISODate,
              REGULAR_OVERNIGHT_DEFAULTS.intervalDays,
            )}
          </Text>
          부터예요.
        </Animated.Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((v) => !v)}
        style={styles.disclosure}
      >
        <Text style={styles.disclosureLabel}>
          규정과 실제 운영이 어떻게 다른가요?
        </Text>
        <Text style={styles.disclosureChevron}>{open ? "⌃" : "⌄"}</Text>
      </Pressable>

      {open ? (
        <Animated.View entering={FadeIn.duration(200)}>
          <ContentPanel>
            <Text style={styles.note}>
              {guidance.disclaimer}
              {"\n\n"}
              {guidance.detail}
            </Text>
            {REGULAR_OVERNIGHT_SOURCES.map((source) => (
              <Button
                key={source.url}
                title={source.label}
                variant="ghost"
                size="sm"
                onPress={() => void Linking.openURL(source.url)}
              />
            ))}
            <Text style={styles.fineprint}>
              공개 자료 확인 {REGULAR_OVERNIGHT_VERIFIED_AT} · 공식 일정 확정
              기능이 아니며 소속 부대 지침이 우선합니다.
            </Text>
          </ContentPanel>
        </Animated.View>
      ) : null}

      <StepError message={props.error} />
      <StepNext
        disabled={!isValidISODate(props.value)}
        pending={props.pending}
        onPress={props.onNext}
      />
      <StepSkip
        label="기준일을 몰라요 · 나중에 설정"
        onPress={props.onSkip}
        testID="onboarding-overnight-skip"
      />
    </StepShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  metrics: { flexDirection: "row", gap: spacing.md },
  metric: {
    flex: 1,
    padding: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  metricLabel: { fontSize: 13, color: colors.body },
  metricValue: { fontSize: 20, fontWeight: "800", color: colors.ink },
  live: { fontSize: 13, lineHeight: 20, color: colors.body },
  liveStrong: { fontWeight: "700", color: colors.ink },
  disclosure: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderCurve: "continuous",
  },
  disclosureLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  disclosureChevron: { fontSize: 14, color: colors.mute },
  note: { fontSize: 13, lineHeight: 20, color: colors.body },
  fineprint: { fontSize: 12, lineHeight: 18, color: colors.mute },
}));
