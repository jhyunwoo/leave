/**
 * 없는 주소에 대한 404 화면.
 *
 * 이 컴포넌트는 빌드 시 `dist/404.html`로 구워지고, 워커가 그 문서를
 * **404 상태 코드로** 낸다. 앱 자바스크립트를 싣지 않는다 — SPA를 태우면
 * 라우터가 "모르는 주소"를 로그인으로 넘겨 버려서, 사용자에게도 검색엔진에도
 * "이 주소는 없다"가 아니라 "로그인하라"로 보인다(soft 404).
 *
 * 그래서 라우터가 없고, 이동은 전부 평범한 <a href>다.
 *
 * 스타일은 두 곳에서 온다.
 *  - 상단바·버튼: 앱의 주 CSS 번들(landing.css가 그 안에 있다). 404 문서도
 *    그 <link>를 그대로 물려받는다.
 *  - 이 화면 고유의 배치: `not-found.css`. 이 컴포넌트는 브라우저 번들에
 *    들어가지 않으므로 그 파일은 CSS 번들에 포함되지 않는다. 그래서
 *    `scripts/build-seo.mjs`가 404 문서의 <head>에 직접 넣는다.
 */

import { BrandLockup } from "../components/BrandLockup";

export function NotFoundPage() {
  return (
    <div className="lp-root nf-root">
      <nav className="lp-nav is-stuck" aria-label="주 메뉴">
        <div className="lp-wrap lp-nav-in">
          <a href="/" className="lp-brand" aria-label="리브 홈">
            <BrandLockup iconSize={30} />
          </a>
          <span className="lp-nav-spacer" />
          <a href="/login" className="lp-nav-link is-hideable">
            로그인
          </a>
          <a href="/signup" className="lp-btn lp-btn--primary">
            무료로 시작하기
          </a>
        </div>
      </nav>

      <main id="main" className="nf-main">
        <div className="lp-wrap">
          <div className="nf-inner">
            <p className="nf-code lp-num">404</p>
            <h1>페이지를 찾을 수 없어요</h1>
            <p className="nf-body">
              주소가 바뀌었거나 없는 페이지예요. 아래에서 필요한 곳으로 이동할
              수 있어요.
            </p>
            <div className="lp-cta-row nf-actions">
              <a href="/" className="lp-btn lp-btn--primary lp-btn--lg">
                리브 홈으로
              </a>
              <a href="/guide" className="lp-btn lp-btn--ghost lp-btn--lg">
                사용 가이드
              </a>
            </div>
            <nav className="nf-links" aria-label="다른 페이지">
              <a href="/login">로그인</a>
              <a href="/signup">회원가입</a>
              <a href="/support">지원·문의</a>
              <a href="/privacy">개인정보 처리방침</a>
              <a href="/terms">이용약관</a>
            </nav>
          </div>
        </div>
      </main>
    </div>
  );
}
