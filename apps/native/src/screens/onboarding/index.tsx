/**
 * 가입 후 필수 온보딩 — 한 화면에 질문 하나 (네이티브).
 *
 * 사용처: `app/onboarding.tsx`. `_layout.tsx`의 Stack.Protected가
 * `isAuthed && !onboardingComplete`일 때만 이 화면을 띄운다.
 *
 * 단계 구성은 웹과 같은 `ONBOARDING_STEP_IDS` 순서를 따르고, 육군은 정기외박
 * 단계를 건너뛴다(`onboardingSteps`). 위쪽 히어로는 답변이 쌓일수록 자라나므로
 * 단계가 늘어난 만큼 지루해지지 않는다.
 *
 * 서버 쓰기는 세 곳뿐이다.
 *  - 계급 단계의 "다음" : 프로필 다섯 필드를 한 벌로 PUT
 *  - 정기외박 단계     : 주기 설정 PUT (건너뛰면 enabled:false)
 *  - 마지막 단계       : 온보딩 완료 POST
 *
 * 프로필을 한 벌로 보내는 건 `onboardingProfileSchema`가 부분 저장을 받지 않기
 * 때문이다. 그래서 1~4단계 값은 이 컴포넌트가 들고 있는다.
 */

import {
  REGULAR_OVERNIGHT_DEFAULTS,
  isValidISODate,
  onboardingProfileSchema,
  onboardingResumeStep,
  onboardingStepIndex,
  onboardingSteps,
  scheduledRank,
  standardDischargeDate,
  todayInSeoul,
  type Branch,
  type ISODate,
  type OnboardingStepId,
  type Rank,
} from "@leave/shared";
import {
  useCompleteOnboarding,
  useOnboardingStatus,
  useSaveOnboardingProfile,
  useSaveOnboardingRegularOvernight,
  type OnboardingStatus,
} from "@leave/client";
import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { makeStyles, radius, spacing } from "@/theme";
import { DoneStep } from "./done-step";
import { GroupStep } from "./group-step";
import { OvernightStep } from "./overnight-step";
import {
  BranchStep,
  DatesStep,
  NameStep,
  RankStep,
  WelcomeStep,
} from "./profile-steps";
import { ServiceHero } from "./service-hero";

export function OnboardingScreen() {
  const query = useOnboardingStatus();
  if (!query.data) return null;
  return <OnboardingContent status={query.data} />;
}

