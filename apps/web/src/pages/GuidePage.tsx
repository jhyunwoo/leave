/**
 * 공개 안내 문서 — `/guide`.
 *
 * 랜딩이 "무엇을 해 주는가"를 말한다면 여기는 "어떤 기준으로 계산하는가"를
 * 말한다. 두 번째 색인 대상 페이지이고, 랜딩과 같은 방식으로 빌드 시 HTML로
 * 구워진다(`scripts/build-seo.mjs`).
 *
 * 이 문서에 적는 숫자와 규칙은 전부 `packages/shared`의 구현에서 온 것이어야
 * 한다. 군 규정을 해설하지 않는다 — 리브가 무엇을 어떻게 계산하는지만 적고,
 * 실제 규정과 다를 수 있음을 분명히 한다. 규칙이 바뀌면 이 파일도 같이 바꾼다.
 *
 * 출처:
 *  - 진급·전역: `packages/shared/src/rank.ts` (SERVICE_MONTHS, PROMOTION_MONTHS)
 *  - 출타 신호: `packages/shared/src/availability.ts`
 *  - 초과 판정: `packages/shared/src/overage.ts`
 *  - 공휴일:   `packages/shared/src/holidays.ts`
 */

import { Link } from "react-router";
import { BrandLockup } from "../components/BrandLockup";
import "./landing.css";
import "./guide.css";

type Section = {
  id: string;
  title: string;
  body: React.ReactNode;
};

