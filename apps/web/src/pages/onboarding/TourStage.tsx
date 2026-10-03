/**
 * 사용법 투어의 무대 — 장면 하나를 끝없이 돌리는 모션 그래픽.
 *
 * 사용처: `pages/OnboardingPage.tsx`(사용법 단계에서 히어로 자리를 대신한다).
 *
 * 장면의 좌표·색·시간표는 전부 `@leave/shared`의 onboarding-tour 모듈에서 온다.
 * 네이티브 `screens/onboarding/tour-stage.tsx`가 같은 데이터를 같은 샘플러로
 * 그리므로, 여기서 좌표나 시간을 직접 만지면 두 앱의 그림이 갈라진다.
 *
 * 프레임마다 React 상태를 바꾸지 않는다. 노드 엘리먼트를 ref로 들고
 * `opacity`·`transform`만 직접 쓴다 — 레이아웃을 다시 계산하지 않는 두 속성이라
 * 노드가 여든 개여도 합성만으로 끝난다(`ServiceProgressDetailPage`와 같은 방식).
 *
 * 확대는 `transform: scale`이 아니라 `zoom`으로 한다. 변환으로 키우면 브라우저가
 * 1배로 그린 글자를 늘려 붙여 데스크톱에서 흐려진다. `zoom`은 레이아웃 자체를
 * 키우므로 글자가 그 크기로 다시 그려진다.
 *
 * 그림은 장식이라 aria-hidden이다. 같은 내용을 옆 패널이 글로 말한다.
 */

import {
  TOUR_BACKDROP,
  TOUR_CANVAS,
  TOUR_ICONS,
  TOUR_PALETTE,
  sampleTourPose,
  type TourNode,
  type TourOrigin,
  type TourPose,
  type TourScene,
} from "@leave/shared";
import { useEffect, useLayoutEffect, useRef, type CSSProperties } from "react";
import { useReducedMotion } from "../../components/use-reduced-motion";

// 웹은 라이트 스킴 하나뿐이다(global.css에 다크 토큰이 없다).
const palette = TOUR_PALETTE.light;

const ORIGIN: Record<TourOrigin, string> = {
  center: "50% 50%",
  left: "0% 50%",
  right: "100% 50%",
  top: "50% 0%",
  bottom: "50% 100%",
};

function poseStyle(pose: TourPose): CSSProperties {
  return {
    opacity: pose.opacity,
    transform: poseTransform(pose),
  };
}

function poseTransform(pose: TourPose): string {
  return `translate(${pose.x}px, ${pose.y}px) rotate(${pose.rotate}deg) scale(${pose.scale * pose.sx}, ${pose.scale * pose.sy})`;
}

function nodeStyle(node: TourNode, at: number): CSSProperties {
  const base: CSSProperties = {
    left: node.x,
    top: node.y,
    width: node.w,
    height: node.h,
    transformOrigin: ORIGIN[node.origin ?? "center"],
    ...poseStyle(sampleTourPose(node.keys, at)),
  };
  if (node.kind === "box")
    return {
      ...base,
      background: node.fill ? palette[node.fill] : undefined,
      border: node.stroke ? `1.5px solid ${palette[node.stroke]}` : undefined,
      borderRadius: node.radius,
      boxShadow: node.shadow
        ? "0 10px 26px rgba(14, 15, 12, 0.16), 0 2px 6px rgba(14, 15, 12, 0.08)"
        : undefined,
    };
  if (node.kind === "text")
    return {
      ...base,
      color: palette[node.color],
      fontSize: node.size,
      fontWeight: node.weight,
      justifyContent:
        node.align === "center"
          ? "center"
          : node.align === "right"
            ? "flex-end"
            : "flex-start",
    };
  return { ...base, color: palette[node.color] };
}

export function TourStage(props: {
  scene: TourScene;
  /** 무대를 옆으로 쓸었을 때. 1이면 다음 장면, -1이면 이전 장면. */
  onSwipe?: (direction: 1 | -1) => void;
}) {
  const { scene, onSwipe } = props;
  const reduced = useReducedMotion();
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef(new Map<string, HTMLElement | SVGElement>());

  // 폭에 맞춰 캔버스를 키운다. 첫 페인트 전에 맞춰야 작은 그림이 한 번 번쩍이지 않는다.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (!frame || !canvas) return;
    const fit = () => {
      canvas.style.zoom = String(frame.clientWidth / TOUR_CANVAS.width);
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(frame);
    return () => observer.disconnect();
    // 장면이 바뀌면 캔버스가 새로 마운트되므로(key) 배율을 다시 건다.
  }, [scene.id]);

  useEffect(() => {
    const animated = scene.nodes.filter((node) => node.keys?.length);
    const paint = (at: number) => {
      for (const node of animated) {
        const element = nodeRefs.current.get(node.id);
        if (!element) continue;
        const pose = sampleTourPose(node.keys, at);
        element.style.opacity = String(pose.opacity);
        element.style.transform = poseTransform(pose);
      }
    };
    if (reduced) {
      paint(scene.poster);
      return;
    }
    let frame = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      paint(((now - startedAt) % scene.duration) / scene.duration);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [scene, reduced]);

  // 첫 렌더는 루프가 붙기 전 한 프레임이다 — 멈춘 장면이면 포스터, 아니면 0초 자세.
  const initialAt = reduced ? scene.poster : 0;
  const bind = (id: string) => (element: HTMLElement | SVGElement | null) => {
    if (element) nodeRefs.current.set(id, element);
    else nodeRefs.current.delete(id);
  };

  // 휴대폰에서는 무대를 쓸어 넘기는 게 버튼보다 먼저 손이 간다. 세로 스크롤은
  // 그대로 둬야 해서(touch-action: pan-y) 가로로 충분히 움직였을 때만 넘긴다.
  const swipeFrom = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={frameRef}
      className="ob-tour-frame"
      style={{ background: TOUR_BACKDROP.light[scene.backdrop] }}
      data-backdrop={scene.backdrop}
      data-testid="onboarding-tour-stage"
      aria-hidden="true"
      onPointerDown={(event) => {
        swipeFrom.current = { x: event.clientX, y: event.clientY };
      }}
      onPointerUp={(event) => {
        const from = swipeFrom.current;
        swipeFrom.current = null;
        if (!from || !onSwipe) return;
        const dx = event.clientX - from.x;
        const dy = event.clientY - from.y;
        if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.5)
          onSwipe(dx < 0 ? 1 : -1);
      }}
      onPointerCancel={() => {
        swipeFrom.current = null;
      }}
    >
      <div
        key={scene.id}
        ref={canvasRef}
        className="ob-tour-canvas"
        style={{ width: TOUR_CANVAS.width, height: TOUR_CANVAS.height }}
      >
        {scene.nodes.map((node) =>
          node.kind === "icon" ? (
            <svg
              key={node.id}
              ref={bind(node.id)}
              className="ob-tour-node"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.2}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={nodeStyle(node, initialAt)}
            >
              {TOUR_ICONS[node.icon].map((d) => (
                <path key={d} d={d} />
              ))}
            </svg>
          ) : (
            <div
              key={node.id}
              ref={bind(node.id)}
              className={
                node.kind === "text"
                  ? "ob-tour-node ob-tour-text"
                  : "ob-tour-node"
              }
              style={nodeStyle(node, initialAt)}
            >
              {node.kind === "text" ? node.text : null}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
