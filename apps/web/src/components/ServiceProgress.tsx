/**
 * 웹 프로필의 복무 진행률.
 *
 * 소수점 열 자리 숫자는 최대 120fps로 흐르지만 React 상태는 분 단위 값만 가진다.
 * 매 프레임에는 고정 폭 숫자 안의 Text 노드 하나만 바꿔 프로필 전체 리렌더와
 * 조상 레이아웃을 피한다.
 *
 * 텍스트 내용이 바뀌면 새 글리프는 어차피 다시 그려야 한다. WebGPU/Canvas나
 * `will-change`로 합성 레이어를 강제해도 그 비용은 없어지지 않고 GPU 메모리만
 * 늘 수 있어 사용하지 않는다. 대신 화면 밖·백그라운드·동작 줄이기에서는 루프를
 * 아예 멈춘다.
 */

import { kstMidnight, type ISODate } from "@leave/shared";
import { useEffect, useRef, useState } from "react";
import {
  formatPercent,
  percentBetween,
  SERVICE_PERCENT_DECIMALS,
} from "./service-progress-format";
import { useReducedMotion } from "./use-reduced-motion";

const STATIC_DECIMALS = 1;
const MAX_FPS = 120;
const DRAW_INTERVAL_MS = 1000 / MAX_FPS;
const SLOW_TICK_MS = 60_000;

/** 막대와 접근성 값은 보이는 탭에서만 1분에 한 번 갱신한다. */
function useSlowClock(initialNow: number): {
  visible: boolean;
  now: number;
} {
  const [clock, setClock] = useState(() => ({
    visible: document.visibilityState === "visible",
    now: initialNow,
  }));

  useEffect(() => {
    let intervalId = 0;

    const stop = () => {
      if (intervalId !== 0) window.clearInterval(intervalId);
      intervalId = 0;
    };
    const start = () => {
      stop();
      if (document.visibilityState !== "visible") return;
      intervalId = window.setInterval(() => {
        setClock({ visible: true, now: Date.now() });
      }, SLOW_TICK_MS);
    };
    const onVisibilityChange = () => {
      const visible = document.visibilityState === "visible";
      setClock({ visible, now: Date.now() });
      if (visible) start();
      else stop();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stop();
    };
  }, []);

  return clock;
}

const numberStyle = {
  display: "inline-block",
  width: "15ch",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
} as const;

/**
 * React가 만든 Text 노드의 data만 갱신한다. 부모가 분 단위로 다시 렌더되어도 초기
 * children은 변하지 않으므로 React와 이 고빈도 값이 서로 덮어쓰지 않는다.
 */
function LivePercentReadout(props: {
  start: number;
  span: number;
  active: boolean;
  initialNow: number;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);
  const initial = formatPercent(
    percentBetween(props.start, props.span, props.initialNow),
    SERVICE_PERCENT_DECIMALS,
  );

  useEffect(() => {
    const value = valueRef.current;
    const text = value?.firstChild;
    if (!value || !(text instanceof Text) || !props.active) return;

    const end = props.start + props.span;
    let frameId = 0;
    let running = false;
    let intersecting = !("IntersectionObserver" in window);
    let epochAnchor = 0;
    let frameAnchor = 0;
    let nextDue = 0;

    const write = (now: number): number => {
      const percent = percentBetween(props.start, props.span, now);
      const label = formatPercent(percent, SERVICE_PERCENT_DECIMALS);
      if (text.data !== label) text.data = label;
      return percent;
    };

    const stopAnimation = () => {
      running = false;
      if (frameId !== 0) window.cancelAnimationFrame(frameId);
      frameId = 0;
    };

    const draw = (frameNow: number) => {
      frameId = 0;
      if (!running) return;
      if (frameNow < nextDue) {
        frameId = window.requestAnimationFrame(draw);
        return;
      }

      const now = epochAnchor + (frameNow - frameAnchor);
      write(now);
      if (now >= end) {
        running = false;
        return;
      }

      const followingDue = nextDue + DRAW_INTERVAL_MS;
      nextDue =
        followingDue < frameNow ? frameNow + DRAW_INTERVAL_MS : followingDue;
      frameId = window.requestAnimationFrame(draw);
    };

    const startAnimation = () => {
      if (running || !intersecting) return;
      const now = Date.now();
      write(now);
      if (props.span <= 0 || now < props.start || now >= end) return;

      running = true;
      epochAnchor = now;
      frameAnchor = performance.now();
      nextDue = frameAnchor;
      frameId = window.requestAnimationFrame(draw);
    };

    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        intersecting = entry?.isIntersecting ?? false;
        if (intersecting) startAnimation();
        else stopAnimation();
      });
      observer.observe(value);
    } else {
      startAnimation();
    }

    return () => {
      observer?.disconnect();
      stopAnimation();
    };
  }, [props.active, props.span, props.start]);

  return (
    <span
      ref={valueRef}
      style={numberStyle}
      data-testid="profile-service-progress-value"
    >
      {initial}
    </span>
  );
}

/** 복무 진행률 막대와 실시간 퍼센트. */
export function ServiceProgress(props: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  caption: string;
}) {
  const [initialNow] = useState(() => Date.now());
  const clock = useSlowClock(initialNow);
  const reducedMotion = useReducedMotion();
  const start = kstMidnight(props.enlistedAt);
  const end = kstMidnight(props.dischargeAt);
  const span = end > start ? end - start : 0;
  const slowPercent = percentBetween(start, span, clock.now);

  return (
    <div style={{ marginTop: "var(--sp-2xl)" }}>
      <div
        role="progressbar"
        aria-valuenow={Math.round(slowPercent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuetext={`복무 ${slowPercent.toFixed(STATIC_DECIMALS)}%`}
        aria-label="복무 진행률"
        style={{
          height: 10,
          borderRadius: "var(--r-pill)",
          background: "var(--hairline)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${slowPercent}%`,
            height: "100%",
            borderRadius: "var(--r-pill)",
            background: "var(--primary)",
            transition: "width 240ms var(--ease-out)",
          }}
        />
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--sp-sm)",
          flexWrap: "wrap",
          marginTop: "var(--sp-sm)",
        }}
      >
        <span
          className="caption text-mute"
          aria-hidden="true"
          data-testid="profile-service-progress"
          style={{ whiteSpace: "nowrap" }}
        >
          복무{" "}
          {reducedMotion ? (
            <span
              style={numberStyle}
              data-testid="profile-service-progress-value"
            >
              {formatPercent(slowPercent, STATIC_DECIMALS)}
            </span>
          ) : (
            <LivePercentReadout
              start={start}
              span={span}
              active={clock.visible}
              initialNow={initialNow}
            />
          )}
        </span>
        <span
          className="caption text-mute"
          data-testid="profile-service-progress-caption"
          style={{ marginLeft: "auto", textAlign: "right" }}
        >
          {props.caption}
        </span>
      </div>
    </div>
  );
}
