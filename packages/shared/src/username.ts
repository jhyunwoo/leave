/**
 * 사용자 이름(@아이디) 규칙 — 공개 식별자의 단일 정의.
 *
 * 사용처: 서버(가입·설정·검색·프로필 조회), 웹·앱(입력 검증), 딥링크 해석.
 *
 * 이 파일이 하나뿐이어야 하는 이유는 유일성 때문이다. "같은 이름인가"를 판정하는
 * 규칙이 여러 곳에 흩어지면, 한쪽이 대문자를 접고 다른 쪽이 접지 않는 순간
 * `HyunWoo`와 `hyunwoo`가 서로 다른 계정이 되어 남의 프로필로 가는 링크가 생긴다.
 * 그래서 저장·조회·검색·요청이 전부 `normalizeUsername`이 만든 **정규형 한 벌**만
 * 쓴다. DB에 들어가는 값도 정규형이고, 유니크 인덱스도 그 값에 걸린다.
 *
 * ## 허용 문자를 코드포인트 범위로 적은 이유
 *
 * `\p{Script=Hangul}`이 더 정확해 보이지만, 이 모듈은 Workers·브라우저와 함께
 * **Hermes**에서도 돌고 정규식 리터럴은 파싱 시점에 평가된다. 즉 그 런타임이
 * 유니코드 속성 이스케이프를 모르면 앱이 시작하자마자 죽는다. 이 저장소의
 * hermesc는 x86_64 바이너리라 aarch64 개발기에서 실행되지 않아 지원 여부를
 * 확인할 방법이 없었다(같은 이유로 기기 성능 측정도 막혀 있다). 확인하지 못한
 * 기능에 앱 기동을 걸지 않는다.
 *
 * 대신 아래 두 블록이 **한국어 입력기가 실제로 만들어내는 전부**다.
 *  - U+AC00–U+D7A3  한글 음절 (가–힣)
 *  - U+3131–U+318E  한글 호환 자모 (ㄱ, ㅋ, ㅎ, ㅏ …)
 *
 * 조합용 자모(U+1100–U+11FF)는 일부러 뺐다. 키보드로 직접 칠 수 없으면서
 * 호환 자모와 똑같이 보여, 허용하면 `ㄱ`(U+3131)과 `ᄀ`(U+1100)로 서로 다른
 * 두 계정을 만들 수 있다 — 공개 식별자에서 그건 사칭 수단이다.
 */

/** 정규화 뒤 길이 상한. 바이트가 아니라 **코드포인트** 수로 센다. */
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_MIN_LENGTH = 1;

/**
 * 라우트 경로와 겹치거나 사칭에 쓰일 수 있어 아무도 가질 수 없는 이름.
 *
 * `/users/{username}`과 같은 층위에 `/users/search`·`/users/availability`가 있고
 * `/users/me/*`가 그 아래에 있다. 이 세 낱말을 열어 두면 그 이름을 가진 사람의
 * 프로필이 영영 조회되지 않는다. `admin`·`support`는 경로 문제가 아니라
 * 운영자 사칭을 막으려고 함께 막는다.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  "me",
  "search",
  "availability",
  "admin",
  "support",
];

/**
 * 허용 문자 — 정규형(소문자) 기준.
 * 영문 소문자·숫자·마침표·밑줄 + 위 주석의 한글 두 블록.
 */
const USERNAME_ALLOWED_RE = /^[a-z0-9._ㄱ-ㆎ가-힣]+$/;

/**
 * NFC 정규화. 런타임에 `String.prototype.normalize`가 없더라도 입력 도중
 * 예외로 화면이 죽지 않게 원문을 그대로 돌려준다 — 최종 판정은 어차피 서버가
 * 한 번 더 하므로 여기서 던질 이유가 없다.
 */
function toNfc(value: string): string {
  return typeof value.normalize === "function" ? value.normalize("NFC") : value;
}

/**
 * 저장·조회에 쓰는 정규형을 만든다.
 *
 * 순서에 뜻이 있다. 앞뒤 공백을 걷어내고 → NFC로 합치고 → 영문만 소문자로 접는다.
 * NFC를 먼저 하지 않으면 분해형으로 적은 `한`(ㅎ+ㅏ+ㄴ)과 완성형 `한`이 다른
 * 이름이 된다. 한글에는 대소문자가 없어 `toLowerCase`가 건드리지 않는다.
 *
 * `@`는 떼지 않는다 — 이름 자체에 `@`는 없는 문자이므로 그대로 검증에서 걸려야
 * 한다. 검색창에 붙여 넣은 `@hyunwoo`를 받아주는 건 `normalizeUsernameQuery`다.
 */
export function normalizeUsername(raw: string): string {
  return toNfc(raw.trim()).toLowerCase();
}

/**
 * 검색어 정규화 — 사람이 복사해 오는 `@hyunwoo` 꼴을 받아준다.
 * 앞의 `@`만 떼고 나머지는 이름과 똑같이 정규화한다.
 */
export function normalizeUsernameQuery(raw: string): string {
  return normalizeUsername(raw.trim().replace(/^@+/, ""));
}

export function isReservedUsername(canonical: string): boolean {
  return RESERVED_USERNAMES.includes(canonical);
}

