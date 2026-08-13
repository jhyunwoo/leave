/**
 * 온보딩 히어로 — 답변에 따라 자라나는 복무 타임라인.
 *
 * 사용처: `pages/OnboardingPage.tsx`.
 *
 * 단계마다 다른 그림을 그리지 않는다. 트랙 하나 위에 레이어(별칭 칩, 군종 배경,
 * 진행선, 진급 셰브론, 정기외박 주기 점, 동료 노드)가 답변할 때마다 하나씩
 * 얹히고, 이미 답한 레이어는 옅게 남는다. 그래서 마지막 화면에 도착하면
 * 자기가 입력한 것들이 한 장의 그림으로 완성돼 있다.
 *
 * 좌표·색·엠블럼 패스는 전부 `@leave/shared`의 onboarding 모듈에서 온다.
 * 네이티브 `screens/onboarding/service-hero.tsx`가 같은 값을 받아 그리므로
 * 여기서 좌표를 직접 만지면 두 앱의 그림이 갈라진다.
 *
 * 이 그림은 순수 장식이라 aria-hidden이다. D-day·진행률 같은 정보는 옆의
 * 질문 패널이 글로 다시 말한다.
 */

import {
  BRANCH_ACCENT,
  BRANCH_EMBLEM,
  HERO_LAYOUT,
  HERO_TRACK,
  HERO_TRACK_LENGTH,
  HERO_VIEWBOX,
  heroGeometry,
  heroLayerState,
  type Branch,
  type HeroLayer,
  type ISODate,
  type OnboardingStepId,
} from "@leave/shared";
import { useEffect, useRef, useState } from "react";

/**
 * 값이 바뀔 때 숫자가 굴러가는 카운터.
 *
 * D-day는 세 자리가 통째로 바뀌는 값이라 그냥 갈아끼우면 화면이 툭 튄다.
 * 640ms 동안 ease-out으로 굴리면 "계산되고 있다"는 느낌이 남는다.
 * 모션 축소 설정에서는 즉시 목표값으로 간다.
 */
function useRolling(target: number, enabled: boolean): number {
  const reduced = useReducedMotion();
  const animate = enabled && !reduced;
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    // 굴리지 않을 때는 상태를 건드리지 않는다. 효과 본문에서 곧장 setState를
    // 부르면 렌더가 한 번 더 도는데, 아래에서 목표값을 그대로 돌려주면 된다.
    if (!animate) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const startedAt = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - startedAt) / 640, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, animate]);

  return animate ? value : target;
}

/**
 * 모션 축소 설정 구독.
 *
 * 전역 CSS의 `prefers-reduced-motion` 블록은 애니메이션 duration만 눌러주지,
 * JS로 굴리는 숫자까지 막지는 못한다. 그래서 여기서 직접 읽는다.
 */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function fmt(date: ISODate): string {
  return `${date.slice(0, 4)}.${date.slice(5, 7)}.${date.slice(8, 10)}`;
}

/** 칩 폭을 글자 수에 맞춘다. SVG는 자동 크기 조절이 없다. */
function badgeWidth(label: string): number {
  return Math.min(HERO_LAYOUT.badge.textDx * 2 + label.length * 13, 190);
}

