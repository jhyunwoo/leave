# 검색 노출 (SEO)

이 문서는 "공개 웹이 검색엔진과 AI 검색에 어떻게 보이는가"와 "왜 그렇게 만들었는가"를
다룬다. 감사 시점은 **2026-09-01**이고, 대상은 `apps/web`(=`leave-web` 워커,
`https://leave.moveto.kr`)이다.

명령어는 [README.md](../README.md), 코드가 어디 사는지는
[architecture.md](architecture.md), 딥링크는 [deep-links.md](deep-links.md)에 있다.

---

## 1. 한 문단 요약

공개 페이지(`/`, `/guide`)는 **빌드 시 진짜 HTML로 구워져** 나간다. 인증이 필요한
화면은 그대로 SPA다. 그 사이를 얇은 워커가 가른다 — 표에 있는 SPA 주소면 셸을
200으로, 표에 없으면 **진짜 404**를 낸다. 색인 정책·메타데이터·robots.txt·sitemap은
전부 `apps/web/src/seo/routes.ts` 한 표에서 나온다.

---

## 2. 왜 이 구조인가

### 고치려던 것 (작업 전 상태)

`https://leave.moveto.kr`를 자바스크립트 없이 받으면 **1,180바이트짜리 빈 껍데기**가
왔다. `<div id="root"></div>` 하나에 제목 한 줄이 전부였고, 그나마 그 제목은 모든
주소에서 똑같았다.

| 확인한 것                     | 작업 전                                             |
| ----------------------------- | --------------------------------------------------- |
| `/` 의 HTML 본문              | 없음 (JS 실행 후에야 생김)                          |
| `/robots.txt`                 | **없음** — SPA 폴백에 걸려 `text/html` 200          |
| `/sitemap.xml`                | **없음** — 같은 이유로 HTML 200                     |
| 존재하지 않는 주소            | 전부 `200 OK` + 홈과 같은 HTML (soft 404)           |
| canonical                     | 없음                                                |
| Open Graph / 트위터 카드      | 없음 (링크 미리보기가 비어 있었다)                  |
| 구조화 데이터                 | 없음                                                |
| `/login`·`/signup`·앱 화면    | 색인 통제 없음                                      |
| `/u/{username}` (공개 프로필) | 색인 통제 없음                                      |
| 랜딩 문구                     | 구현되지 않은 기능("비율로 관리")을 광고하고 있었다 |
| 공식성 고지                   | 랜딩에 없음(법적 문서에만 있었다)                   |

soft 404가 가장 나빴다. 오타 주소든 수집된 쓰레기 주소든 전부 "정상 페이지"로
보였기 때문에, 크롤 예산이 새고 홈과 중복인 문서가 무한히 생길 수 있는 상태였다.

### 고른 방식과 대안

| 방식                                | 판단                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 그대로 두고 메타 태그만 추가        | ✗ 구글은 렌더링하지만 네이버 Yeti·OAI-SearchBot은 기대하기 어렵다. soft 404도 그대로 남는다.           |
| Next.js로 전체 이전                 | ✗ 인증 SPA 전체를 옮기는 비용이 크고, 얻는 것은 공개 2페이지의 HTML뿐이다.                             |
| React Router 프레임워크 모드(SSG)   | ✗ 라우트 모듈 구조로 앱 전체를 옮겨야 한다. 같은 이유로 과하다.                                        |
| 런타임 SSR(워커에서 React 렌더)     | ✗ 공개 페이지에 개인화가 없다. 매 요청 렌더는 비용만 늘리고 캐시를 어렵게 한다.                        |
| **빌드 시 미리 그리기 + 얇은 워커** | ✓ 채택. 공개 페이지는 정적 자산이라 워커를 아예 거치지 않고, 워커는 SPA 경로와 없는 주소에만 관여한다. |
| 동적 렌더링(크롤러에게 다른 응답)   | ✗ 구글이 폐기했고, 사람과 크롤러에게 다른 내용을 주는 방식은 쓰지 않는다.                              |

