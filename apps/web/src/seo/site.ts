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
  "리브: 부대 휴가 일정을 함께 보는 캘린더. 하루 최대 출타 인원 초과일을 미리 알려줍니다.";

/**
 * 친구 추가 링크(`/u/{username}`)의 소셜 미리보기.
 *
 * 앱의 "프로필 링크 공유"가 내보내는 주소가 이것이다. 카카오톡에 붙였을 때 브랜드
 * 카드가 뜨면 받는 사람은 그냥 앱 홍보 링크로 읽고 지나친다 — "나를 친구로 추가하라는
 * 링크"라는 것이 미리보기에서 바로 보여야 한다.
 *
 * 사람마다 다른 값은 넣지 않는다(docs/seo.md 4절). 별칭·아이디를 미리보기로
 * 퍼뜨리지 않는 것이 이 주소를 색인하지 않는 이유와 같다. 누가 보냈는지는 대화창이
 * 이미 말해 준다.
 *
 * 이미지 속 문구도 여기 둔다. `scripts/generate-og-image.mjs`가 이 파일을 그대로
 * 읽어 그리므로, 글꼴 서브셋(`fonts:generate`가 src의 문자열에서 뽑는다)에 글자가
 * 빠지지 않는다.
 */
export const FRIEND_INVITE_OG_TITLE = "리브 친구 추가 링크";
export const FRIEND_INVITE_OG_DESCRIPTION =
  "링크를 열어 친구를 추가하면 서로 공유한 휴가 일정과 전역 D-day, 복무율을 함께 볼 수 있어요.";
export const FRIEND_INVITE_OG_IMAGE_PATH =
  "/og/leave-friend-invite-1200x630.png";
export const FRIEND_INVITE_OG_IMAGE_ALT =
  "리브 친구 추가 링크: 링크를 열어 친구를 추가하고 서로의 휴가 일정을 함께 보세요.";
export const FRIEND_INVITE_OG_CARD = {
  eyebrow: "친구 추가 링크",
  headline: ["리브에서", "친구 추가하기"],
  body: "친구가 되면 서로 공유한 휴가 일정을 함께 볼 수 있어요.",
  chips: ["휴가 달력 비교", "전역 D-day", "복무율"],
  button: "친구 추가",
} as const;

/**
 * 서비스 운영자. 개인정보 처리방침·이용약관에 이미 공개된 값과 같아야 한다
 * (구조화 데이터는 화면에 보이는 사실만 담는다).
 */
export const PUBLISHER_NAME = "전현우";
export const CONTACT_EMAIL = "jhyunwoo0228@gmail.com";

/** 사이트 안 경로를 정본 절대 URL로. 질의 문자열·해시는 canonical에 싣지 않는다. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE_ORIGIN).toString();
}