export function ServiceHero(props: {
  step: OnboardingStepId;
  branch: Branch;
  name: string;
  enlistedAt: string;
  dischargeAt: string;
  overnightStartDate: string;
  /** 이미 그룹에 속했는지. 노드가 모두 라임으로 채워진다. */
  inGroup: boolean;
  today: ISODate;
}) {
  const accent = BRANCH_ACCENT[props.branch].light;
  const emblem = BRANCH_EMBLEM[props.branch];
  const geo = heroGeometry({
    branch: props.branch,
    today: props.today,
    enlistedAt: props.enlistedAt,
    dischargeAt: props.dischargeAt,
    overnightStartDate: props.overnightStartDate,
  });

  const layer = (name: HeroLayer) =>
    heroLayerState(props.branch, props.step, name);

  const daysLeft = useRolling(geo.daysLeft, geo.resolved);
  const permille = useRolling(Math.round(geo.progress * 1000), geo.resolved);

  const badgeLabel = props.name.trim() || "별칭";

  return (
    <div
      className="ob-hero"
      style={
        {
          "--accent-tint": accent.tint,
          "--accent-line": accent.line,
          "--accent-deep": accent.deep,
        } as React.CSSProperties
      }
      aria-hidden="true"
    >
      <svg
        viewBox={`0 0 ${HERO_VIEWBOX.width} ${HERO_VIEWBOX.height}`}
        className="ob-hero-svg"
        role="presentation"
      >
        {/* 군종 틴트 배경 — 군종을 바꾸면 색만 부드럽게 갈아탄다 */}
        <rect
          className={`ob-sky is-${layer("sky")}`}
          x="0"
          y="0"
          width={HERO_VIEWBOX.width}
          height={HERO_VIEWBOX.height}
          rx="24"
        />

        {/* 군종 상징 */}
        <g
          className={`ob-emblem is-${layer("emblem")}`}
          transform={`translate(${HERO_LAYOUT.emblem.x} ${HERO_LAYOUT.emblem.y}) scale(${HERO_LAYOUT.emblem.scale})`}
        >
          <g className="ob-emblem-inner" key={props.branch}>
            {emblem.shapes.map((shape, i) => (
              <path
                key={i}
                d={shape.d}
                fill={shape.mode === "fill" ? accent.line : "none"}
                stroke={shape.mode === "stroke" ? accent.line : "none"}
                strokeWidth={shape.width ?? 0}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={shape.opacity ?? 1}
              />
            ))}
          </g>
        </g>

        {/* 별칭 칩 */}
        <g className={`ob-badge is-${layer("badge")}`}>
          <rect
            x={HERO_LAYOUT.badge.x}
            y={HERO_LAYOUT.badge.y}
            rx={HERO_LAYOUT.badge.height / 2}
            width={badgeWidth(badgeLabel)}
            height={HERO_LAYOUT.badge.height}
          />
          <text
            x={HERO_LAYOUT.badge.x + HERO_LAYOUT.badge.textDx}
            y={HERO_LAYOUT.badge.y + HERO_LAYOUT.badge.textDy}
          >
            {badgeLabel}
          </text>
        </g>

        {/* 숫자 판독부 */}
        <g className={`ob-readout is-${layer("readout")}`}>
          <text
            x={HERO_LAYOUT.readout.x}
            y={HERO_LAYOUT.readout.valueY}
            fontSize={HERO_LAYOUT.readout.valueSize}
            className="ob-readout-value"
          >
            {geo.resolved ? `D-${daysLeft}` : "D-???"}
          </text>
          <text
            x={HERO_LAYOUT.readout.x}
            y={HERO_LAYOUT.readout.captionY}
            fontSize={HERO_LAYOUT.readout.captionSize}
            className="ob-readout-caption"
          >
            {geo.resolved
              ? `복무 ${(permille / 10).toFixed(1)}%`
              : "입대일을 알려주세요"}
          </text>
        </g>

        {/* 기준 트랙 */}
        <line
          className={`ob-track is-${layer("track")}`}
          x1={HERO_TRACK.x1}
          y1={HERO_TRACK.y}
          x2={HERO_TRACK.x2}
          y2={HERO_TRACK.y}
          strokeDasharray={HERO_TRACK_LENGTH}
        />

        {/* 정기외박 주기 점 — 트랙 위에 6주 간격으로 찍힌다 */}
        <g className={`ob-cycle is-${layer("cycle")}`}>
          {geo.cyclePoints.map((point, i) => (
            <circle
              key={point.date}
              cx={point.x}
              cy={HERO_TRACK.y}
              r="3.5"
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
        </g>

        {/* 진행선 — dashoffset으로 좌에서 우로 차오른다 */}
        <line
          className={`ob-progress is-${layer("progress")}`}
          x1={HERO_TRACK.x1}
          y1={HERO_TRACK.y}
          x2={HERO_TRACK.x2}
          y2={HERO_TRACK.y}
          strokeDasharray={HERO_TRACK_LENGTH}
          strokeDashoffset={HERO_TRACK_LENGTH * (1 - geo.progress)}
        />

        {/* 양 끝점과 현재 위치 */}
        <circle
          className={`ob-end is-${layer("track")}`}
          cx={HERO_TRACK.x1}
          cy={HERO_TRACK.y}
          r="5"
        />
        <circle
          className={`ob-end is-${layer("track")}`}
          cx={HERO_TRACK.x2}
          cy={HERO_TRACK.y}
          r="5"
        />
        <g
          className={`ob-head is-${layer("progress")}`}
          style={
            {
              "--x": `${geo.progressX - HERO_TRACK.x1}px`,
            } as React.CSSProperties
          }
        >
          <circle cx={HERO_TRACK.x1} cy={HERO_TRACK.y} r="8" />
        </g>

        {/* 진급 셰브론 */}
        <g className={`ob-markers is-${layer("markers")}`}>
          {geo.markers.map((marker, i) => (
            <g key={marker.rank} transform={`translate(${marker.x} 0)`}>
              <g
                className="ob-marker"
                style={{ "--i": i } as React.CSSProperties}
              >
                <text y={HERO_LAYOUT.marker.labelY}>{marker.label}</text>
                <path
                  d={`M-5 ${HERO_LAYOUT.marker.chevronY + 3} L0 ${HERO_LAYOUT.marker.chevronY - 3} L5 ${HERO_LAYOUT.marker.chevronY + 3}`}
                />
              </g>
            </g>
          ))}
        </g>

        {/* 양 끝 날짜 */}
        <g className={`ob-caps is-${layer("progress")}`}>
          <text x={HERO_TRACK.x1} y={HERO_LAYOUT.capsY}>
            {geo.resolved ? fmt(geo.enlistedAt) : "입대"}
          </text>
          <text x={HERO_TRACK.x2} y={HERO_LAYOUT.capsY} textAnchor="end">
            {geo.resolved ? fmt(geo.dischargeAt) : "전역"}
          </text>
        </g>

        {/* 동료 노드 — 그룹 단계에서 트랙 아래로 모인다 */}
        <g className={`ob-nodes is-${layer("nodes")}`}>
          {[-1, 0, 1].map((offset, i) => (
            <circle
              key={offset}
              cx={HERO_VIEWBOX.width / 2 + offset * HERO_LAYOUT.nodes.gap}
              cy={HERO_LAYOUT.nodes.y}
              r={HERO_LAYOUT.nodes.radius}
              className={props.inGroup || offset === 0 ? "is-me" : ""}
              style={{ "--i": i } as React.CSSProperties}
            />
          ))}
        </g>
      </svg>
    </div>
  );
}
