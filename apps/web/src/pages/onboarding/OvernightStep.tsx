/**
 * 정기외박 기준일 단계 (해군·공군만).
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 예전에는 오른쪽에 규정 근거 패널을 상시 펼쳐 뒀는데, 질문 하나짜리 화면에
 * 본문보다 긴 각주가 붙는 꼴이었다. 근거는 접어두고 필요할 때만 펴게 한다.
 * 출처 링크와 확인 날짜는 그대로 남긴다 — 공식 일정이 아니라는 고지가 사라지면
 * 안 되는 화면이다.
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
import { Field } from "../../components/Field";
import { StepError, StepNext, StepShell, StepSkip } from "./StepShell";

export function OvernightStep(props: {
  branch: Branch;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  pending: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
  const guidance = regularOvernightGuidance(props.branch);
  if (!guidance) return null;

  return (
    <StepShell step="overnight" lead={guidance.summary}>
      <Field
        label="주기 기준일"
        hint="부대에서 안내받은 실제 기준일을 입력하세요."
      >
        <input
          className="input ob-input-lg"
          type="date"
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          autoFocus
          data-testid="onboarding-overnight-start"
        />
      </Field>

      <div className="ob-metrics">
        <div>
          <span>주기</span>
          <strong>{REGULAR_OVERNIGHT_DEFAULTS.intervalDays}일</strong>
        </div>
        <div>
          <span>회당</span>
          <strong>{REGULAR_OVERNIGHT_DEFAULTS.daysPerGrant}일</strong>
        </div>
      </div>

      {isValidISODate(props.value) && (
        <p className="ob-note is-live">
          첫 사용 가능 주기는{" "}
          <strong>
            {addDays(
              props.value as ISODate,
              REGULAR_OVERNIGHT_DEFAULTS.intervalDays,
            )}
          </strong>
          부터예요.
        </p>
      )}

      <details className="ob-details">
        <summary>규정과 실제 운영이 어떻게 다른가요?</summary>
        <p>{guidance.disclaimer}</p>
        <p>{guidance.detail}</p>
        <div className="ob-sources">
          {REGULAR_OVERNIGHT_SOURCES.map((source) => (
            <a
              key={source.url}
              href={source.url}
              target="_blank"
              rel="noreferrer"
            >
              {source.label} ↗
            </a>
          ))}
        </div>
        <p className="ob-fineprint">
          공개 자료 확인 {REGULAR_OVERNIGHT_VERIFIED_AT} · 공식 일정 확정 기능이
          아니며 소속 부대 지침이 우선합니다.
        </p>
      </details>

      <StepError message={props.error} />
      <StepNext
        disabled={!isValidISODate(props.value)}
        pending={props.pending}
        onClick={props.onNext}
      />
      <StepSkip
        label="기준일을 몰라요 · 나중에 설정"
        onClick={props.onSkip}
        testId="onboarding-overnight-skip"
      />
    </StepShell>
  );
}
