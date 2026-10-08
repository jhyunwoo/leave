/**
 * 프로필 복무율 카드에서 여는 전체 화면.
 *
 * 숫자와 막대는 하나의 requestAnimationFrame 루프에서 최대 120fps로 갱신한다.
 * 프레임마다 React 상태를 바꾸지 않고 Text 노드와 transform만 써서 화면 전체의
 * 재렌더와 레이아웃 계산을 피한다.
 */

import type { Me } from "@leave/client";
import { useMyDutyDays } from "@leave/client";
import { fmtDateShort, kstMidnight, type ISODate } from "@leave/shared";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  HERO_HEAD_DECIMALS,
  percentBetween,
  SERVICE_PERCENT_DECIMALS,
  splitPercentText,
} from "../components/service-progress-format";
import { useReducedMotion } from "../components/use-reduced-motion";
import "./service-progress-detail.css";

const MAX_FPS = 120;
const DRAW_INTERVAL_MS = 1000 / MAX_FPS;

/** "2026년 3월 23일". 막대 양 끝 이름표라 요일은 뺀다. */
function fmtDateYear(date: ISODate): string {
  return `${date.slice(0, 4)}년 ${fmtDateShort(date)}`;
}

function textParts(percent: number) {
  return splitPercentText(
    percent.toFixed(SERVICE_PERCENT_DECIMALS),
    HERO_HEAD_DECIMALS,
  );
}

export function ServiceProgressDetailPage(props: { me: Me }) {
  const { user } = props.me;
  const dutyDays = useMyDutyDays();
  const [initialNow] = useState(() => Date.now());
  const reducedMotion = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const headRef = useRef<HTMLSpanElement>(null);
  const tailRef = useRef<HTMLSpanElement>(null);
  const mainFillRef = useRef<HTMLDivElement>(null);

  const start = kstMidnight(user.enlistedAt);
  const end = kstMidnight(user.dischargeAt);
  const span = end > start ? end - start : 0;
  const initialPercent = percentBetween(start, span, initialNow);
  const initialParts = textParts(initialPercent);
  const finished = initialPercent >= 100;
  const notStarted = initialNow <= start;

  useEffect(() => {
    const root = rootRef.current;
    const headText = headRef.current?.firstChild;
    const tailText = tailRef.current?.firstChild;
    const mainFill = mainFillRef.current;
    if (
      !root ||
      !(headText instanceof Text) ||
      !(tailText instanceof Text) ||
      !mainFill ||
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

  // 남은 일과일은 서버에서 따로 오므로 도착한 뒤에만 덧붙인다. 복무를 마쳤거나
  // 입대 전이면 셀 일과가 없어 붙일 자리도 없다.
  const dutyDaysSuffix = dutyDays.data
    ? ` · 남은 일과 ${dutyDays.data.dutyDays}일`
    : "";
  const status = finished
    ? "복무를 마쳤어요"
    : notStarted
      ? "입대 전이에요"
      : `전역까지 ${user.daysUntilDischarge}일${dutyDaysSuffix}`;
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

        <section
          className="service-progress-detail__panel"
          role="progressbar"
          aria-label="전체 복무율"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(initialPercent)}
          aria-valuetext={`${initialPercent.toFixed(1)}%`}
          data-testid="service-progress-main"
        >
          <div className="service-progress-detail__main-track">
            <div
              ref={mainFillRef}
              className="service-progress-detail__main-fill"
              style={{ transform: `scaleX(${initialPercent / 100})` }}
              data-testid="service-progress-main-fill"
            />
          </div>
          <div className="service-progress-detail__ends">
            <span>입대 {fmtDateYear(user.enlistedAt)}</span>
            <span>전역 {fmtDateYear(user.dischargeAt)}</span>
          </div>
        </section>
      </div>
    </main>
  );
}
