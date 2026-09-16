/**
 * 비로그인 첫 화면(홍보 랜딩)이자 이 사이트의 유일한 색인 대상 진입점.
 *
 * 검색 유입과 스토어 링크가 닿는 곳이라 두 가지를 동시에 지켜야 한다.
 *  1) 로그인 없이 서비스 성격과 법적 고지를 확인할 수 있어야 한다.
 *  2) 자바스크립트를 실행하지 않는 크롤러(네이버 Yeti, OAI-SearchBot 등)도
 *     같은 본문을 읽을 수 있어야 한다 → 이 컴포넌트는 빌드 시 그대로 HTML로
 *     구워진다(`scripts/build-seo.mjs`). 그래서 여기서는 첫 렌더에 데이터
 *     패칭이나 `window` 접근에 기대는 표현을 두지 않는다.
 *
 * 문구 규칙: 구현돼 있지 않은 기능을 적지 않는다. 하루 최대 출타 인원은
 * 그룹 관리자가 **인원수로 직접** 정한다(비율 입력은 없다 —
 * `components/LeaveLimitFields.tsx`). 공식성·소속을 암시하는 표현도 쓰지 않는다.
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
    title: "하루 최대 출타 인원 기준",
    body: "그룹 관리자가 하루에 몇 명까지 나갈 수 있는지 인원으로 정하면, 달력이 날짜마다 출타 인원을 세어 여유·보통·임박·초과를 색으로 알려줘요.",
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
    body: "누군가 등록해 하루 최대 출타 인원이 넘으면, 그날 휴가인 부대원 모두에게 인앱 알림이 가고 모바일 앱에서는 푸시로도 알려줘요.",
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
    body: "입대일과 군종만 넣으면 이병부터 병장까지 진급일에 맞춰 계급이 저절로 올라가고, 전역까지 남은 날도 함께 보여줘요.",
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
    title: "그룹 만들기 · 참여하기",
    body: "그룹을 만들면 관리자가 되고, 하루 최대 출타 인원을 정해요. 이미 있는 그룹에는 초대코드로 참여합니다.",
  },
  {
    n: "02",
    title: "휴가 등록",
    body: "달력에서 날짜를 골라 휴가를 등록하면 같은 그룹 사람들에게 바로 공유돼요.",
  },
  {
    n: "03",
    title: "출타 인원 지키기",
    body: "빈 날은 한눈에, 넘치는 날은 미리 알림으로. 겹침 없이 계획해요.",
  },
];

const PERSONAL = [
  {
    title: "재원별 잔여와 만기",
    body: "연가·포상·위로·청원휴가와 병가를 재원별로 나눠 기록하고, 만기가 빠른 적립분부터 자동으로 계산해요.",
  },
  {
    title: "공군·해군 정기외박",
    body: "주기 시작일과 회당 적립 일수를 정하면 이번 주기의 잔여와 다음 적립일을 계산해요.",
  },
  {
    title: "친구끼리 일정 비교",
    body: "서로 수락한 친구끼리 공유한 휴가의 날짜와 상태만 최대 10명까지 한 달력에서 비교해요.",
  },
  {
    title: "나만 보는 개인 일정",
    body: "휴가와 별개인 개인 일정은 그룹 통계·잔여·알림에 들어가지 않고 나에게만 보여요.",
  },
];

/**
 * 사람이 실제로 묻는 것만 담는다. 각 답은 저장소의 구현·약관에서 확인할 수
 * 있는 사실이어야 한다 — 이 문구가 곧 구조화 데이터와 AI 답변의 근거가 된다.
 */
