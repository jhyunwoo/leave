/**
 * 정기외박 기준일 단계 (네이티브).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 주기의 단위는 군종이 정한다 — 해·공군은 6주라 일 단위, 육군은 분기라 달 단위다.
 * 입력칸은 하나뿐이고 라벨과 허용 범위만 단위를 따라간다.
 *
 * 예전에는 규정 근거 패널을 늘 펼쳐 뒀는데, 질문 하나짜리 화면에 본문보다 긴
 * 각주가 붙는 꼴이었다. 접어두되 없애지는 않는다 — 공식 일정이 아니라는 고지와
 * 출처가 사라지면 안 되는 화면이다.
 */

import {
  REGULAR_OVERNIGHT_INTERVAL_LIMITS,
  REGULAR_OVERNIGHT_SOURCES,
  REGULAR_OVERNIGHT_VERIFIED_AT,
  isRegularOvernightIntervalValid,
  isValidISODate,
  regularOvernightFirstGrantPreview,
  regularOvernightGuidance,
  type Branch,
  type ISODate,
  type RegularOvernightIntervalForm,
} from "@leave/shared";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { DatePickerRow } from "@/components/date-picker";
import { Input } from "@/components/field";
import { NativeCheckbox } from "@/components/native-checkbox";
import { makeStyles, radius, spacing } from "@/theme";
import { StepError, StepNext, StepShell, StepSkip } from "./step-shell";

export function OvernightStep(props: {
  branch: Branch;
  value: string;
  onChange: (value: string) => void;
  /** 주기의 단위. 군종에서 정해져 화면에서는 바꾸지 않는다. */
  intervalUnit: RegularOvernightIntervalForm["unit"];
  /** 주기·회당은 문자열로 들고 있는다 — 아래 주석 참고. */
  interval: string;
  onIntervalChange: (value: string) => void;
  daysPerGrant: string;
  onDaysPerGrantChange: (value: string) => void;
  /** 주기가 끝나도 남길지. 부대마다 달라 기준일과 함께 여기서 묻는다. */
  carryOver: boolean;
  onCarryOverChange: (value: boolean) => void;
  error: string | null;
  pending: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  const guidance = regularOvernightGuidance(props.branch);
  const limits = REGULAR_OVERNIGHT_INTERVAL_LIMITS[props.intervalUnit];
  const form = {
    unit: props.intervalUnit,
    value: Number(props.interval),
  } satisfies RegularOvernightIntervalForm;
  const perGrant = Number(props.daysPerGrant);
  // 서버 스키마(regularOvernightConfigSchema)와 같은 범위를 미리 막아 준다.
  const intervalOk = isRegularOvernightIntervalValid(form);
  const perGrantOk =
    Number.isInteger(perGrant) && perGrant >= 1 && perGrant <= 30;
  const ready = isValidISODate(props.value) && intervalOk && perGrantOk;
  const firstGrant = regularOvernightFirstGrantPreview(props.value, form);

  return (
    <StepShell step="overnight" lead={guidance.summary}>
      <DatePickerRow
        label="주기 기준일"
        value={props.value as ISODate | ""}
        onChange={props.onChange}
        testID="onboarding-overnight-start"
      />

      {/* 기본값은 군별 통상 운영(육군 3개월 1박 2일, 해·공군 6주 2박 3일)이지만
          부대마다 다르다. 예전에는 읽기 전용 타일이라 온보딩을 끝내고 보유 휴가
          화면까지 들어가야 고칠 수 있었다.
          값을 문자열로 들고 있는 건 지우는 중간 상태를 허용하기 위해서다.
          숫자로 강제하면 마지막 한 자를 지우는 순간 1로 튀어 되고쳐야 한다. */}
      <View style={styles.metrics}>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>{limits.label}</Text>
          <Input
            value={props.interval}
            onChangeText={props.onIntervalChange}
            keyboardType="number-pad"
            accessibilityLabel={`정기외박 주기 ${limits.unitLabel}`}
            testID="onboarding-overnight-interval"
          />
        </View>
        <View style={styles.metric}>
          <Text style={styles.metricLabel}>회당 적립 (일)</Text>
          <Input
            value={props.daysPerGrant}
            onChangeText={props.onDaysPerGrantChange}
            keyboardType="number-pad"
            accessibilityLabel="정기외박 회당 적립 일수"
            testID="onboarding-overnight-days"
          />
        </View>
      </View>

      {/* 이월 여부도 "우리 부대 정기외박이 어떻게 도는가"의 일부라 기준일·주기와
          같은 화면에 둔다. 나중에 보유 휴가 화면에서 언제든 바꿀 수 있다. */}
      <View style={styles.carryOver}>
        <NativeCheckbox
          value={props.carryOver}
          onValueChange={props.onCarryOverChange}
          label="주기가 끝나도 이월돼요"
          testID="onboarding-overnight-carry-over"
        />
        <Text style={styles.carryOverHint}>
          안 쓴 정기외박이 사라지지 않고 쌓이는 부대라면 켜주세요.
        </Text>
      </View>

      {firstGrant ? (
        <Animated.Text entering={FadeIn.duration(240)} style={styles.live}>
          첫 사용 가능 주기는{" "}
          <Text style={styles.liveStrong}>{firstGrant}</Text>
          부터예요.
          {props.carryOver ? " 안 쓴 몫은 그 뒤로도 쌓여요." : ""}
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
        disabled={!ready}
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
  /* 값을 못 고치던 시절엔 테두리 두른 타일이었다. 이제 입력칸이라 껍데기를
     걷고 라벨 + 인풋 한 벌로 둔다. */
  metric: { flex: 1, gap: spacing.xs },
  carryOver: { gap: spacing.xs },
  carryOverHint: { color: colors.mute, fontSize: 12, lineHeight: 18 },
  metricLabel: { fontSize: 13, fontWeight: "600", color: colors.ink },
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
