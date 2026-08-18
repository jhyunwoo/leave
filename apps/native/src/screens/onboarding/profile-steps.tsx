/**
 * 복무 프로필을 묻는 단계들 — 환영 · 별칭 · 군종 · 날짜 · 계급 (네이티브).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 웹 `pages/onboarding/ProfileSteps.tsx`와 같은 질문·같은 순서다. 저장은 하지
 * 않는다 — `onboardingProfileSchema`가 완성된 한 벌만 받으므로 값은 부모가 들고
 * 있다가 계급 단계에서 한 번에 PUT한다.
 */

import {
  BRANCHES,
  BRANCH_EMBLEM,
  BRANCH_LABELS,
  RANKS,
  RANK_LABELS,
  SERVICE_MONTHS,
  scheduledRank,
  standardDischargeDate,
  todayInSeoul,
  type Branch,
  type ISODate,
  type Rank,
} from "@leave/shared";
import { Text, View } from "react-native";
import { DatePickerRow } from "@/components/date-picker";
import { Field, Input } from "@/components/field";
import { makeStyles, spacing } from "@/theme";
import { ChoiceBadge, ChoiceCard } from "./choice-card";
import { StepError, StepNext, StepNote, StepShell } from "./step-shell";

export function WelcomeStep(props: { onNext: () => void }) {
  const styles = useStyles();
  return (
    <StepShell step="welcome">
      <View style={styles.promises}>
        {[
          "입대일만 넣으면 계급이 알아서 올라가요",
          "같은 그룹의 출타 인원이 넘치면 알려줘요",
          "실명·군번·부대명은 묻지 않아요",
        ].map((line) => (
          <View key={line} style={styles.promise}>
            <Text style={styles.check}>✓</Text>
            <Text style={styles.promiseText}>{line}</Text>
          </View>
        ))}
      </View>
      <StepNext label="시작하기" onPress={props.onNext} />
    </StepShell>
  );
}

export function NameStep(props: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  onNext: () => void;
}) {
  return (
    <StepShell step="name">
      <Field label="별칭" hint="언제든지 프로필에서 바꿀 수 있어요.">
        <Input
          value={props.value}
          onChangeText={props.onChange}
          placeholder="예: 라임고래"
          maxLength={50}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={props.onNext}
          testID="onboarding-name"
        />
      </Field>
      <StepError message={props.error} />
      <StepNext disabled={!props.value.trim()} onPress={props.onNext} />
    </StepShell>
  );
}

export function BranchStep(props: {
  value: Branch;
  onChange: (value: Branch) => void;
  onNext: () => void;
}) {
  const styles = useStyles();
  return (
    <StepShell step="branch">
      <View style={styles.row} accessibilityRole="radiogroup">
        {BRANCHES.map((branch) => (
          <ChoiceCard
            key={branch}
            label={BRANCH_LABELS[branch]}
            caption={`${SERVICE_MONTHS[branch]}개월`}
            emblem={BRANCH_EMBLEM[branch].shapes}
            selected={props.value === branch}
            onPress={() => props.onChange(branch)}
            testID={`onboarding-branch-${branch}`}
          />
        ))}
      </View>
      <StepNext onPress={props.onNext} />
    </StepShell>
  );
}

export function DatesStep(props: {
  branch: Branch;
  enlistedAt: string;
  dischargeAt: string;
  onChange: (next: { enlistedAt: string; dischargeAt: string }) => void;
  error: string | null;
  onNext: () => void;
}) {
  return (
    <StepShell step="dates">
      <DatePickerRow
        label="입대일"
        value={props.enlistedAt as ISODate | ""}
        onChange={(date) =>
          props.onChange({
            enlistedAt: date,
            // 전역일은 입대일에 딸린 값이라 함께 다시 계산한다.
            dischargeAt: standardDischargeDate(date, props.branch),
          })
        }
        testID="onboarding-enlisted-at"
      />
      <DatePickerRow
        label="전역 예정일"
        value={props.dischargeAt as ISODate | ""}
        min={(props.enlistedAt || undefined) as ISODate | undefined}
        onChange={(date) =>
          props.onChange({ enlistedAt: props.enlistedAt, dischargeAt: date })
        }
        testID="onboarding-discharge-at"
      />
      <StepNote>
        {BRANCH_LABELS[props.branch]} {SERVICE_MONTHS[props.branch]}개월
        기준으로 계산했어요. 다르면 고쳐주세요.
      </StepNote>
      <StepError message={props.error} />
      <StepNext
        disabled={!props.enlistedAt || !props.dischargeAt}
        onPress={props.onNext}
      />
    </StepShell>
  );
}

export function RankStep(props: {
  enlistedAt: string;
  value: Rank;
  onChange: (value: Rank) => void;
  error: string | null;
  pending: boolean;
  onNext: () => void;
}) {
  const styles = useStyles();
  const suggested = props.enlistedAt
    ? scheduledRank(props.enlistedAt as ISODate, todayInSeoul())
    : null;

  return (
    <StepShell step="rank">
      <View style={styles.row} accessibilityRole="radiogroup">
        {RANKS.map((rank) => (
          <ChoiceCard
            key={rank}
            label={RANK_LABELS[rank]}
            selected={props.value === rank}
            badge={
              rank === suggested ? <ChoiceBadge label="자동 계산" /> : undefined
            }
            onPress={() => props.onChange(rank)}
            testID={`onboarding-rank-${rank}`}
          />
        ))}
      </View>
      <StepNote>
        진급일이 지나면 계급은 저절로 올라가요. 여기서 고른 값은 조기 진급했을
        때의 하한으로만 쓰여요.
      </StepNote>
      <StepError message={props.error} />
      <StepNext pending={props.pending} onPress={props.onNext} />
    </StepShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: { flexDirection: "row", gap: spacing.md },
  promises: { gap: spacing.md },
  promise: { flexDirection: "row", gap: spacing.md, alignItems: "flex-start" },
  check: {
    fontSize: 15,
    fontWeight: "900",
    color: colors.brand,
    lineHeight: 22,
  },
  promiseText: { flex: 1, fontSize: 15, lineHeight: 22, color: colors.body },
}));