const FAQ = [
  {
    q: "리브는 어떤 서비스인가요?",
    a: "같은 그룹(부대) 사람들의 휴가 계획을 한 달력에 모아, 하루 최대 출타 인원을 넘는 날을 미리 확인하는 캘린더입니다. 웹과 iOS·Android 앱에서 같은 계정으로 씁니다.",
  },
  {
    q: "누구를 위한 서비스인가요?",
    a: "휴가 일정을 서로 맞춰야 하는 병사와, 하루에 몇 명까지 나갈 수 있는지 관리해야 하는 그룹 관리자를 위한 도구입니다. 만 18세 이상을 대상으로 합니다.",
  },
  {
    q: "하루 최대 출타 인원은 어떻게 정해지나요?",
    a: "그룹을 만든 관리자가 인원수로 직접 정하고 언제든 바꿀 수 있어요. 리브가 부대 정원을 알아내거나 비율로 대신 계산하지 않습니다.",
  },
  {
    q: "출타 인원이 넘치면 어떻게 되나요?",
    a: "그 날짜가 달력에서 초과로 표시되고, 그날 휴가가 걸린 부대원 모두에게 알림이 갑니다. 리브가 휴가를 막거나 취소하지는 않아요 — 조율은 사람이 합니다.",
  },
  {
    q: "부대원의 휴가가 얼마나 보이나요?",
    a: "집계 대상 휴가의 표시명·기간·상태만 보입니다. 휴가 제목과 사유는 공유되지 않고, 개인 일정은 아예 다른 사람에게 보이지 않습니다.",
  },
  {
    q: "한국 공휴일도 표시되나요?",
    a: "네. 설날·추석 같은 음력 공휴일과 대체공휴일까지 달력에 함께 표시합니다.",
  },
  {
    q: "계급 진급은 어떻게 계산하나요?",
    a: "입대일과 군종을 기준으로, 진급 최저복무기간을 채운 뒤 처음 오는 매월 1일에 진급하는 표준 일정으로 계산합니다. 가입할 때 등록한 계급이 더 높으면 그 계급을 유지합니다.",
  },
  {
    q: "무료인가요?",
    a: "네. 가입과 이용에 요금이 없고 결제 기능도 없습니다.",
  },
  {
    q: "웹에서도 쓸 수 있나요?",
    a: "네. 브라우저에서 바로 쓸 수 있고, iOS·Android 앱에서는 푸시 알림도 받습니다.",
  },
  {
    q: "공식 군 서비스인가요?",
    a: "아닙니다. 리브는 국방부·각 군·소속 부대와 무관한 개인 개발 서비스입니다. 화면의 출타 계산은 이용자가 입력한 계획과 관리자가 정한 기준으로 만든 참고용 추정치이며, 실제 휴가는 지휘관 승인과 소속 부대 지침을 따릅니다.",
  },
  {
    q: "실제 부대 정보를 입력해도 되나요?",
    a: "넣지 마세요. 실제 부대명·부대번호·위치, 군번, 공식 문서, 병력 현황은 입력이 금지돼 있고, 표시명에는 실명 대신 별칭을 권장합니다.",
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
      <a className="lp-skip" href="#main">
        본문 바로가기
      </a>

      <nav className={`lp-nav ${stuck ? "is-stuck" : ""}`} aria-label="주 메뉴">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-brand" aria-label="리브 홈">
            <BrandLockup iconSize={30} />
          </Link>
          <span className="lp-nav-spacer" />
          <Link to="/guide" className="lp-nav-link is-hideable">
            사용 가이드
          </Link>
          <Link to="/login" className="lp-nav-link is-hideable">
            로그인
          </Link>
          <Link to="/signup" className="lp-btn lp-btn--primary">
            무료로 시작하기
          </Link>
        </div>
      </nav>

      <main id="main">
        <header className="lp-hero">
          <div className="lp-wrap lp-hero-grid">
            <div>
              <h1 className="lp-h1">
                부대 휴가 일정,
                <br />
                <em>겹치지 않게.</em>
              </h1>
              <p className="lp-sub">
                하루 최대 출타 인원에 맞춰 비어 있는 날을 한눈에 보고, 초과되는
                날은 미리 조율하세요. Web, Android, iOS, iPad OS를 지원합니다.
              </p>
              <div className="lp-cta-row">
                <Link
                  to="/signup"
                  className="lp-btn lp-btn--primary lp-btn--lg"
                >
                  무료로 시작하기
                </Link>
                <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">
                  로그인
                </Link>
              </div>
              <p className="lp-hero-note">
                국방부·각 군·소속 부대와 무관한 비공식 참고 도구입니다. 화면의
                출타 계산은 추정치이며 공식 승인·기록이 아닙니다.
              </p>
            </div>
            <HeroCalendar />
          </div>
        </header>

        <section className="lp-values" aria-labelledby="features-title">
          <div className="lp-wrap">
            <div className="lp-reveal">
              <p className="lp-sec-eyebrow">한눈에</p>
              <h2 className="lp-sec-title" id="features-title">
                부대 휴가에 필요한 건, 이미 다 있어요.
              </h2>
            </div>
            <div className="lp-value-grid">
              {VALUES.map((v) => (
                <article key={v.title} className="lp-value lp-reveal">
                  <div className="lp-value-ic" aria-hidden="true">
                    {v.icon}
                  </div>
                  <h3>{v.title}</h3>
                  <p>{v.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-steps" aria-labelledby="how-title">
          <div className="lp-wrap">
            <div className="lp-reveal">
              <p className="lp-sec-eyebrow">사용 방법</p>
              <h2 className="lp-sec-title" id="how-title">
                3단계면 그룹 달력이 열려요.
              </h2>
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
            <p className="lp-steps-more lp-reveal">
              단계별 설명과 계산 기준은{" "}
              <Link to="/guide">부대 휴가 일정 조율 가이드</Link>에 정리돼
              있어요.
            </p>
          </div>
        </section>

        <section
          className="lp-cta"
          style={{ paddingTop: 12 }}
          aria-labelledby="alert-title"
        >
          <div className="lp-wrap">
            <div className="lp-band lp-reveal">
              <div className="lp-band-grid">
                <div>
                  <p className="lp-band-eyebrow">출타 인원 초과 알림</p>
                  <h2 id="alert-title">
                    출타 인원이 넘는 순간,
                    <br />그 날 휴가인 모두가 알아요.
                  </h2>
                  <p>
                    한 명이 더 등록해 하루 최대 출타 인원을 넘기면, 같은 날
                    휴가인 부대원 전원에게 인앱 알림이 갑니다(모바일 앱에서는
                    푸시로도). 누가 일정을 조정해야 할지 바로 보여요.
                  </p>
                </div>
                <div className="lp-notif">
                  <div className="lp-notif-row">
                    <span className="lp-notif-ic" aria-hidden="true">
                      !
                    </span>
                    <div>
                      <div className="lp-notif-t">최대 출타 인원 초과 안내</div>
                      <div className="lp-notif-meta lp-num">
                        리브 · 7월 24일
                      </div>
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

        <section className="lp-values" aria-labelledby="personal-title">
          <div className="lp-wrap">
            <div className="lp-reveal">
              <p className="lp-sec-eyebrow">내 휴가</p>
              <h2 className="lp-sec-title" id="personal-title">
                내 휴가도 같은 달력에서 관리해요.
              </h2>
            </div>
            <div className="lp-value-grid">
              {PERSONAL.map((item) => (
                <article
                  key={item.title}
                  className="lp-value lp-value--text lp-reveal"
                >
                  <h3>{item.title}</h3>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-delight" aria-labelledby="rank-title">
          <div className="lp-wrap">
            <div className="lp-delight-card lp-reveal">
              <div>
                <p className="lp-sec-eyebrow">계급 · 전역</p>
                <h2
                  className="lp-sec-title"
                  id="rank-title"
                  style={{ fontSize: "clamp(22px,3vw,30px)" }}
                >
                  진급도, 전역 카운트도 자동으로.
                </h2>
                <div className="lp-ranks" style={{ marginTop: 18 }}>
                  <span className="lp-rank">이병</span>
                  <span className="lp-rank-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="lp-rank">일병</span>
                  <span className="lp-rank-arrow" aria-hidden="true">
                    →
                  </span>
                  <span className="lp-rank is-on">상병</span>
                  <span className="lp-rank-arrow" aria-hidden="true">
                    →
                  </span>
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

        <section className="lp-faq" aria-labelledby="faq-title">
          <div className="lp-wrap">
            <div className="lp-reveal">
              <p className="lp-sec-eyebrow">자주 묻는 질문</p>
              <h2 className="lp-sec-title" id="faq-title">
                궁금한 것들.
              </h2>
            </div>
            <div className="lp-faq-grid">
              {FAQ.map((item) => (
                <div key={item.q} className="lp-faq-item lp-reveal">
                  <h3>{item.q}</h3>
                  <p>{item.a}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="lp-cta" aria-labelledby="start-title">
          <div className="lp-wrap">
            <div className="lp-cta-card lp-reveal">
              <h2 id="start-title">부대 달력, 지금 열어보세요.</h2>
              <p>가입은 무료예요. 웹에서 바로 시작할 수 있어요.</p>
              <div className="lp-cta-row">
                <Link
                  to="/signup"
                  className="lp-btn lp-btn--primary lp-btn--lg"
                >
                  무료로 시작하기
                </Link>
                <Link to="/login" className="lp-btn lp-btn--ghost lp-btn--lg">
                  로그인
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <div className="lp-footer-top">
            <Link to="/" className="lp-brand" aria-label="리브 홈">
              <BrandLockup iconSize={26} />
            </Link>
            <nav className="lp-footer-links" aria-label="사이트 링크">
              <Link to="/guide">사용 가이드</Link>
              <Link to="/login">로그인</Link>
              <Link to="/signup">회원가입</Link>
              <a href="/privacy">개인정보 처리방침</a>
              <a href="/terms">이용약관</a>
              <a href="/support">지원·문의</a>
              <a href="/delete-account">계정 삭제</a>
            </nav>
          </div>
          <p className="lp-footer-fine">
            리브(Leave)는 국방부·각 군·소속 부대와 무관한 비공식 개인 개발
            서비스입니다. 부대 휴가를 겹치지 않게 · © 2026 Leave
          </p>
        </div>
      </footer>
    </div>
  );
}
