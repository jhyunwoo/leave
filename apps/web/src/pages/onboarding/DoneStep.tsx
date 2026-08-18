/**
 * 마지막 단계 — 입력한 내용을 한 장으로 되짚고 온보딩을 닫는다.
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 요약을 보여주는 건 축하 때문이 아니라 확인 때문이다. 한 화면에 하나씩 물으면
 * 사용자는 자기가 뭘 답했는지 기억하지 못한 채 끝난다. 여기서 틀린 걸 발견하면
 * 뒤로 돌아가 고칠 수 있다.
 */

import {
  BRANCH_LABELS,
  RANK_LABELS,
  diffDays,
  type Branch,
  type ISODate,
  type Rank,
} from "@leave/shared";
import { StepError, StepNext, StepShell } from "./StepShell";

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
  const daysLeft =
    props.enlistedAt && props.dischargeAt
      ? Math.max(diffDays(props.today, props.dischargeAt), 0)
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
      <dl className="ob-summary">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="ob-note">모두 프로필에서 언제든 바꿀 수 있어요.</p>
      <StepError message={props.error} />
      <StepNext
        label="휴가 계획 시작하기"
        pending={props.pending}
        onClick={props.onComplete}
        testId="onboarding-complete"
      />
    </StepShell>
  );
}