const SECTIONS: Section[] = [
  {
    id: "problem",
    title: "리브가 푸는 문제",
    body: (
      <>
        <p>
          부대에서 휴가를 계획할 때 어려운 것은 “내가 언제 나갈 수 있는가”가
          아니라 “그날 나 말고 몇 명이 더 나가는가”입니다. 종이나 단체
          대화방으로 관리하면 같은 날에 사람이 몰린 것을 당일에야 알게 됩니다.
        </p>
        <p>
          리브는 같은 그룹에 속한 사람들의 휴가를 한 달력에 모으고, 날짜마다
          출타 인원을 세어 <strong>하루 최대 출타 인원을 넘는 날</strong>을 미리
          보여 줍니다. 계획 단계에서 겹침이 보이면 조율할 시간이 생깁니다.
        </p>
      </>
    ),
  },
  {
    id: "group",
    title: "그룹 만들기와 하루 최대 출타 인원",
    body: (
      <>
        <p>
          그룹을 만든 사람이 그 그룹의 관리자가 됩니다. 관리자는 만들 때{" "}
          <strong>하루 최대 출타 인원을 인원수로 직접</strong> 정하고, 나중에
          그룹 관리 화면에서 언제든 바꿀 수 있습니다. 리브가 부대 정원을
          알아내거나 비율로 대신 계산하지 않습니다 — 어떤 값이 적절한지는 그
          부대만 알기 때문입니다.
        </p>
        <p>
          이미 있는 그룹에는 <strong>초대코드</strong>로 참여합니다. 코드는
          관리자가 발급하고 만료·사용 횟수 제한이 있으며, 새로 발급하면 이전
          코드는 즉시 폐기됩니다. 그룹 이름과 설명에는 실제 부대를 특정할 수
          있는 정보를 넣지 않습니다.
        </p>
        <p>
          검열·훈련처럼 아예 휴가를 잡으면 안 되는 기간은{" "}
          <strong>제한 기간</strong>으로 등록해 달력에 표시할 수 있습니다.
        </p>
      </>
    ),
  },
  {
    id: "counting",
    title: "출타 인원은 이렇게 셉니다",
    body: (
      <>
        <p>
          날짜마다 그 날에 걸친 휴가를 가진 사람 수를 셉니다. 한 사람이 겹치는
          휴가를 여러 개 등록해도 <strong>1명</strong>으로 셉니다. 초안 상태의
          휴가는 나에게만 보이고 집계에 들어가지 않습니다.
        </p>
        <p>
          센 인원을 그룹의 하루 최대 출타 인원과 비교해 네 가지 신호로 보여
          줍니다.
        </p>
        <ul>
          <li>
            <strong>여유</strong> — 기준의 50% 미만
          </li>
          <li>
            <strong>보통</strong> — 50% 이상 80% 미만
          </li>
          <li>
            <strong>임박</strong> — 80% 이상, 아직 기준 이내
          </li>
          <li>
            <strong>초과</strong> — 인원이 기준을 넘은 날
          </li>
        </ul>
        <p>
          기준과 같은 인원은 아직 초과가 아니라 “임박”입니다. 초과는 기준을{" "}
          <em>넘었을 때</em>만입니다.
        </p>
      </>
    ),
  },
  {
    id: "exceeded",
    title: "출타 인원이 넘치면 무슨 일이 일어나나",
    body: (
      <>
        <p>
          휴가를 등록하거나 고칠 때 서버가 그 변경으로 초과가 생기는 날짜를
          계산합니다. 초과가 생기면 그 날짜에 휴가가 걸린{" "}
          <strong>모든 부대원</strong>에게 알림이 갑니다. 등록한 사람만 아는
          것이 아니라, 조율해야 할 사람 전원이 같은 정보를 받습니다.
        </p>
        <p>
          알림은 웹·앱 안의 알림 목록으로 항상 오고, 모바일 앱에서 알림 권한을
          허용했다면 푸시로도 옵니다. 리브는 휴가를 막거나 취소하지 않습니다 —
          누가 일정을 옮길지는 사람이 정합니다.
        </p>
      </>
    ),
  },
  {
    id: "rank",
    title: "계급 진급과 전역일은 이렇게 계산합니다",
    body: (
      <>
        <p>
          계급은 저장하지 않고 <strong>입대일에서 매번 계산</strong>합니다.
          저장해 두면 진급일이 지나도 갱신되지 않아 화면마다 다른 계급이 보이기
          때문입니다.
        </p>
        <p>
          진급 최저복무기간(이병 2개월 → 일병 6개월 → 상병 6개월 → 병장)을 채운
          뒤 <strong>처음 오는 매월 1일</strong>에 진급하는 표준 일정으로
          계산합니다. 가입할 때 등록한 계급이 이 계산보다 높으면 그 계급을
          유지합니다(조기 진급 대응).
        </p>
        <p>전역 예정일의 기본값은 군종별 표준 복무기간에서 나옵니다.</p>
        <div className="guide-table-wrap">
          <table className="guide-table">
            <caption>군종별 표준 복무기간과 계급 진급 시점</caption>
            <thead>
              <tr>
                <th scope="col">군종</th>
                <th scope="col">표준 복무기간</th>
                <th scope="col">일병</th>
                <th scope="col">상병</th>
                <th scope="col">병장</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">육군</th>
                <td>18개월</td>
                <td rowSpan={3}>입대 2개월 후</td>
                <td rowSpan={3}>입대 8개월 후</td>
                <td rowSpan={3}>입대 14개월 후</td>
              </tr>
              <tr>
                <th scope="row">해군</th>
                <td>20개월</td>
              </tr>
              <tr>
                <th scope="row">공군</th>
                <td>21개월</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          복무기간은 입대일에 해당하는 날의 <strong>전날</strong>에 끝납니다.
          마지막 달에 같은 날짜가 없으면 그 달의 말일을 씁니다(예: 8월 31일 입대
          + 18개월 → 2월 28일 또는 29일). 날짜는 모두 한국 시간 기준입니다.
        </p>
        <p className="guide-note">
          실제 전역일과 진급일은 군기교육·복무이탈·전역보류 등으로 달라질 수
          있습니다. 리브의 값은 계획을 세우기 위한 참고치이며 공식 기록이
          아닙니다.
        </p>
      </>
    ),
  },
  {
    id: "holidays",
    title: "한국 공휴일",
    body: (
      <>
        <p>
          달력에는 양력 공휴일과, 설날·부처님오신날·추석처럼 음력을 기준으로
          하는 공휴일이 함께 표시됩니다. 현행 규칙에 따른{" "}
          <strong>대체공휴일</strong>도 계산해서 보여 줍니다.
        </p>
        <p>
          공휴일 표는 2024년부터 2030년까지 들어 있습니다. 가까운 연도는
          확정값이고 먼 연도는 발표 전 잠정값이라, 해당 연도에 들어가기 전에
          확인이 필요합니다. 그룹 관리자는 부대 자체의 휴일을 그룹 일정으로 따로
          등록할 수도 있습니다.
        </p>
      </>
    ),
  },
  {
    id: "my-leaves",
    title: "내 휴가 재원과 주기",
    body: (
      <>
        <p>
          연가·포상휴가·보상휴가·위로휴가·청원휴가·병가·외박·외출을 재원별로
          나눠 기록할 수 있습니다. 같은 재원이라도 받은 건마다 만기가 다를 수
          있어 <strong>적립분 단위</strong>로 남기고, 사용량은 만기가 빠른
          적립분부터 자동으로 계산합니다. 한 번의 긴 휴가를 날짜 구간별로 다른
          재원으로 나눠 잡는 것도 됩니다.
        </p>
        <p>
          <strong>정기외박</strong>은 주기 기반이라 따로 다룹니다. 주기 시작일,
          주기 길이, 회당 적립 일수를 설정하면 이번 주기의 잔여와 다음 적립일,
          주기별 사용량을 계산합니다.
        </p>
        <p>
          <strong>외출</strong>도 주기로 쌓이고, 평일 외출과 주말 외출을 따로
          셉니다. 외출은 당일 복귀라 일수가 아니라 <strong>횟수</strong>로
          세므로 남은 휴가 일수에는 더하지 않습니다. 달력에서는 주기가 열리는
          날에 적립 횟수를 함께 표시합니다. 기본값은 군별 통상 운영을 따르고
          부대 지침에 맞춰 고칠 수 있습니다.
        </p>
      </>
    ),
  },
  {
    id: "sharing",
    title: "무엇이 누구에게 보이나",
    body: (
      <>
        <p>
          같은 그룹에서는 집계 대상 휴가의 <strong>표시명·기간·상태</strong>만
          보입니다. 휴가 제목과 사유는 공유되지 않습니다.
        </p>
        <p>
          친구는 공개 사용자 이름(@아이디)으로 찾고,{" "}
          <strong>양쪽이 모두</strong> 수락해야 관계가 맺어집니다. 친구에게는
          공유 대상 휴가의 날짜와 상태만 보이며, 제목·사유·재원·잔여·그룹 정보는
          보이지 않습니다. 한 달력에서 최대 10명까지 비교할 수 있고, 친구를
          끊거나 차단하면 권한은 즉시 사라집니다.
        </p>
        <p>
          <strong>개인 일정</strong>은 휴가와 완전히 다른 것으로 저장됩니다.
          소유자에게만 보이고 그룹 통계·휴가 잔여·초과 알림 어디에도 들어가지
          않습니다.
        </p>
        <p>
          <code>/u/사용자이름</code> 주소는 공유용 링크입니다. 로그인하지 않고
          열면 표시명과 사용자 이름만 보이고, 앱이 설치돼 있으면 같은 주소가
          앱에서 열립니다. 이 페이지는 검색에 색인되지 않도록 해 두었습니다.
        </p>
      </>
    ),
  },
  {
    id: "safety",
    title: "입력하면 안 되는 것",
    body: (
      <>
        <p>
          리브는 군사 정보를 담기 위한 도구가 아닙니다. 다음은 어디에도 넣지
          마세요.
        </p>
        <ul>
          <li>실제 부대명·부대번호·주소·좌표·시설 사진</li>
          <li>군번, 공식 명부·문서</li>
          <li>병력 정원·가용병력·편성</li>
          <li>작전·훈련·검열·경계·이동 정보</li>
        </ul>
        <p>
          표시명에는 실명 대신 별칭을 권장합니다. 리브는 프로필 사진이나 그룹
          대표 이미지를 아예 받지 않고, 사진·위치·주소록 권한도 요구하지
          않습니다. 소속 부대가 앱 사용을 제한한다면 그 지침을 따라야 합니다.
        </p>
      </>
    ),
  },
  {
    id: "official",
    title: "리브는 공식 서비스가 아닙니다",
    body: (
      <>
        <p>
          리브는 국방부·각 군·소속 부대와 무관한 개인 개발 서비스입니다. 공식
          휴가 기록·신청·승인을 제공하지 않으며, 화면의 출타율과 혼잡 신호는
          이용자가 입력한 계획과 관리자가 정한 임의 기준값에 따른 추정치입니다.
        </p>
        <p>
          미가입자의 일정, 인원 변동, 파견·입원·교육, 작전·훈련 등을 모두
          반영하지 못할 수 있습니다. 실제 휴가는 지휘관 승인과 소속 부대 지침을
          따릅니다.
        </p>
      </>
    ),
  },
];

