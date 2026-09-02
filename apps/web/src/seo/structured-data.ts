/**
 * JSON-LD 구조화 데이터.
 *
 * 규칙 하나: **화면에 보이고 사실인 것만 적는다.** 별점·리뷰 수·수상·스토어
 * 주소를 지어내지 않는다. Google의 SoftwareApplication 리치 결과는
 * `aggregateRating` 또는 `review`를 요구하지만, 리브에는 공개된 평점이 없으므로
 * 리치 결과 자격을 포기한다. 그래도 이 마크업을 두는 이유는 검색·AI 시스템이
 * "리브가 무엇이고 누가 만들었고 무료인가"를 사람이 읽는 문장과 같은 답으로
 * 이해하게 하기 위해서다.
 *
 * CSP 주의: `<script type="application/ld+json">`은 실행 가능한 스크립트가 아닌
 * 데이터 블록이라 `script-src`의 대상이 아니다(HTML 명세의 "prepare the script
 * element"가 타입 판별 단계에서 먼저 빠져나간다). 그래서 CSP를 넓히지 않는다.
 */

import {
  PRERENDERED_PAGES,
  type PrerenderedPage,
  TITLE_SUFFIX,
} from "./routes";
import {
  absoluteUrl,
  OG_IMAGE_PATH,
  PUBLISHER_NAME,
  SITE_NAME,
  SITE_ORIGIN,
} from "./site";

const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const APP_ID = `${SITE_ORIGIN}/#webapp`;
const PUBLISHER_ID = `${SITE_ORIGIN}/#publisher`;

/**
 * 랜딩에 실제로 적혀 있는 기능만 담는다. 문구가 바뀌면 여기도 바꾼다 —
 * 구조화 데이터와 본문이 어긋나면 둘 다 신뢰를 잃는다.
 */
const FEATURE_LIST = [
  "그룹(부대) 공유 휴가 캘린더",
  "하루 최대 출타 인원 초과일 표시",
  "초과일 인앱·푸시 알림",
  "계급 자동 진급과 전역 D-day",
  "한국 공휴일·대체공휴일 표시",
  "휴가 재원별 잔여·만기 관리",
  "공군·해군 정기외박 주기 계산",
  "친구끼리 공유한 휴가 날짜 비교",
];

const SITE_DESCRIPTION = PRERENDERED_PAGES[0]?.description ?? "";

/** 사이트·앱·발행인. 모든 공개 페이지가 같은 그래프를 싣는다. */
export function siteGraph(): unknown[] {
  return [
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      alternateName: "Leave",
      inLanguage: "ko-KR",
      description: SITE_DESCRIPTION,
      publisher: { "@id": PUBLISHER_ID },
    },
    {
      "@type": "WebApplication",
      "@id": APP_ID,
      url: `${SITE_ORIGIN}/`,
      name: SITE_NAME,
      alternateName: "Leave",
      inLanguage: "ko-KR",
      applicationCategory: "BusinessApplication",
      applicationSubCategory: "Productivity",
      // 웹 앱은 최신 브라우저면 되고, 같은 계정으로 iOS·Android 앱도 쓴다.
      operatingSystem: "Web, iOS, Android",
      browserRequirements: "최신 버전의 Chrome, Safari, Edge, Firefox",
      description: SITE_DESCRIPTION,
      featureList: FEATURE_LIST,
      isAccessibleForFree: true,
      // 유료 기능·결제 코드가 없다. 값이 바뀌면 이용약관도 함께 바뀌어야 한다.
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "KRW",
      },
      publisher: { "@id": PUBLISHER_ID },
      isPartOf: { "@id": WEBSITE_ID },
    },
    {
      // 법인이 아니라 개인 개발자다. Organization으로 적으면 사실이 아니다.
      "@type": "Person",
      "@id": PUBLISHER_ID,
      name: PUBLISHER_NAME,
      url: absoluteUrl("/support"),
    },
  ];
}

/** 페이지 하나를 사이트 그래프에 붙인다. */
function webPageNode(page: PrerenderedPage): unknown {
  return {
    "@type": "WebPage",
    "@id": `${absoluteUrl(page.path)}#webpage`,
    url: absoluteUrl(page.path),
    name: page.title,
    description: page.description,
    inLanguage: "ko-KR",
    isPartOf: { "@id": WEBSITE_ID },
    primaryImageOfPage: absoluteUrl(OG_IMAGE_PATH),
    about: { "@id": APP_ID },
  };
}

/** `/guide`처럼 홈 아래에 있는 페이지의 이동 경로. 화면의 경로 표시와 같다. */
function breadcrumbNode(page: PrerenderedPage): unknown {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: SITE_NAME,
        item: `${SITE_ORIGIN}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: page.title.split(" — ")[0]?.trim() ?? page.title,
        item: absoluteUrl(page.path),
      },
    ],
  };
}

/** 공개 페이지 하나에 실을 JSON-LD 전체. */
export function structuredDataFor(page: PrerenderedPage): string {
  const graph: unknown[] = [...siteGraph(), webPageNode(page)];
  if (page.path !== "/") graph.push(breadcrumbNode(page));
  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

/** 제목 꼬리표를 붙인 문서 제목. 랜딩·가이드는 자기 제목을 통째로 쓴다. */
export function documentTitle(title: string, withSuffix: boolean): string {
  return withSuffix ? `${title}${TITLE_SUFFIX}` : title;
}
