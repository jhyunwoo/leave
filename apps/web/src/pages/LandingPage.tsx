/**
 * 비로그인 첫 화면(홍보 랜딩).
 * 검색 유입과 스토어 링크가 닿는 곳이라 로그인 없이 서비스 성격과 법적 고지를
 * 확인할 수 있어야 한다.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BrandLockup } from "../components/BrandLockup";
import "./landing.css";

/** 히어로 달력에 표시할 날짜별 상태. 1일 = 수요일 기준. */
const FIRST_DOW = 3;
const DAYS = 31;
type DayMeta = {
  pill?: string;
  kind?: "full" | "over";
  today?: boolean;
  flip?: boolean;
};
const META: Record<number, DayMeta> = {
  3: { pill: "1/3" },
  10: { pill: "2/3" },
  16: { today: true },
  17: { pill: "2/3" },
  22: { pill: "3/3", kind: "full" },
  24: { flip: true },
};

function HeroCalendar() {
  const cells = Array.from({ length: 35 }, (_, i) => i - FIRST_DOW + 1);
  let pillOrder = 0;
  return (
    <div className="lp-cal lp-anim" aria-hidden="true">
      <div className="lp-cal-head">
        <span className="lp-cal-month">7월</span>
        <span className="lp-cal-cap lp-num">하루 최대 4명</span>
      </div>
      <div className="lp-cal-dow">
        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="lp-cal-grid">
        {cells.map((day, i) => {
          if (day < 1 || day > DAYS) {
            return <div key={i} className="lp-cell is-empty" />;
          }
          const m = META[day];
          const isSun = (FIRST_DOW + day - 1) % 7 === 0;
          const cls = [
            "lp-cell",
            isSun && "is-sun",
            m?.today && "is-today",
            m?.flip && "lp-cell--flip",
          ]
            .filter(Boolean)
            .join(" ");
          const delay = m?.pill ? `${0.25 + pillOrder++ * 0.13}s` : undefined;
          return (
            <div key={i} className={cls}>
              <span className="lp-cell-n lp-num">{day}</span>
              {m?.pill && (
                <span
                  className={`lp-pill lp-num ${m.kind === "full" ? "is-full" : ""}`}
                  style={
                    delay
                      ? ({ "--d": delay } as React.CSSProperties)
                      : undefined
                  }
                >
                  {m.pill}
                </span>
              )}
              {m?.flip && (
                <>
                  <span className="lp-pill lp-num lp-flip-from">2/3</span>
                  <span className="lp-pill lp-num is-over lp-flip-to">
                    3/3 초과
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const VALUES = [
  {
    title: "비율 또는 인원으로 관리",
    body: "부대 인원과 비율(예: 1/3)만 정하면, 하루에 몇 명까지 나갈 수 있는지 자동으로 계산해요.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M4 20V10M12 20V4M20 20v-7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "초과되면 자동 알림",
    body: "누군가 등록해 하루 최대 출타 인원이 넘으면, 그 날 휴가인 부대원 모두에게 앱·푸시 알림이 가요.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path
          d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"
          strokeLinejoin="round"
        />
        <path d="M10 20a2 2 0 0 0 4 0" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "계급 자동 진급",
    body: "입대일만 넣으면 이병부터 병장까지, 진급일에 맞춰 계급이 저절로 올라가요.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <path d="M12 3 4 7l8 4 8-4-8-4Z" strokeLinejoin="round" />
        <path d="M4 12l8 4 8-4M4 17l8 4 8-4" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "한국 공휴일 표시",
    body: "설날·추석은 물론 대체공휴일까지 달력에 함께 보여줘, 휴가 계획이 한결 쉬워져요.",
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      >
        <rect x="3" y="5" width="18" height="16" rx="3" />
        <path d="M3 9h18M8 3v4M16 3v4" strokeLinecap="round" />
      </svg>
    ),
  },
];

const STEPS = [
  {
    n: "01",
    title: "부대 만들기 · 찾기",
    body: "부대를 만들면 관리자가 되고, 이미 있으면 검색해서 가입을 신청해요.",
  },
  {
    n: "02",
    title: "휴가 등록",
    body: "달력에서 날짜를 골라 휴가를 등록하면 부대원 모두에게 바로 공유돼요.",
  },
  {
    n: "03",
    title: "출타 인원 지키기",
    body: "빈 날은 한눈에, 넘치는 날은 미리 알림으로. 겹침 없이 계획해요.",
  },
];

/** 스크롤 진입 시 나타나는 요소들을 관찰. */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll(".lp-reveal");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
}

export function LandingPage() {
  const [stuck, setStuck] = useState(false);
  useReveal();

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="lp-root">
      <nav className={`lp-nav ${stuck ? "is-stuck" : ""}`} aria-label="주 메뉴">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-brand">
            <BrandLockup iconSize={30} />
          </Link>
          <span className="lp-nav-spacer" />
          <Link to="/login" className="lp-nav-link is-hideable">
            로그인
          </Link>
          <Link to="/signup" className="lp-btn lp-btn--primary">
            무료로 시작하기
          </Link>
        </div>
      </nav>

      <header className="lp-hero">
        <div className="lp-wrap lp-hero-grid">
          <div>
            <h1 className="lp-h1">
              부대 휴가,
              <br />
              <em>겹치지 않게.</em>
            </h1>
            <p className="lp-sub">
              하루 최대 출타 인원에 맞춰 비어 있는 날을 한눈에 보고, 초과되는
              날은 함께 조율하세요.
            </p>
            <div className="lp-cta-row">
              <Link to="/signup" className="lp-btn lp-btn--primary lp-btn--lg">
                무료로 시작하기
              </Link>
              <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">
                로그인
              </Link>
            </div>
          </div>
          <HeroCalendar />
        </div>
      </header>

      <section className="lp-values">
        <div className="lp-wrap">
          <div className="lp-reveal">
            <p className="lp-sec-eyebrow">한눈에</p>
            <h2 className="lp-sec-title">
              부대 휴가에 필요한 건, 이미 다 있어요.
            </h2>
          </div>
          <div className="lp-value-grid">
            {VALUES.map((v) => (
              <article key={v.title} className="lp-value lp-reveal">
                <div className="lp-value-ic">{v.icon}</div>
                <h3>{v.title}</h3>
                <p>{v.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-steps">
        <div className="lp-wrap">
          <div className="lp-reveal">
            <p className="lp-sec-eyebrow">사용 방법</p>
            <h2 className="lp-sec-title">3단계면 부대 달력이 열려요.</h2>
          </div>
          <div className="lp-step-grid">
            {STEPS.map((s) => (
              <div key={s.n} className="lp-step lp-reveal">
                <span className="lp-step-n lp-num">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lp-cta" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <div className="lp-band lp-reveal">
            <div className="lp-band-grid">
              <div>
                <p className="lp-band-eyebrow">실시간 출타 초과 알림</p>
                <h2>
                  출타 인원이 넘는 순간,
                  <br />그 날 휴가인 모두가 알아요.
                </h2>
                <p>
                  한 명이 더 등록해 하루 최대 출타 인원을 넘기면, 같은 날 휴가인
                  부대원 전원에게 인앱·푸시 알림이 갑니다. 누가 일정을 조정해야
                  할지 바로 보여요.
                </p>
              </div>
              <div className="lp-notif">
                <div className="lp-notif-row">
                  <span className="lp-notif-ic">!</span>
                  <div>
                    <div className="lp-notif-t">최대 출타 인원 초과 안내</div>
                    <div className="lp-notif-meta lp-num">리브 · 7월 24일</div>
                  </div>
                </div>
                <p className="lp-notif-b">
                  <span className="lp-num">7월 24일</span> 출타 인원이{" "}
                  <span className="lp-over-word lp-num">3/3명</span>으로 최대
                  출타 인원을 넘었어요. 휴가가 겹친 부대원끼리 일정을 조율해
                  주세요.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-delight">
        <div className="lp-wrap">
          <div className="lp-delight-card lp-reveal">
            <div>
              <p className="lp-sec-eyebrow">계급 · 전역</p>
              <h2
                className="lp-sec-title"
                style={{ fontSize: "clamp(22px,3vw,30px)" }}
              >
                진급도, 전역 카운트도 자동으로.
              </h2>
              <div className="lp-ranks" style={{ marginTop: 18 }}>
                <span className="lp-rank">이병</span>
                <span className="lp-rank-arrow">→</span>
                <span className="lp-rank">일병</span>
                <span className="lp-rank-arrow">→</span>
                <span className="lp-rank is-on">상병</span>
                <span className="lp-rank-arrow">→</span>
                <span className="lp-rank">병장</span>
              </div>
            </div>
            <div className="lp-dday">
              <div className="lp-dday-k">전역까지</div>
              <div className="lp-dday-v lp-num">
                D<span>-232</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="lp-cta">
        <div className="lp-wrap">
          <div className="lp-cta-card lp-reveal">
            <h2>부대 달력, 지금 열어보세요.</h2>
            <p>가입은 무료예요. 웹에서 바로 시작할 수 있어요.</p>
            <div className="lp-cta-row">
              <Link to="/signup" className="lp-btn lp-btn--primary lp-btn--lg">
                무료로 시작하기
              </Link>
              <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">
                로그인
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <Link to="/" className="lp-brand" style={{ fontSize: 18 }}>
            <BrandLockup iconSize={26} />
          </Link>
          <div className="lp-footer-links">
            <Link to="/login">로그인</Link>
            <Link to="/signup">회원가입</Link>
          </div>
          <p className="lp-footer-fine">부대 휴가를 겹치지 않게 · 리브</p>
        </div>
      </footer>
    </div>
  );
}
