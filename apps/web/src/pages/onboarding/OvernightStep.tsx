/**
 * 정기외박 기준일 단계.
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 주기의 단위는 군종이 정한다 — 해·공군은 6주라 일 단위, 육군은 분기라 달 단위다.
 * 입력칸은 하나뿐이고 라벨과 허용 범위만 단위를 따라간다.
 *
 * 예전에는 오른쪽에 규정 근거 패널을 상시 펼쳐 뒀는데, 질문 하나짜리 화면에
 * 본문보다 긴 각주가 붙는 꼴이었다. 근거는 접어두고 필요할 때만 펴게 한다.
 * 출처 링크와 확인 날짜는 그대로 남긴다 — 공식 일정이 아니라는 고지가 사라지면
 * 안 되는 화면이다.
 *
 * 주기와 회당 적립도 여기서 고칠 수 있다. 통상 운영값을 기본으로 깔아 두되,
 * 부대마다 다른 값을 온보딩 도중에 바로 넣을 수 있어야 한다.
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
  type RegularOvernightIntervalForm,
} from "@leave/shared";
import { Field } from "../../components/Field";
import { StepError, StepNext, StepShell, StepSkip } from "./StepShell";

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
  error: string | null;
  pending: boolean;
  onNext: () => void;
  onSkip: () => void;
}) {
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

      {/* 기본값은 군별 통상 운영(육군 3개월 1박 2일, 해·공군 6주 2박 3일)이지만
          부대마다 다르다. 예전에는 이 두 값을 읽기 전용 타일로 보여줘, 온보딩을
          끝내고 보유 휴가 화면까지 들어가야 고칠 수 있었다.
          값을 문자열로 들고 있는 건 지우는 중간 상태를 허용하기 위해서다.
          숫자로 강제하면 마지막 한 자를 지우는 순간 1로 튀어 되고쳐야 한다. */}
      <div className="ob-metrics">
        <Field label={limits.label}>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={limits.min}
            max={limits.max}
            value={props.interval}
            onChange={(e) => props.onIntervalChange(e.target.value)}
            data-testid="onboarding-overnight-interval"
          />
        </Field>
        <Field label="회당 적립 (일)">
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={30}
            value={props.daysPerGrant}
            onChange={(e) => props.onDaysPerGrantChange(e.target.value)}
            data-testid="onboarding-overnight-days"
          />
        </Field>
      </div>

      {firstGrant && (
        <p className="ob-note is-live">
          첫 사용 가능 주기는 <strong>{firstGrant}</strong>부터예요.
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
        disabled={!ready}
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
