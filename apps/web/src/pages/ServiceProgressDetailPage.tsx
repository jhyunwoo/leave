/**
 * 프로필 복무율 카드에서 여는 전체 화면.
 *
 * 숫자와 두 막대는 하나의 requestAnimationFrame 루프에서 최대 120fps로 갱신한다.
 * 프레임마다 React 상태를 바꾸지 않고 Text 노드와 transform만 써서 화면 전체의
 * 재렌더와 레이아웃 계산을 피한다.
 */

import type { Me } from "@leave/client";
import { kstMidnight } from "@leave/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  HERO_HEAD_DECIMALS,
  percentBetween,
  SERVICE_PERCENT_DECIMALS,
  splitPercentText,
  ZOOM_DECIMAL_PLACE,
  zoomFraction,
  zoomSweepSeconds,
} from "../components/service-progress-format";
import { useReducedMotion } from "../components/use-reduced-motion";
import "./service-progress-detail.css";

const MAX_FPS = 120;
const DRAW_INTERVAL_MS = 1000 / MAX_FPS;

function textParts(percent: number) {
  return splitPercentText(
    percent.toFixed(SERVICE_PERCENT_DECIMALS),
    HERO_HEAD_DECIMALS,
  );
}

export function ServiceProgressDetailPage(props: { me: Me }) {
  const { user } = props.me;
  const [initialNow] = useState(() => Date.now());
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const mainFillRef = useRef<HTMLDivElement>(null);
  const zoomFillRef = useRef<HTMLDivElement>(null);

  const start = kstMidnight(user.enlistedAt);
  const end = kstMidnight(user.dischargeAt);
  const span = end > start ? end - start : 0;
  const initialPercent = percentBetween(start, span, initialNow);
  const initialParts = textParts(initialPercent);
  const initialZoom = zoomFraction(initialPercent, ZOOM_DECIMAL_PLACE);
  const sweep = zoomSweepSeconds(span, ZOOM_DECIMAL_PLACE);
  const finished = initialPercent >= 100;
  const notStarted = initialNow <= start;

  useEffect(() => {
    const root = rootRef.current;
    const headText = headRef.current?.firstChild;
    const tailText = tailRef.current?.firstChild;
    const mainFill = mainFillRef.current;
    const zoomFill = zoomFillRef.current;
    if (
      !root ||
      !(headText instanceof Text) ||
      !(tailText instanceof Text) ||
      !mainFill ||
      !zoomFill ||
      reducedMotion
    ) {
      return;
    }

    let frameId = 0;
    let running = false;
    let intersecting = !("IntersectionObserver" in window);
    let epochAnchor = 0;
    let frameAnchor = 0;
    let nextDue = 0;

    const write = (now: number) => {
      const percent = percentBetween(start, span, now);
      const parts = textParts(percent);
      if (headText.data !== parts.head) headText.data = parts.head;
      if (tailText.data !== parts.tail) tailText.data = parts.tail;
      mainFill.style.transform = `scaleX(${percent / 100})`;
      zoomFill.style.transform = `scaleX(${zoomFraction(percent, ZOOM_DECIMAL_PLACE)})`;
      return now;
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

      const now = write(epochAnchor + (frameNow - frameAnchor));
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
      if (running || !intersecting || document.visibilityState !== "visible") {
        return;
      }
      const now = Date.now();
      write(now);
      if (span <= 0 || now < start || now >= end) return;

      running = true;
      epochAnchor = now;
      frameAnchor = performance.now();
      nextDue = frameAnchor;
      frameId = window.requestAnimationFrame(draw);
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") startAnimation();
      else stopAnimation();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    let observer: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      observer = new IntersectionObserver(([entry]) => {
        intersecting = entry?.isIntersecting ?? false;
        if (intersecting) startAnimation();
        else stopAnimation();
      });
      observer.observe(root);
    } else {
      startAnimation();
    }

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      stopAnimation();
    };
  }, [end, reducedMotion, span, start]);

  const status = finished
    ? "복무를 마쳤어요"
    : notStarted
      ? "입대 전이에요"
      : `전역까지 ${user.daysUntilDischarge}일`;
  const zoomDescription = finished
    ? "전역 시점에서 멈췄어요."
    : notStarted
      ? "입대일부터 움직이기 시작해요."
      : reducedMotion
        ? "동작 줄이기 설정에 따라 현재 위치에 멈춰 있어요."
        : `${sweep.toFixed(1)}초마다 한 칸을 실제 속도로 확대해 보여줘요.`;

  return (
    <main
      ref={rootRef}
      className="service-progress-detail"
      data-testid="service-progress-detail"
    >
      <Link
        to="/profile"
        className="service-progress-detail__close"
        aria-label="복무율 전체 화면 닫기"
        data-testid="service-progress-close"
      >
        <span aria-hidden="true">×</span>
      </Link>

      <div className="service-progress-detail__layout">
        <section className="service-progress-detail__hero">
          <h1 className="service-progress-detail__eyebrow">복무율</h1>
          <div
            className="service-progress-detail__readout"
            aria-hidden="true"
            data-testid="service-progress-value"
          >
            <span ref={headRef} className="service-progress-detail__value-head">
              {initialParts.head}
            </span>
            <span ref={tailRef} className="service-progress-detail__value-tail">
              {initialParts.tail}%
            </span>
          </div>
          <span className="service-progress-detail__sr-only">
            복무율 {initialPercent.toFixed(SERVICE_PERCENT_DECIMALS)}%
          </span>
          <p className="service-progress-detail__status">{status}</p>
        </section>

        <div className="service-progress-detail__panels">
          <section
            className="service-progress-detail__panel service-progress-detail__panel--main"
            role="progressbar"
            aria-label="전체 복무율"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(initialPercent)}
            aria-valuetext={`${initialPercent.toFixed(1)}%`}
            data-testid="service-progress-main"
          >
            <div className="service-progress-detail__panel-heading">
              <h2>전체 복무</h2>
              <span>0% → 100%</span>
            </div>
            <div className="service-progress-detail__main-track">
              <div
                ref={mainFillRef}
                className="service-progress-detail__main-fill"
                style={{ transform: `scaleX(${initialPercent / 100})` }}
                data-testid="service-progress-main-fill"
              />
            </div>
          </section>

          <section
            className="service-progress-detail__panel service-progress-detail__panel--zoom"
            data-testid="service-progress-zoom"
          >
            <div className="service-progress-detail__panel-heading">
              <h2>실시간 확대</h2>
              <span>소수점 {ZOOM_DECIMAL_PLACE}번째 자리</span>
            </div>
            <p>{zoomDescription}</p>
            <div
              className="service-progress-detail__zoom-track"
              aria-hidden="true"
            >
              <div
                ref={zoomFillRef}
                className="service-progress-detail__zoom-fill"
                style={{ transform: `scaleX(${initialZoom})` }}
                data-testid="service-progress-zoom-fill"
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