### 요청 하나가 지나는 길

```
요청
 ├─ 정적 자산과 일치?  ──예──→ 그대로 응답 (워커 실행 안 함)
 │      /               → dist/index.html   (미리 그린 랜딩)
 │      /guide          → dist/guide.html   (미리 그린 안내)
 │      /privacy …      → public/*.html     (손으로 쓴 법적 문서)
 │      /assets/* /fonts/* /robots.txt /sitemap.xml /og/*
 │
 └─ 아니오 ──→ worker/index.ts 가 src/seo/routes.ts 표를 본다
        ├─ SPA 경로(/login, /u/:username, /leaves/:id …)
        │    → dist/app.html 을 200 + X-Robots-Tag: noindex, follow
        └─ 표에 없음
             → dist/404.html 을 **404** + X-Robots-Tag: noindex
```

`wrangler.jsonc`의 `not_found_handling`은 `"none"`이다. `"single-page-application"`은
모르는 주소 전부에 index.html을 200으로 돌려줘 soft 404를 만든다.

### 새 화면을 추가할 때

`App.tsx`에 라우트를 넣었으면 **`src/seo/routes.ts`의 `SPA_ROUTES`에도 넣는다.**
넣지 않으면 그 주소는 새로고침에서 404가 된다. `test/seo-routes.test.ts`가 App.tsx의
`path=` 리터럴과 표를 대조해 이 실수를 빌드에서 잡는다.

공개(색인 대상) 페이지를 추가하려면 `PRERENDERED_PAGES`에 한 줄 더하고 컴포넌트를
`App.tsx`에 **정적 import**로 건다(미리 그리기와 hydrate가 성립해야 한다).
sitemap·robots·메타·JSON-LD는 자동으로 따라온다.

---

## 3. 주소별 색인 정책

| 주소                                              | 응답 | 색인            | 근거                                                                  |
| ------------------------------------------------- | ---- | --------------- | --------------------------------------------------------------------- |
| `/`                                               | 200  | index, follow   | 유일한 마케팅 진입점. 미리 그린 HTML.                                 |
| `/guide`                                          | 200  | index, follow   | 계산 기준을 설명하는 공개 안내 문서.                                  |
| `/privacy` `/terms` `/support` `/delete-account`  | 200  | index, follow   | 스토어·개인정보 열람권이 걸린 주소. 브랜드 질의에 정확히 답해야 한다. |
| `/login` `/signup` `/invite`                      | 200  | noindex, follow | 인증 흐름. 색인돼도 사용자가 빈 폼에 떨어질 뿐이다.                   |
| `/units` `/units/manage`                          | 200  | noindex, follow | 인증 필요. 크롤러에겐 빈 껍데기(soft 404)이고 주소가 구조를 드러낸다. |
| `/leaves` `/leaves/grants` `/leaves/{id}`         | 200  | noindex, follow | 〃                                                                    |
| `/friends` `/friends/{id}`                        | 200  | noindex, follow | 〃                                                                    |
| `/notifications` `/notifications/settings`        | 200  | noindex, follow | 〃                                                                    |
| `/profile` `/service-progress`                    | 200  | noindex, follow | 〃                                                                    |
| `/u/{username}`                                   | 200  | noindex, follow | **아래 4절**                                                          |
| `/app` `/404` (셸·404 문서 자체)                  | 200  | noindex         | 워커가 다른 주소에 실어 보내는 몸통. 자기 이름으로도 열려서 막는다.   |
| 그 밖의 모든 주소                                 | 404  | noindex         | 없는 주소는 없다고 답한다.                                            |
| `/guide/` `/guide.html` `/index.html` `/privacy/` | 307  | —               | Cloudflare `html_handling: auto-trailing-slash`가 정본으로 넘긴다.    |
| `*.workers.dev` 의 모든 주소                      | 200  | noindex         | 미리보기 도메인이 운영 도메인과 색인 경쟁하지 않게.                   |

