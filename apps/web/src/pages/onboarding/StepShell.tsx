/**
 * 온보딩 질문 패널의 공통 껍데기 — 제목 + 한 줄 설명 + 본문.
 *
 * 사용처: `pages/onboarding/*` 의 모든 단계.
 *
 * 문구는 `ONBOARDING_COPY`에서 가져오되 단계에 따라 바꿔야 하는 곳(예: 군종별
 * 정기외박 안내)만 props로 덮어쓴다. 그래야 웹과 앱의 기본 문구가 한 곳에 남는다.
 */

import { ONBOARDING_COPY, type OnboardingStepId } from "@leave/shared";
import type { ReactNode } from "react";

export function StepShell(props: {
  step: OnboardingStepId;
  title?: string;
  lead?: string;
  children: ReactNode;
}) {
  const copy = ONBOARDING_COPY[props.step];
  return (
    <>
      <h1 className="ob-title" data-ob-title>
        {props.title ?? copy.title}
      </h1>
      <p className="ob-lead">{props.lead ?? copy.lead}</p>
      {props.children}
    </>
  );
}

/** 단계 하단의 주 행동 버튼. 모든 단계에서 같은 자리·같은 모양이어야 한다. */
export function StepNext(props: {
  label?: string;
  disabled?: boolean;
  pending?: boolean;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="btn btn-primary ob-next"
      disabled={props.disabled || props.pending}
      onClick={props.onClick}
      data-testid={props.testId ?? "onboarding-next"}
    >
      {props.pending ? "저장 중…" : (props.label ?? "다음")}
    </button>
  );
}

/** "나중에 하기"류의 부차 행동. 주 버튼과 시각적 무게를 확실히 벌린다. */
export function StepSkip(props: {
  label: string;
  onClick: () => void;
  testId?: string;
}) {
  return (
    <button
      type="button"
      className="ob-skip"
      onClick={props.onClick}
      data-testid={props.testId}
    >
      {props.label}
    </button>
  );
}

export function StepError(props: { message: string | null }) {
  if (!props.message) return null;
  return (
    <p className="field-error ob-error" role="alert">
      {props.message}
    </p>
  );
}
