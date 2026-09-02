/**
 * 사이트 정체성의 단일 출처.
 *
 * 여기 있는 값은 정적 HTML(prerender), 런타임 메타 갱신, robots.txt, sitemap.xml,
 * JSON-LD가 모두 같은 것을 말하도록 하기 위한 것이다. 문자열을 화면이나
 * 스크립트에 다시 적지 않는다 — 어긋나면 검색엔진이 서로 다른 두 사이트로 본다.
 *
 * 오리진을 환경변수로 두지 않는 이유: canonical은 "이 문서의 정본 주소"라
 * 미리보기 배포에서도 운영 주소를 가리켜야 한다. 미리보기 호스트가 자기 주소를
 * canonical로 주장하면 그 호스트가 색인 후보가 된다.
 */

/** 운영 오리진. canonical·og:url·sitemap이 모두 이 값 위에서 만들어진다. */
export const SITE_ORIGIN = "https://leave.moveto.kr";

/** 브랜드 표기. 화면·매니페스트·구조화 데이터가 같은 이름을 쓴다. */
export const SITE_NAME = "리브";
export const SITE_NAME_FULL = "리브(Leave)";

export const SITE_LOCALE = "ko_KR";
export const SITE_LANG = "ko";

/** 소셜 미리보기 이미지. 1200×630(1.91:1) — 카카오톡·iMessage·X·Slack 공용. */
export const OG_IMAGE_PATH = "/og/leave-og-1200x630.png";
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
export const OG_IMAGE_ALT =
  "리브 — 부대 휴가 일정을 함께 보는 캘린더. 하루 최대 출타 인원 초과일을 미리 알려줍니다.";

/**
 * 서비스 운영자. 개인정보 처리방침·이용약관에 이미 공개된 값과 같아야 한다
 * (구조화 데이터는 화면에 보이는 사실만 담는다).
 */
export const PUBLISHER_NAME = "Hyunwoo Jeon";
export const CONTACT_EMAIL = "jhyunwoo0228@gmail.com";

/** 사이트 안 경로를 정본 절대 URL로. 질의 문자열·해시는 canonical에 싣지 않는다. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}