export function GuidePage() {
  return (
    <div className="lp-root">
      <a className="lp-skip" href="#main">
        본문 바로가기
      </a>

      <nav className="lp-nav is-stuck" aria-label="주 메뉴">
        <div className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-brand" aria-label="리브 홈">
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

      <main id="main" className="guide-main">
        <div className="lp-wrap">
          <nav className="guide-breadcrumb" aria-label="현재 위치">
            <ol>
              <li>
                <Link to="/">리브</Link>
              </li>
              <li aria-current="page">사용 가이드</li>
            </ol>
          </nav>

          <header className="guide-header">
            <h1>부대 휴가 일정 조율 가이드</h1>
            <p className="guide-lead">
              그룹을 만들어 부대원의 휴가를 한 달력에 모으고, 하루 최대 출타
              인원을 넘는 날을 미리 확인하는 방법. 리브가 출타
              인원·계급·전역일을 어떤 기준으로 계산하는지도 함께 정리했습니다.
            </p>
          </header>

          <nav className="guide-toc" aria-label="이 문서의 목차">
            <h2>목차</h2>
            <ol>
              {SECTIONS.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`}>{section.title}</a>
                </li>
              ))}
            </ol>
          </nav>

          <article className="guide-body">
            {SECTIONS.map((section) => (
              <section key={section.id} aria-labelledby={`${section.id}-title`}>
                <h2 id={`${section.id}-title`}>
                  <span className="guide-anchor" id={section.id} />
                  {section.title}
                </h2>
                {section.body}
              </section>
            ))}
          </article>

          <aside className="guide-cta">
            <h2>지금 시작하기</h2>
            <p>가입은 무료입니다. 웹에서 바로 그룹을 만들 수 있어요.</p>
            <div className="lp-cta-row">
              <Link to="/signup" className="lp-btn lp-btn--primary lp-btn--lg">
                무료로 시작하기
              </Link>
              <Link to="/" className="lp-btn lp-btn--ghost lp-btn--lg">
                리브 홈으로
              </Link>
            </div>
          </aside>

          <nav className="guide-related" aria-label="관련 문서">
            <h2>관련 문서</h2>
            <ul>
              <li>
                <a href="/privacy">
                  개인정보 처리방침 — 어떤 정보를 얼마나 보관하는지
                </a>
              </li>
              <li>
                <a href="/terms">이용약관 — 서비스 성격과 금지 정보</a>
              </li>
              <li>
                <a href="/support">지원·문의 — 신고와 계정 문제 접수</a>
              </li>
              <li>
                <a href="/delete-account">계정 삭제 — 삭제 대상과 처리 결과</a>
              </li>
            </ul>
          </nav>
        </div>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <div className="lp-footer-top">
            <Link to="/" className="lp-brand" aria-label="리브 홈">
              <BrandLockup iconSize={26} />
            </Link>
            <nav className="lp-footer-links" aria-label="사이트 링크">
              <Link to="/">홈</Link>
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
