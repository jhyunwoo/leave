/**
 * 사용법 단계 — 온보딩에서 유일하게 질문하지 않는 화면.
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 앞의 여덟 단계는 "한 화면에 질문 하나"라 앱이 무엇을 해주는지 말할 자리가 없었다.
 * 공개 `/guide`에 자세한 설명이 있지만 앱 안에서는 어디서도 닿지 않아, 처음 들어온
 * 사람은 빈 달력 앞에서 스스로 알아내야 했다. 그 한 칸을 여기서 메운다.
 *
 * 문구는 `ONBOARDING_HOWTO`에 있고 네이티브가 같은 배열을 그린다.
 */

import { ONBOARDING_HOWTO } from "@leave/shared";
import { StepNext, StepShell } from "./StepShell";

export function HowtoStep(props: { onNext: () => void }) {
  return (
    <StepShell step="howto">
      <ul className="ob-howto">
        {ONBOARDING_HOWTO.map((card) => (
          <li key={card.id}>
            <strong>{card.title}</strong>
            <span>{card.body}</span>
          </li>
        ))}
      </ul>
      <StepNext label="다음" onClick={props.onNext} />
    </StepShell>
  );
}
