/**
 * 마지막 단계 — 입력한 내용을 한 장으로 되짚고 온보딩을 닫는다 (네이티브).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 요약은 축하가 아니라 확인이 목적이다. 한 화면에 하나씩 물으면 사용자는 자기가
 * 뭘 답했는지 기억하지 못한 채 끝난다. 여기서 틀린 걸 발견하면 되돌아가 고친다.
 */

import {
  BRANCH_LABELS,
  RANK_LABELS,
  diffDays,
  type Branch,
  type ISODate,
  type Rank,
} from "@leave/shared";
import { Text, View } from "react-native";
import { makeStyles, radius, spacing } from "@/theme";
import { StepError, StepNext, StepNote, StepShell } from "./step-shell";

export function DoneStep(props: {
  name: string;
  branch: Branch;
  enlistedAt: string;
  dischargeAt: string;
  rank: Rank;
  overnightStartDate: string;
  inGroup: boolean;
  today: ISODate;
  error: string | null;
  pending: boolean;
  onComplete: () => void;
}) {
  const styles = useStyles();
  const daysLeft =
    props.enlistedAt && props.dischargeAt
      ? Math.max(diffDays(props.today, props.dischargeAt as ISODate), 0)
      : null;

  const rows: [string, string][] = [
    ["별칭", props.name],
    ["군종", BRANCH_LABELS[props.branch]],
    ["복무", `${props.enlistedAt} → ${props.dischargeAt}`],
    ["계급", RANK_LABELS[props.rank]],
  ];
  if (props.branch !== "army")
    rows.push([
      "정기외박",
      props.overnightStartDate
        ? `${props.overnightStartDate} 기준`
        : "나중에 설정",
    ]);
  rows.push(["공유 그룹", props.inGroup ? "참여함" : "나중에"]);

  return (
    <StepShell
      step="done"
      lead={
        daysLeft === null
          ? "이제 달력에서 휴가를 계획할 수 있어요."
          : `전역까지 ${daysLeft}일. 이제 달력에서 휴가를 계획할 수 있어요.`
      }
    >
      <View style={styles.summary}>
        {rows.map(([label, value], i) => (
          <View
            key={label}
            style={[styles.row, i === rows.length - 1 && styles.lastRow]}
          >
            <Text style={styles.label}>{label}</Text>
            <Text style={styles.value}>{value}</Text>
          </View>
        ))}
      </View>
      <StepNote>모두 프로필에서 언제든 바꿀 수 있어요.</StepNote>
      <StepError message={props.error} />
      <StepNext
        label="휴가 계획 시작하기"
        pending={props.pending}
        onPress={props.onComplete}
        testID="onboarding-complete"
      />
    </StepShell>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  summary: {
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: 13,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.hairline,
  },
  lastRow: { borderBottomWidth: 0 },
  label: { fontSize: 13, color: colors.mute },
  value: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    textAlign: "right",
  },
}));