function OnboardingContent({ status }: { status: OnboardingStatus }) {
  const styles = useStyles();
  const today = useMemo(() => todayInSeoul(), []);
  const profile = status.profile;

  const [step, setStep] = useState<OnboardingStepId>(() =>
    onboardingResumeStep(status),
  );
  const [name, setName] = useState(profile?.name ?? "");
  const [branch, setBranch] = useState<Branch>(profile?.branch ?? "army");
  const [enlistedAt, setEnlistedAt] = useState(profile?.enlistedAt ?? "");
  const [dischargeAt, setDischargeAt] = useState(profile?.dischargeAt ?? "");
  const [rank, setRank] = useState<Rank>(profile?.rank ?? "private");
  const [rankTouched, setRankTouched] = useState(Boolean(profile));
  const [startDate, setStartDate] = useState(
    status.regularOvernight?.startDate ?? "",
  );
  // 주기·회당은 통상 운영값을 깔아 두되 고칠 수 있게 한다. 이어하기를 위해
  // 저장된 값이 있으면 그쪽을 먼저 쓴다(startDate와 같은 규칙).
  // 문자열로 드는 이유는 OvernightStep의 주석 참고.
  const [intervalDays, setIntervalDays] = useState(
    String(
      status.regularOvernight?.intervalDays ??
        REGULAR_OVERNIGHT_DEFAULTS.intervalDays,
    ),
  );
  const [daysPerGrant, setDaysPerGrant] = useState(
    String(
      status.regularOvernight?.daysPerGrant ??
        REGULAR_OVERNIGHT_DEFAULTS.daysPerGrant,
    ),
  );
  const [inGroup, setInGroup] = useState(Boolean(status.unitId));
  const [error, setError] = useState<string | null>(null);

  const saveProfile = useSaveOnboardingProfile();
  const saveRegular = useSaveOnboardingRegularOvernight();
  const complete = useCompleteOnboarding();

  const order = onboardingSteps(branch);
  // 목록에 없는 단계(-1)라도 진행바가 범위를 벗어나지 않게 0으로 접는다.
  const index = Math.max(onboardingStepIndex(branch, step), 0);

  const go = (next: OnboardingStepId) => {
    setError(null);
    setStep(next);
  };

  // 군종을 바꾸면 단계 목록이 달라진다(육군은 정기외박이 빠진다). 현재 단계가
  // 목록에서 사라진 경우 indexOf가 -1이 되어 "다음"이 첫 화면으로 되감기므로,
  // 그럴 때는 목록의 처음이 아니라 마지막 단계 쪽으로 흐르게 한다.
  const advance = () => {
    const at = order.indexOf(step);
    const next = at === -1 ? "group" : order[at + 1];
    if (next) go(next);
  };

  const back = () => {
    const at = order.indexOf(step);
    const previous = at === -1 ? "rank" : order[at - 1];
    if (previous) go(previous);
  };

  /** 계급 단계의 "다음" — 여기서 프로필 한 벌이 처음 서버로 간다. */
  const submitProfile = async () => {
    const parsed = onboardingProfileSchema.safeParse({
      name,
      branch,
      enlistedAt,
      dischargeAt,
      rank,
    });
    if (!parsed.success)
      return setError(
        parsed.error.issues[0]?.message ?? "입력값을 확인해주세요",
      );
    setError(null);
    try {
      await saveProfile.mutateAsync(parsed.data);
      advance();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  const submitOvernight = async (skip = false) => {
    setError(null);
    try {
      await saveRegular.mutateAsync(
        skip || !isValidISODate(startDate)
          ? { enabled: false }
          : {
              enabled: true,
              startDate,
              intervalDays: Number(intervalDays),
              daysPerGrant: Number(daysPerGrant),
            },
      );
      if (skip) setStartDate("");
      advance();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  const finish = async () => {
    setError(null);
    try {
      await complete.mutateAsync();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "완료하지 못했습니다",
      );
    }
  };

  /** 날짜를 이미 받았다면 계급 기본값을 표준 진급표로 맞춰둔다. */
  const enterRankStep = () => {
    if (!rankTouched && isValidISODate(enlistedAt))
      setRank(scheduledRank(enlistedAt as ISODate, today));
    advance();
  };

  return (
    <KeyboardAvoidingView
      behavior={process.env.EXPO_OS === "ios" ? "padding" : undefined}
      style={styles.root}
    >
      <View style={styles.bar}>
        {/* 단계 표시는 숫자가 아니라 칸이다. "3 / 8"은 남은 개수를 먼저 보여주고,
            채워지는 칸은 지나온 만큼을 먼저 보여준다. */}
        <View
          style={styles.steps}
          accessibilityRole="progressbar"
          accessibilityLabel={`온보딩 ${index + 1} / ${order.length} 단계`}
          accessibilityValue={{ min: 1, max: order.length, now: index + 1 }}
        >
          {order.map((id, i) => (
            <View
              key={id}
              style={[
                styles.stepDot,
                i < index && styles.stepDone,
                i === index && styles.stepNow,
              ]}
            />
          ))}
        </View>
        {index > 0 ? (
          <Pressable
            accessibilityRole="button"
            onPress={back}
            style={styles.back}
            testID="onboarding-back"
          >
            <Text style={styles.backLabel}>뒤로</Text>
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <ServiceHero
          step={step}
          branch={branch}
          name={name}
          enlistedAt={enlistedAt}
          dischargeAt={dischargeAt}
          overnightStartDate={startDate}
          inGroup={inGroup}
          today={today}
        />

        <View key={step} testID={`onboarding-step-${step}`}>
          {step === "welcome" ? (
            <WelcomeStep onNext={advance} />
          ) : step === "name" ? (
            <NameStep
              value={name}
              onChange={setName}
              error={error}
              onNext={advance}
            />
          ) : step === "branch" ? (
            <BranchStep
              value={branch}
              onChange={(next) => {
                setBranch(next);
                // 전역일은 군종에 딸린 값이라 함께 다시 계산한다.
                if (isValidISODate(enlistedAt))
                  setDischargeAt(
                    standardDischargeDate(enlistedAt as ISODate, next),
                  );
              }}
              onNext={advance}
            />
          ) : step === "dates" ? (
            <DatesStep
              branch={branch}
              enlistedAt={enlistedAt}
              dischargeAt={dischargeAt}
              onChange={(next) => {
                setEnlistedAt(next.enlistedAt);
                setDischargeAt(next.dischargeAt);
              }}
              error={error}
              onNext={enterRankStep}
            />
          ) : step === "rank" ? (
            <RankStep
              enlistedAt={enlistedAt}
              value={rank}
              onChange={(next) => {
                setRank(next);
                setRankTouched(true);
              }}
              error={error}
              pending={saveProfile.isPending}
              onNext={() => void submitProfile()}
            />
          ) : step === "overnight" ? (
            <OvernightStep
              branch={branch}
              value={startDate}
              onChange={setStartDate}
              intervalDays={intervalDays}
              onIntervalDaysChange={setIntervalDays}
              daysPerGrant={daysPerGrant}
              onDaysPerGrantChange={setDaysPerGrant}
              error={error}
              pending={saveRegular.isPending}
              onNext={() => void submitOvernight()}
              onSkip={() => void submitOvernight(true)}
            />
          ) : step === "group" ? (
            <GroupStep
              inGroup={inGroup}
              onDone={(joined) => {
                setInGroup(joined);
                advance();
              }}
            />
          ) : (
            <DoneStep
              name={name}
              branch={branch}
              enlistedAt={enlistedAt}
              dischargeAt={dischargeAt}
              rank={rank}
              overnightStartDate={startDate}
              inGroup={inGroup}
              today={today}
              error={error}
              pending={complete.isPending}
              onComplete={() => void finish()}
            />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvas },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.md,
  },
  steps: { flex: 1, flexDirection: "row", gap: 5, alignItems: "center" },
  stepDot: {
    flex: 1,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.hairline,
  },
  stepDone: { backgroundColor: colors.positive },
  stepNow: { height: 7, backgroundColor: colors.primary },
  back: {
    minHeight: 36,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.pill,
    borderCurve: "continuous",
  },
  backLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  content: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    padding: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: 80,
    gap: spacing.xl,
  },
}));