`Disallow`는 robots.txt에 **하나도 없다**. `noindex`를 읽으려면 크롤러가 그 페이지를
가져갈 수 있어야 하기 때문이다. robots.txt로 막으면 오히려 "내용 없이 주소만
색인되는" 상태가 된다. 두 장치는 바꿔 쓸 수 없다.

---

## 4. 공개 프로필(`/u/{username}`)을 색인하지 않는 이유

이 주소는 **공유용 링크이자 Universal Link/App Link의 착지점**이지 검색 유입용
페이지가 아니다. 색인하면 별칭과 @아이디가 검색 가능한 명부가 된다 — 군 관련
서비스에서 이용자가 원한 적 없는 노출이다.

- `noindex, follow` — `follow`를 남겨 크롤러가 이 페이지의 홈 링크는 따라갈 수 있다.
- 정책은 **자바스크립트 실행 전에** 이미 정해진다: 워커의 `X-Robots-Tag`와
  셸 HTML의 `<meta name="robots">` 둘 다.
- 딥링크는 그대로다. `noindex`는 색인만 막고 Universal Link 검증·이동에는 관여하지
  않는다. `.well-known/apple-app-site-association`과 `assetlinks.json`은 손대지
  않았고 회귀 테스트로 고정했다(`test/seo-build.test.ts`).
- 셸의 소셜 미리보기는 **브랜드 고정값**이다. 사람마다 다른 og:image·og:title을
  만들지 않는다.

---

## 5. 메타데이터·구조화 데이터

문구의 단일 출처는 `src/seo/routes.ts`(제목·설명)와 `src/seo/site.ts`(오리진·브랜드·
소셜 이미지)다. 화면에서 `document.title = …`을 직접 쓰지 않는다 —
`src/seo/RouteMetadata.tsx` 하나가 라우트 변경 뒤 제목·canonical·robots를 맞춘다.

- **canonical**: 언제나 운영 오리진(`https://leave.moveto.kr`) + 경로. 질의 문자열은
  싣지 않는다(`?next=`가 같은 문서의 사본을 만드는 것을 막는다).
- **robots(색인 대상)**: `index, follow, max-image-preview:large, max-snippet:-1,
max-video-preview:-1`.
- **Open Graph / 트위터**: `og:type/site_name/locale/title/description/url/image
(+width/height/alt)`, `twitter:card=summary_large_image`.
- **소셜 이미지**: `public/og/leave-og-1200x630.png` (1200×630, 1.91:1, 40KB).
  `pnpm --filter @leave/web og:generate`로 다시 만든다. 브랜드만 담고 사용자·부대
  정보는 담지 않는다. 빌드에 넣지 않은 이유는 크로미움이 필요해서다.

### JSON-LD

`WebSite` + `WebApplication` + `Person`(발행인), 공개 페이지마다 `WebPage`,
`/guide`에는 `BreadcrumbList`. 전부 화면에 보이는 사실만 담는다.

**리치 결과 자격은 일부러 포기했다.** 구글의 SoftwareApplication 리치 결과는
`aggregateRating` 또는 `review`를 요구하는데, 리브에는 공개된 평점이 없다. 지어내면
정책 위반이자 거짓이므로 넣지 않는다. `offers.price = "0"`은 결제 기능이 실제로
없어서 참이다 — 유료화하면 이 값과 랜딩 문구를 함께 고쳐야 한다.

**FAQPage 마크업은 넣지 않았다.** 구글은 2023년에 FAQ 리치 결과를 정부·의료 등
일부 사이트로 제한했고, 지금 넣어도 검색 결과 표현이 달라지지 않는다. FAQ는
사람이 읽는 본문(h2/h3 구조)으로만 둔다 — 이쪽이 실제로 효과가 확인된 것이다.

### CSP 영향

