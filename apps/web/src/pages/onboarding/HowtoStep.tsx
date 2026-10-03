/**
 * 사용법 단계 — 기능마다 한 장씩 넘기는 모션 그래픽 투어.
 *
 * 사용처: `pages/OnboardingPage.tsx`. 그림(`TourStage`)은 히어로 자리에 뜨고,
 * 이 패널은 같은 장면을 글로 말한다. 몇 번째 장면인지는 페이지가 들고 있다 —
 * 무대와 패널이 같은 값을 봐야 하고, 상단 "뒤로"가 장면부터 되돌려야 하기 때문이다.
 *
 * 장면 데이터는 `ONBOARDING_TOUR` 한 벌이고 네이티브가 같은 배열을 그린다.
 *
 * 탭은 WAI-ARIA 탭 패턴을 따른다. 좌우 화살표로 옮기고, 지금 탭 아래 막대가
 * 장면 한 바퀴의 길이로 차올라 그림이 어디쯤 돌고 있는지 보인다.
 */

import { ONBOARDING_COPY, ONBOARDING_TOUR } from "@leave/shared";
import { useRef, type CSSProperties, type KeyboardEvent } from "react";
import { StepNext } from "./StepShell";

export function HowtoStep(props: {
  index: number;
  onIndexChange: (index: number) => void;
  onNext: () => void;
}) {
  const last = ONBOARDING_TOUR.length - 1;
  const index = Math.min(Math.max(props.index, 0), last);
  const scene = ONBOARDING_TOUR[index] ?? ONBOARDING_TOUR[0];
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  if (!scene) return null;

  const select = (next: number, focus = false) => {
    const clamped = (next + ONBOARDING_TOUR.length) % ONBOARDING_TOUR.length;
    props.onIndexChange(clamped);
    if (focus) tabRefs.current[clamped]?.focus();
  };

  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowRight: index + 1,
      ArrowLeft: index - 1,
      Home: 0,
      End: last,
    };
    const next = moves[event.key];
    if (next === undefined) return;
    event.preventDefault();
    select(next, true);
  };

  return (
    <>
      <p className="ob-tour-eyebrow">
        {ONBOARDING_COPY.howto.title}
        <span>
          {index + 1} / {ONBOARDING_TOUR.length}
        </span>
      </p>

      <div
        className="ob-tour-tabs"
        role="tablist"
        aria-label="기능 둘러보기"
        onKeyDown={onTabKey}
      >
        {ONBOARDING_TOUR.map((item, i) => (
          <button
            key={item.id}
            ref={(element) => {
              tabRefs.current[i] = element;
            }}
            id={`ob-tour-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls="ob-tour-panel"
            tabIndex={i === index ? 0 : -1}
            className={
              i === index ? "is-now" : i < index ? "is-seen" : undefined
            }
            style={{ "--tour-ms": `${item.duration}ms` } as CSSProperties}
            onClick={() => select(i)}
            data-testid={`onboarding-tour-tab-${item.id}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        key={scene.id}
        id="ob-tour-panel"
        role="tabpanel"
        aria-labelledby={`ob-tour-tab-${scene.id}`}
        aria-live="polite"
        className="ob-tour-copy"
        data-testid={`onboarding-tour-scene-${scene.id}`}
      >
        <h1 className="ob-title" data-ob-title>
          {scene.title}
        </h1>
        <p className="ob-lead">{scene.body}</p>
        <ul className="ob-tour-points">
          {scene.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
      </div>

      {/* 이전 장면은 상단 "뒤로"·탭·쓸기로 간다. 여기에는 앞으로 가는 두 길만 둔다 —
          작은 화면에서 버튼 줄이 하나 줄어야 무대와 버튼이 한 화면에 든다. */}
      <div className="ob-tour-nav">
        {index < last ? (
          <button
            type="button"
            className="ob-tour-skip"
            onClick={props.onNext}
            data-testid="onboarding-tour-skip"
          >
            건너뛰기
          </button>
        ) : null}
        <StepNext
          label={index < last ? "다음 기능" : "다 봤어요"}
          onClick={() => (index < last ? select(index + 1) : props.onNext())}
        />
      </div>
    </>
  );
}