/**
 * 이미 정규화된 값이 규칙을 지키는가.
 *
 * 마침표 규칙은 인스타그램과 같다 — 처음과 끝에 올 수 없고 연달아 쓸 수 없다.
 * 밑줄은 어디에 몇 개가 오든 괜찮다.
 */
export function isCanonicalUsername(value: string): boolean {
  const codePoints = [...value].length;
  if (codePoints < USERNAME_MIN_LENGTH || codePoints > USERNAME_MAX_LENGTH) {
    return false;
  }
  if (!USERNAME_ALLOWED_RE.test(value)) return false;
  if (value.startsWith(".") || value.endsWith(".") || value.includes("..")) {
    return false;
  }
  return !isReservedUsername(value);
}

/** 사람이 입력한 값이 사용자 이름으로 성립하는가. */
export function isValidUsername(raw: string): boolean {
  return isCanonicalUsername(normalizeUsername(raw));
}

/**
 * 화면에 붙이는 표기. 이름과 표시 이름을 눈으로 구분할 수 있게 항상 `@`를 단다.
 */
export function formatUsername(username: string): string {
  return `@${username}`;
}

/**
 * 규칙을 어긴 이유. 화면이 문구를 직접 짓지 않도록 여기서 한 벌로 준다
 * (서버 400 메시지와 입력 도중 안내가 갈리면 사용자는 무엇이 맞는지 알 수 없다).
 */
export function usernameProblem(raw: string): string | null {
  const value = normalizeUsername(raw);
  const codePoints = [...value].length;
  if (codePoints < USERNAME_MIN_LENGTH) return "사용자 이름을 입력해주세요";
  if (codePoints > USERNAME_MAX_LENGTH) {
    return `사용자 이름은 ${USERNAME_MAX_LENGTH}자 이하여야 합니다`;
  }
  if (!USERNAME_ALLOWED_RE.test(value)) {
    return "영문·한글·숫자와 마침표(.), 밑줄(_)만 쓸 수 있어요";
  }
  if (value.startsWith(".") || value.endsWith(".")) {
    return "마침표(.)로 시작하거나 끝날 수 없어요";
  }
  if (value.includes("..")) return "마침표(.)를 연달아 쓸 수 없어요";
  if (isReservedUsername(value)) return "사용할 수 없는 이름이에요";
  return null;
}

/**
 * 검색 접두어로 쓸 수 있는 값인가.
 *
 * 이름 전체 규칙보다 느슨하다 — 마침표 위치와 예약어를 보지 않는다. 사용자가
 * `hyunwoo.`까지 친 순간 검색이 멎으면 안 되기 때문이다. 대신 허용 문자와 길이는
 * 그대로 요구한다. 서버가 이 값을 **인덱스 범위 조회의 경계**로 쓰므로,
 * 이름에 올 수 없는 문자가 섞이면 애초에 맞을 행이 없다.
 */
export function isUsernameQuery(value: string): boolean {
  const codePoints = [...value].length;
  return (
    codePoints >= USERNAME_MIN_LENGTH &&
    codePoints <= USERNAME_MAX_LENGTH &&
    USERNAME_ALLOWED_RE.test(value)
  );
}

/* -------------------------------------------------------- 프로필 링크 */

/**
 * 프로필 링크의 정본 출처.
 *
 * 공유되는 주소는 언제나 이 HTTPS 주소다. `leave://u/{username}`도 열리지만
 * 공유하지 않는다 — 받는 사람이 앱을 깔았는지 보낸 사람이 알 수 없고, 커스텀
 * 스킴은 앱이 없는 기기에서 아무 데도 가지 않는다. HTTPS 주소는 앱이 있으면
 * 앱에서(Universal Link / App Link), 없으면 웹에서 열린다.
 */
export const PROFILE_LINK_ORIGIN = "https://leave.moveto.kr";

/** 공유할 프로필 주소. 내부 사용자 id는 절대 넣지 않는다. */
export function profileLink(username: string): string {
  return `${PROFILE_LINK_ORIGIN}/u/${username}`;
}

/**
 * 링크에서 사용자 이름을 뽑는다. 못 뽑으면 null.
 *
 * 세 가지 모양을 모두 받는다.
 *  - `https://leave.moveto.kr/u/hyunwoo`   공유되는 정본 주소
 *  - `leave://u/hyunwoo`                   커스텀 스킴(개발·디버깅)
 *  - `exp://192.168.0.2:8081/--/u/hyunwoo` Expo Go / 개발 클라이언트
 *
 * 앞에 `/`가 오거나 문자열 처음일 때만 `u/`를 세그먼트로 인정한다. 그러지 않으면
 * `/menu/x` 같은 주소가 걸린다. 주소창의 값은 사람이 손으로 고칠 수 있으므로
 * 저장 형식과 같은 정규형으로 접는다 — `/u/HyunWoo`도 같은 사람을 가리켜야 한다.
 */
export function profileUsernameFromUrl(url: string): string | null {
  const match = /(?:^|\/)u\/([^/?#]+)/.exec(url);
  if (!match?.[1]) return null;
  try {
    const username = normalizeUsername(decodeURIComponent(match[1]));
    return username.length > 0 ? username : null;
  } catch {
    // 잘못 인코딩된 링크(`%`로 끝나는 등). 목적지를 알 수 없으니 없는 것으로 본다.
    return null;
  }
}