`<script type="application/ld+json">`은 실행 가능한 스크립트가 아니라 **데이터
블록**이라 `script-src`의 대상이 아니다(HTML 명세의 "prepare the script element"가
타입 판별 단계에서 먼저 빠져나간다). 브라우저 확인에서도 위반이 없었다. 그래서
JSON-LD 때문에 CSP를 넓히지 않았다.

CSP를 딱 한 군데 좁게 넓혔다: 미리 그린 랜딩의 `<head>`에 들어가는 **120바이트짜리
인라인 스크립트 하나**의 sha256 해시다(`'unsafe-inline'`이 아니다). 이 스크립트는
첫 페인트 전에 세션 유무만 `<html data-session>`으로 표시해, 이미 로그인한
사용자에게 홍보 랜딩이 잠깐 보이는 것을 막는다. 외부 파일로 두면 렌더를 막는 왕복이
하나 늘어 정작 검색 유입(비로그인)의 LCP가 나빠진다. 해시와 스크립트가 어긋나면
`test/seo-headers.test.ts`가 새 해시를 알려 준다.

---

## 6. robots.txt · sitemap.xml

둘 다 빌드가 만든다(`src/seo/robots.ts` → `scripts/build-seo.mjs`).

- `robots.txt`: `Content-Type: text/plain; charset=utf-8`(`_headers`가 못 박는다),
  `Sitemap:` 한 줄, `User-agent: *` + Googlebot·Yeti·bingbot·OAI-SearchBot 그룹.
  전부 `Allow: /`. Disallow 없음.
- `sitemap.xml`: 색인 대상 6개 주소만. `<lastmod>`는 그 페이지를 만드는 소스 파일의
  **마지막 커밋 시각**에서 뽑는다(git을 못 부르면 아예 넣지 않는다 — 틀린 값보다
  낫다). `changefreq`·`priority`는 넣지 않는다(구글이 무시한다고 명시했다).

### AI 크롤러 정책 — 검색과 학습은 다른 문제다

OpenAI는 세 크롤러를 분리해 운영한다.

| 사용자 에이전트 | 하는 일                       | 지금 상태            |
| --------------- | ----------------------------- | -------------------- |
| `OAI-SearchBot` | ChatGPT **검색**의 색인       | 명시적으로 허용      |
| `ChatGPT-User`  | 사용자가 눌러서 일어나는 방문 | robots.txt 대상 아님 |
| `GPTBot`        | **모델 학습** 데이터 수집     | `*` 규칙에 따라 허용 |

학습용 크롤러(GPTBot, Google-Extended, ClaudeBot, CCBot 등)를 허용할지는 **검색 노출과
무관한 별개의 정책 판단**이라, 이 작업에서 임의로 정하지 않았다. 지금 상태는
robots.txt가 없던 이전과 같다(=허용). 막고 싶으면 `src/seo/robots.ts`에 다음을
더하면 되고, 검색 노출에는 영향이 없다.

```
User-agent: GPTBot
Disallow: /
```

### `llms.txt`는 만들지 않았다

근거: 구글은 2026-05-15 AI 최적화 안내에서 `llms.txt`를 "무시해도 되는" 항목으로
분류했고, 검색 시스템이 쓰지 않는다고 밝혔다. 존 뮬러는 keywords 메타 태그에
비유하며 어떤 AI 서비스도 이 파일을 요청하지 않는다고 말했다. 5억 건 규모의 AI 봇
트래픽 관측에서도 이 파일을 직접 요청한 것은 400여 건에 그쳤다. 유지비를 들일
근거가 없다. **AI 검색 노출은 크롤 가능성·본문 텍스트·구조·유용함으로 얻는다.**

---

## 7. 성능 (Core Web Vitals)

같은 기계에서 두 빌드를 각각 로컬 워커로 띄우고, Chromium을 **CPU 4배 지연 + 10Mbps
/ 40ms**로 조여 11회 측정한 중앙값이다. 실사용자 값이 아니라 **같은 조건의 비교값**이다.
현장 데이터(CrUX)는 배포 후 Search Console에서 봐야 한다.

