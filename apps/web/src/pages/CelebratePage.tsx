/**
 * 복무 기념일 축하 화면 — 전역 D-n(600·500·…·10일 전, 하루 전)과 진급.
 *
 * 알림함에서 내 기념일 알림을 누르면 열린다(`/celebrate?kind=…&days=…|rank=…`).
 * 기념일은 주소에서 읽고, 이름·복무율·전역일은 지금의 `me`에서 읽는다 — 알림을
 * 며칠 뒤에 열어도 숫자가 오늘 기준으로 맞는다.
 *
 * 색종이는 CSS 애니메이션 한 번이다. 동작 줄이기를 켠 사람에게는 그리지 않는다.
 */

import type { Me } from "@leave/client";
import { milestoneCelebration, parseMilestoneParams } from "@leave/shared";
import type { CSSProperties } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useReducedMotion } from "../components/use-reduced-motion";
import "./celebrate.css";

const CONFETTI_COLORS = ["#9fe870", "#ffd11a", "#347a1f", "#cdffad", "#ffffff"];
const CONFETTI_COUNT = 36;

/**
 * 색종이 조각의 위치·지연·회전. 렌더마다 바뀌면 다시 그릴 때 조각이 튀므로
 * 난수 대신 인덱스에서 결정적으로 만든다.
 */
const CONFETTI = Array.from({ length: CONFETTI_COUNT }, (_, index) => ({
  left: (index * 37) % 100,
  delay: ((index * 7) % 12) / 10,
  duration: 2.6 + ((index * 13) % 10) / 10,
  rotate: (index * 47) % 360,
  drift: ((index % 5) - 2) * 18,
  color: CONFETTI_COLORS[index % CONFETTI_COLORS.length],
  wide: index % 3 === 0,
}));

export function CelebratePage(props: { me: Me }) {
  const { user } = props.me;
  const [params] = useSearchParams();
  const reducedMotion = useReducedMotion();
  const milestone = parseMilestoneParams({
    kind: params.get("kind"),
    days: params.get("days"),
    rank: params.get("rank"),
  });
  if (!milestone) return <Navigate to="/notifications" replace />;

  const copy = milestoneCelebration(milestone);
  const progress = Math.round(user.serviceProgress * 1000) / 10;

  return (
    <main className="celebrate" data-testid="celebrate-page">
      {!reducedMotion && (
        <div className="celebrate__confetti" aria-hidden="true">
          {CONFETTI.map((piece, index) => (
            <span
              key={index}
              className={`celebrate__piece${piece.wide ? " is-wide" : ""}`}
              style={
                {
                  left: `${piece.left}%`,
                  background: piece.color,
                  animationDelay: `${piece.delay}s`,
                  animationDuration: `${piece.duration}s`,
                  "--rotate": `${piece.rotate}deg`,
                  "--drift": `${piece.drift}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      <Link
        to="/notifications"
        className="celebrate__close"
        aria-label="축하 화면 닫기"
      >
        <span aria-hidden="true">×</span>
      </Link>

      <section className="celebrate__card">
        <p className="celebrate__eyebrow">{copy.eyebrow}</p>
        <p className="celebrate__hero" aria-hidden="true">
          {copy.hero}
          {copy.heroUnit && (
            <span className="celebrate__hero-unit">{copy.heroUnit}</span>
          )}
        </p>
        <h1 className="celebrate__headline">
          {user.name}님, {copy.headline}
        </h1>
        <p className="celebrate__message">{copy.message}</p>

        <dl className="celebrate__stats">
          <div>
            <dt>지금 계급</dt>
            <dd>{user.rankLabel}</dd>
          </div>
          <div>
            <dt>복무율</dt>
            <dd>{progress.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>전역일</dt>
            {/* D-600이면 해를 넘기므로 연도까지 쓴다. */}
            <dd>{user.dischargeAt.replaceAll("-", ".")}</dd>
          </div>
        </dl>

        <div className="celebrate__progress" aria-hidden="true">
          <div
            className="celebrate__progress-fill"
            style={{ transform: `scaleX(${user.serviceProgress})` }}
          />
        </div>

        <div className="celebrate__actions">
          <Link to="/service-progress" className="btn btn-secondary">
            복무율 크게 보기
          </Link>
          <Link to="/" className="btn btn-primary">
            달력으로
          </Link>
        </div>
      </section>
    </main>
  );
}
