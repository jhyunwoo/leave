/**
 * 복무 프로필을 묻는 단계들 — 환영 · 별칭 · 군종 · 날짜 · 계급.
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 각 단계는 입력 하나만 갖는다. 예전에는 이 다섯 가지를 한 화면에서 다 받았는데,
 * 가입 직후 첫 화면이 폼으로 꽉 차 이탈 지점이 됐다.
 *
 * 저장은 여기서 하지 않는다. `onboardingProfileSchema`가 완성된 한 벌만 받으므로
 * 값은 부모가 들고 있다가 계급 단계에서 한 번에 PUT한다.
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
  type Branch,
  type ISODate,
  type Rank,
} from "@leave/shared";
import { Field } from "../../components/Field";
import { StepError, StepNext, StepShell } from "./StepShell";

export function WelcomeStep(props: { onNext: () => void }) {
  return (
    <StepShell step="welcome">
      <ul className="ob-promise">
        <li>입대일만 넣으면 계급이 알아서 올라가요</li>
        <li>같은 그룹의 출타 인원이 넘치면 알려줘요</li>
        <li>실명·군번·부대명은 묻지 않아요</li>
      </ul>
      <StepNext label="시작하기" onClick={props.onNext} />
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
        <input
          className="input ob-input-lg"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder="예: 라임고래"
          maxLength={50}
          autoFocus
          data-testid="onboarding-name"
          onKeyDown={(e) => {
            if (e.key === "Enter") props.onNext();
          }}
        />
      </Field>
      <StepError message={props.error} />
      <StepNext disabled={!props.value.trim()} onClick={props.onNext} />
    </StepShell>
  );
}

export function BranchStep(props: {
  value: Branch;
  onChange: (value: Branch) => void;
  onNext: () => void;
}) {
  return (
    <StepShell step="branch">
      <div className="ob-choices" role="radiogroup" aria-label="군종">
        {BRANCHES.map((branch) => (
          <button
            type="button"
            key={branch}
            role="radio"
            aria-checked={props.value === branch}
            className={`ob-choice ${props.value === branch ? "is-on" : ""}`}
            onClick={() => props.onChange(branch)}
            data-testid={`onboarding-branch-${branch}`}
          >
            <svg viewBox="0 0 48 48" aria-hidden="true">
              {BRANCH_EMBLEM[branch].shapes.map((shape, i) => (
                <path
                  key={i}
                  d={shape.d}
                  fill={shape.mode === "fill" ? "currentColor" : "none"}
                  stroke={shape.mode === "stroke" ? "currentColor" : "none"}
                  strokeWidth={shape.width ?? 0}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={shape.opacity ?? 1}
                />
              ))}
            </svg>
            <strong>{BRANCH_LABELS[branch]}</strong>
            <span>{SERVICE_MONTHS[branch]}개월</span>
          </button>
        ))}
      </div>
      <StepNext onClick={props.onNext} />
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
  const setEnlisted = (value: string) => {
    props.onChange({
      enlistedAt: value,
      // 전역일은 사용자가 따로 고치기 전까지 입대일을 따라간다. 자동 계산값을
      // 그대로 두면 군종을 바꿨을 때 옛 날짜가 남아 있게 된다.
      dischargeAt: value
        ? standardDischargeDate(value as ISODate, props.branch)
        : "",
    });
  };

  return (
    <StepShell step="dates">
      <Field label="입대일">
        <input
          className="input ob-input-lg"
          type="date"
          value={props.enlistedAt}
          onChange={(e) => setEnlisted(e.target.value)}
          autoFocus
          data-testid="onboarding-enlisted-at"
        />
      </Field>
      <Field
        label="전역 예정일"
        hint={`${BRANCH_LABELS[props.branch]} ${SERVICE_MONTHS[props.branch]}개월 기준으로 계산했어요. 다르면 고쳐주세요.`}
      >
        <input
          className="input"
          type="date"
          value={props.dischargeAt}
          onChange={(e) =>
            props.onChange({
              enlistedAt: props.enlistedAt,
              dischargeAt: e.target.value,
            })
          }
          data-testid="onboarding-discharge-at"
        />
      </Field>
      <StepError message={props.error} />
      <StepNext
        disabled={!props.enlistedAt || !props.dischargeAt}
        onClick={props.onNext}
      />
    </StepShell>
  );
}

export function RankStep(props: {
  enlistedAt: string;
  today: ISODate;
  value: Rank;
  onChange: (value: Rank) => void;
  error: string | null;
  pending: boolean;
  onNext: () => void;
}) {
  const suggested = props.enlistedAt
    ? scheduledRank(props.enlistedAt as ISODate, props.today)
    : null;

  return (
    <StepShell step="rank">
      <div className="ob-choices is-compact" role="radiogroup" aria-label="계급">
        {RANKS.map((rank) => (
          <button
            type="button"
            key={rank}
            role="radio"
            aria-checked={props.value === rank}
            className={`ob-choice ${props.value === rank ? "is-on" : ""}`}
            onClick={() => props.onChange(rank)}
            data-testid={`onboarding-rank-${rank}`}
          >
            <strong>{RANK_LABELS[rank]}</strong>
            {rank === suggested && <span className="ob-tag">자동 계산</span>}
          </button>
        ))}
      </div>
      <p className="ob-note">
        진급일이 지나면 계급은 저절로 올라가요. 여기서 고른 값은 조기 진급했을
        때의 하한으로만 쓰여요.
      </p>
      <StepError message={props.error} />
      <StepNext pending={props.pending} onClick={props.onNext} />
    </StepShell>
  );
}