| 지표 (모바일 412×915, 4× CPU) | 작업 전 | 작업 후 | 변화     |
| ----------------------------- | ------- | ------- | -------- |
| LCP                           | 1,888ms | 1,404ms | **−26%** |
| FCP                           | 1,888ms | 1,404ms | −26%     |
| CLS                           | 0       | 0       | 유지     |
| 요청 수                       | 12      | 10      | −2       |
| 전송량                        | 287KB   | 310KB   | +23KB    |
| TTFB                          | 47ms    | 49ms    | 유지     |
| LCP 요소                      | `<h1>`  | `<h1>`  | 유지     |

`/guide`는 LCP 1,328ms · CLS 0 · 요청 10개.

왜 빨라졌나: 작업 전에는 `HTML → 진입 JS → 랜딩 청크 + 랜딩 CSS → 페인트`로 파도가
두 번 쳤다(랜딩 청크가 1,871ms에야 시작했다). 랜딩·가이드를 정적 import로 바꾸고
본문을 HTML에 구워 넣으면서 그 두 번째 파도가 사라졌다. 늘어난 23KB는 미리 그린
본문과 커진 글꼴 서브셋이다.

측정 중 발견해 고친 것 하나: **새 문구가 로컬 글꼴 서브셋에 없는 글자를 끌어와**
`cdn.jsdelivr.net`에서 Pretendard 동적 서브셋 5개(약 122KB)를 받아오고 있었다.
`pnpm --filter @leave/web fonts:generate`로 서브셋을 다시 만들어 없앴다.
**공개 화면 문구를 바꾸면 이 명령을 함께 돌려야 한다** — 안 돌리면 조용히 제3자
CDN 왕복이 붙는다.

함께 얹은 캐시 개선: `/assets/*`와 `/fonts/*`는 파일 이름에 해시·버전이 박혀 있으므로
`Cache-Control: public, max-age=31536000, immutable`을 준다(기본값은 매번 조건부
요청을 내는 `max-age=0, must-revalidate`였다).

---

## 8. 접근성

axe-core 4.12로 확인했다. 공개 페이지 기준 **위반 0건**.

| 주소            | 위반 | 비고                                              |
| --------------- | ---- | ------------------------------------------------- |
| `/`             | 0    | 수동 확인 3건(장식용 `aria-hidden` 화살표의 대비) |
| `/guide`        | 0    | 수동 확인 3건(rowspan 셀 대비 — 실제 8.9:1)       |
| `/login`        | 0    |                                                   |
| `/signup`       | 0    |                                                   |
| `/u/{username}` | 0    | 수동 확인 4건                                     |
| 404             | 0    |                                                   |

작업 중 고친 것:

- 랜딩·가이드·404에 `<main>`, 이름 붙은 `<section aria-labelledby>`, 건너뛰기 링크,
  `<nav aria-label>`을 넣었다.
- 로그인·회원가입 화면에 `main` 랜드마크가 없었다 → 감쌌다.
- **스피너 18곳이 `<div class="spinner" aria-label="…">`이었다.** 역할 없는 `div`에
  `aria-label`은 ARIA에서 금지된 조합이라 이름이 무시된다 → 전부 `role="status"`를
  붙였다. SPA 경로의 첫 화면이 이 스피너라, 보조기술과 브라우저 에이전트가 처음
  만나는 요소이기도 하다.
- 푸터 워드마크가 `--ink` 배경에 `--on-primary`(같은 `#0e0f0c`) 글자색이라 보이지
  않았다 → 밝은 색으로 뒤집었다.
- 가이드 링크 색이 `--canvas-soft` 배경에서 4.42:1(AA 미달)이었다 → `--ink-deep`으로.
- 히어로 제목이 길어지면서 넓은 화면(≥1400px)에서 낱말 중간이 끊겨 세 줄이 됐다.
  왼쪽 열은 1200px 랩 안에서 470px로 고정되므로 글자 최대 크기를 88px → 80px로
  낮추고 `word-break: keep-all`을 더해 두 줄을 지켰다(390~1920px에서 확인).

---

## 9. 문구의 정확성

랜딩이 **구현되지 않은 기능을 광고하고 있었다**: "부대 인원과 비율(예: 1/3)만
정하면 … 자동으로 계산해요". 실제로는 그룹 관리자가 **인원수를 직접** 넣는다
(`components/LeaveLimitFields.tsx`, `db/schema.ts`의 `max_leave_count`). 비율 입력은
어디에도 없다. 문구를 사실대로 고쳤고 FAQ에도 명시했다.

> ⚠️ 같은 오류가 **루트 `README.md`**에도 남아 있다("하루 허용 출타 인원 =
> `floor(부대원 수 × 분자/분모)`"). 이 작업의 범위(`apps/web`) 밖이라 손대지
> 않았으니, 문서를 손볼 때 함께 고칠 것.

그 밖에 지킨 규칙:

- **공식성 부인을 눈에 보이게.** 히어로 바로 아래, FAQ, 푸터, 가이드 마지막 절에
  "국방부·각 군·소속 부대와 무관한 비공식 참고 도구"임을 적었다. 이전 랜딩에는
  이 문구가 없었다(법적 문서에만 있었다).
- 랜딩·가이드에 적은 기능은 전부 코드에서 확인한 것이다: 그룹·초대코드, 하루 최대
  출타 인원, 초과 알림, 한국 공휴일(2024–2030 표), 계급 자동 진급, 전역 D-day,
  재원별 잔여·만기, 공군·해군 정기외박, 친구 비교(최대 10명), 개인 일정, 제한 기간.
- 스토어 링크는 **적지 않았다**. 저장소 어디에도 검증 가능한 App Store·Play 주소가
  없다. 주소가 확정되면 랜딩 FAQ와 JSON-LD(`SoftwareApplication`)에 함께 넣는다.
- 키워드를 억지로 반복하지 않았다. 제목·설명·본문은 사람이 읽는 한국어다.

### 검색 의도 (정량 데이터 없음)

키워드 도구를 쓸 수 없어 **검색량·순위·CTR 수치는 확보하지 못했다.** 지어내지
않는다. 대신 제품에서 도출한 정성적 의도 분류만 둔다.

| 의도              | 예시 질의                             | 착지점                        |
| ----------------- | ------------------------------------- | ----------------------------- |
| 브랜드/내비게이션 | 리브, leave 휴가 앱                   | `/`                           |
| 제품 탐색(거래성) | 군대 휴가 일정 공유, 부대 휴가 캘린더 | `/`                           |
| 정보성(방법)      | 휴가 겹침 조율, 출타 인원 초과        | `/guide`, `/`의 FAQ           |
| 정보성(계산)      | 진급일 계산, 전역일 계산 기준         | `/guide`                      |
| 신뢰·정책         | 리브 개인정보, 리브 계정 삭제         | `/privacy`, `/delete-account` |

군 휴가 **규정**을 해설하는 페이지는 만들지 않았다. 저장소에 그것을 정확히 쓸
근거가 없고, 틀리면 사람에게 실질적 피해가 간다. 가이드는 "리브가 무엇을 어떻게
계산하는가"만 말한다.

---

## 10. AI 검색 (근거 있는 것과 없는 것)

구글의 AI 기능 안내는 "AI 개요·AI 모드에 나오기 위한 별도 요건이나 특별한 최적화는
없다"고 명시한다. 그래서 한 일은 전부 일반 SEO의 기본이다.

- 크롤·색인 가능 (robots.txt·sitemap·noindex 정리)
- 중요한 정보를 **진짜 텍스트로** — SVG·캔버스·배경 이미지·애니메이션 안에만 두지
  않았다. 자바스크립트를 끄고도 랜딩 본문 전체가 읽힌다.
- 섹션을 정확히 설명하는 제목 계층(h1 하나 → h2 → h3)
- 목적지를 설명하는 내부 링크 텍스트("부대 휴가 일정 조율 가이드")
- 구조화 데이터와 본문이 같은 것을 말한다
- 페이지 경험(LCP·CLS)과 접근성 트리 — 브라우저를 쓰는 AI 에이전트가 실제로 읽는 것

하지 않은 것(근거 없음): `llms.txt`, FAQ 마크업 남용, 크롤러 전용 콘텐츠,
키워드 채우기, "AI에게 잘 보이는 문장 구조" 류의 속설.

---

## 11. 검증

```bash
pnpm --filter @leave/web test        # SEO 회귀 61건 (빌드 산출물을 직접 읽는다)
pnpm --filter @leave/web build       # 미리 그리기 + robots + sitemap 생성
pnpm --filter @leave/web test:e2e    # 브라우저 여정
pnpm quality                         # 서식 → lint → 바인딩 타입 → 타입 → 테스트
```

테스트가 고정하는 것(`apps/web/test/`):

- `seo-routes.test.ts` — 경로 판정, sitemap에 비공개 주소가 없음, robots.txt에
  Disallow가 없음, **App.tsx의 라우트와 표가 일치**함
- `seo-build.test.ts` — dist의 HTML을 문자열로 읽어 제목·설명·canonical·robots·OG·
  JSON-LD(파싱 가능, undefined/null 없음, 평점 없음)·h1 한 개·제목 계층·
  자바스크립트 없이 읽히는 본문 길이·404 문서에 앱 스크립트 없음·딥링크 파일 보존
- `seo-headers.test.ts` — CSP 해시 일치, `unsafe-inline` 없음, 보안 헤더 보존,
  workers.dev noindex, 해시 자산만 영구 캐시

로컬 워커(`wrangler dev`)로 확인한 실제 응답:

```
/                        200  text/html                (미리 그린 랜딩)
/guide                   200  text/html
/guide/ /guide.html      307  → /guide
/login /signup /invite   200  X-Robots-Tag: noindex, follow
/u/hyunwoo               200  X-Robots-Tag: noindex, follow
/units /leaves/abc …     200  X-Robots-Tag: noindex, follow
/privacy /terms …        200  (색인 허용)
/robots.txt              200  text/plain; charset=utf-8
/sitemap.xml             200  application/xml; charset=utf-8
/nonexistent             404  X-Robots-Tag: noindex
/wp-admin/setup.php      404  X-Robots-Tag: noindex
/.well-known/apple-app-site-association  200  application/json
```

보안 헤더(CSP·HSTS·X-Frame-Options·Referrer-Policy·Permissions-Policy·COOP)는
워커가 낸 응답과 404에도 그대로 붙는 것을 확인했다. 워커가 언제나
`env.ASSETS.fetch()`를 거쳐 응답하기 때문이다 — **워커가 직접 만든 Response에는
`_headers`가 붙지 않는다**(실측 확인). 새 응답 경로를 만들 때 반드시 지켜야 한다.

---

## 12. 배포 후에 사람이 해야 하는 일

자동화할 수 없는 것만 적는다. 전부 배포 뒤(`pnpm --filter @leave/web run deploy`)에 한다.

### 구글 Search Console

1. `https://leave.moveto.kr` 속성 추가 — **도메인 속성**(DNS TXT)을 권장한다.
   HTML 태그 방식이 필요하면 `src/seo/head.ts`의 `headTagsForPage`에 메타 한 줄을
   더한다(구글이 주는 확인 토큰은 공개돼도 무방한 값이다).
2. 사이트맵 제출: `https://leave.moveto.kr/sitemap.xml`
3. URL 검사 → `https://leave.moveto.kr/` → **렌더링된 HTML**과 **HTTP 응답**이 모두
   본문을 담고 있는지 확인 → 색인 요청.
4. `https://leave.moveto.kr/guide`도 같은 절차.
5. 페이지 색인 생성 보고서에서 다음을 확인:
   - "발견됨 – 현재 색인이 생성되지 않음"에 SPA 주소가 쌓이지 않는지
   - "noindex 태그에 의해 제외됨"에 `/login`·`/u/*`가 **의도대로** 들어가는지
   - "소프트 404"가 0인지 (이 작업의 핵심 지표)
6. Core Web Vitals 보고서(현장 데이터)는 데이터가 모이는 데 28일이 걸린다.
7. 실적 보고서의 검색 유형 "웹"에 AI 기능 유입이 함께 잡힌다(별도 보고서 없음).

### 네이버 서치어드바이저

1. 사이트 등록 → 소유확인(HTML 태그 또는 파일). 파일 방식이면 `apps/web/public/`에
   두면 그대로 나간다.
2. 요청 → 사이트맵 제출: `https://leave.moveto.kr/sitemap.xml`
3. 검증 → robots.txt: `Yeti`가 허용돼 있는지 확인(그룹이 명시돼 있다).
4. 검증 → 웹페이지 최적화: `/`와 `/guide`를 넣어 제목·설명·오픈그래프 항목을 확인.
5. 수집·검색 노출 현황을 4~6주 주기로 확인. 네이버는 색인이 느리므로 초기에는
   "수집됨/노출됨" 추이만 본다.

### Bing 웹마스터 도구

1. 사이트 추가 — **Search Console에서 가져오기**가 가장 빠르다(별도 확인 불필요).
2. 사이트맵 제출.
3. Bing 색인은 ChatGPT·Copilot의 근거로도 쓰이므로, 여기서 색인이 되는지 확인하는
   것이 곧 AI 검색 노출 점검이다.

### IndexNow — 지금은 넣지 않는다

리브의 공개 페이지는 6개이고 자주 바뀌지 않는다. 새 페이지를 만드는 것은 배포뿐이라
"바뀐 즉시 알린다"의 이득이 거의 없고, 키 파일과 배포 훅이라는 유지 대상만 늘어난다.
네이버도 2023-07부터 IndexNow를 받으므로, **공개 콘텐츠가 자주 늘어나는 날이 오면**
배포 후크에서 `sitemapEntries()`의 주소만 보내는 형태로 붙이면 된다. 사용자 주소는
절대 보내지 않는다.

---

## 13. 남은 한계

- **현장 데이터가 없다.** 위 성능 수치는 로컬 실험실 값이다. LCP·INP·CLS의 실제
  75백분위는 배포 후 CrUX/Search Console에서만 알 수 있다. INP는 상호작용이 필요해
  이 측정에 포함하지 않았다.
- **검색량·순위·경쟁 데이터가 없다.** 키워드 도구에 접근할 수 없었다. 9절의 의도
  분류는 정성 분석이다.
- **스토어 주소가 없다.** 앱은 존재하지만(`apps/native`, AASA/assetlinks에 실제
  팀 ID·패키지명) 저장소에 공개 스토어 URL이 없어 링크와 `SoftwareApplication`
  구조화 데이터를 넣지 않았다.
- **소유확인 토큰이 없다.** Search Console·서치어드바이저·Bing 확인은 콘솔 접근이
  필요해 사람이 해야 한다.
- **`/guide`의 `lastmod`는 첫 커밋 이후에 채워진다.** 지금은 소스가 커밋되지 않아
  git이 시각을 주지 못해 태그가 비어 있다(틀린 값을 넣지 않는 설계다).
- **워커 요금이 생긴다.** 이전에는 정적 자산만 나갔다. 이제 SPA 경로와 404에
  워커 호출이 붙는다(공개 페이지·자산은 그대로 워커를 거치지 않는다).
