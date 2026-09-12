/**
 * 그룹 초대코드의 형식과 링크 규칙 — 서버·앱·웹의 단일 출처.
 *
 * 이 서비스에는 그룹 검색이 없다. 그룹에 들어오는 유일한 길이 초대코드이므로,
 * 코드 자체가 접근 권한이다. 서버는 해시만 들고 있고 원문은 발급 응답에 딱
 * 한 번 실려 나간다(`apps/api/src/lib/invites.ts`).
 *
 * ## 왜 6자리인가, 그리고 그 대가로 무엇을 조였는가
 *
 * 예전 코드는 192비트(base64url 32자)였다. 그건 **손으로 옮겨 적을 수 없는** 길이다.
 * 지금은 사람이 불러 주고 받아 적는 길이(6자)로 줄이고, 줄어든 엔트로피만큼
 * 다른 곳을 조였다.
 *
 *  - 코드 공간은 32⁶ ≈ 10.7억이다.
 *  - 초대의 기본 유효기간은 24시간, 기본 사용 횟수는 20회다.
 *  - `POST /units/join`은 사용자·IP당 15분에 3회로 제한된다.
 *
 * 셋을 곱하면 무차별 대입으로 살아 있는 초대 하나를 맞힐 확률이 실질적으로 사라진다.
 * **세 값은 함께 움직여야 한다** — 코드를 더 줄이거나 유효기간을 늘릴 일이 생기면
 * 나머지도 같이 다시 계산할 것.
 *
 * ## 사전
 *
 * Crockford Base32다. `I`·`L`·`O`·`U`가 **없기 때문에** 사람이 잘못 적은 글자를
 * 되돌릴 수 있다(`O`→`0`, `I`·`L`→`1`, `U`→`V`). 사전에 그 글자가 있었다면
 * 되돌리는 순간 다른 유효한 코드가 되어 버린다. `U`를 뺀 것은 우연히 만들어지는
 * 욕설을 줄이려는 원래 설계 의도이기도 하다.
 */

/** Crockford Base32. 32자인 것이 중요하다 — 아래 바이트 접기가 편향 없이 돈다. */
export const INVITE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const INVITE_CODE_LENGTH = 6;

const INVITE_CODE_RE = new RegExp(
  `^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$`,
);

/** 사람이 흔히 헷갈리는 글자 → 사전 안의 글자. 사전에 없는 글자들만 대상이다. */
const LOOKALIKES: Record<string, string> = {
  O: "0",
  I: "1",
  L: "1",
  U: "V",
};

/**
 * 사용자가 친 값을 저장·조회에 쓰는 정규형으로 접는다.
 *
 * **6자로 접히지 않으면 원문을 다듬기만 한다.** 옛 32자 base64url 코드가 아직
 * 살아 있고(발급 당시의 유효기간까지), 그 코드는 대소문자를 구분한다 —
 * 여기서 대문자로 올려 버리면 이미 나눠 준 초대가 전부 죽는다.
 */
export function normalizeInviteCode(raw: string): string {
  const trimmed = raw.trim();
  const compact = trimmed.replace(/[\s-]/g, "").toUpperCase();
  if (compact.length !== INVITE_CODE_LENGTH) return trimmed;
  const folded = [...compact]
    .map((character) => LOOKALIKES[character] ?? character)
    .join("");
  return INVITE_CODE_RE.test(folded) ? folded : trimmed;
}

/** 새 형식(정규형 6자)인가. 정규화하지 않은 값에는 쓰지 않는다. */
export function isInviteCodeFormat(value: string): boolean {
  return INVITE_CODE_RE.test(value);
}

/**
 * 옛 코드(base64url 32자)의 최소 길이.
 *
 * 6자로 바꾸기 전에 발급된 초대가 유효기간이 다할 때까지 살아 있다. 그 코드로도
 * 들어올 수 있어야 하므로 검증이 두 형식을 모두 받는다. 마지막 옛 초대가 만료되면
 * 이 상수와 그것을 쓰는 분기를 함께 지울 것.
 */
export const LEGACY_INVITE_CODE_MIN_LENGTH = 32;

/** 지금 형식이든 옛 형식이든, 초대코드로 성립하는 값인가. */
export function isAcceptableInviteCode(normalized: string): boolean {
  return (
    isInviteCodeFormat(normalized) ||
    normalized.length >= LEGACY_INVITE_CODE_MIN_LENGTH
  );
}

/* ---------------------------------------------------------- 초대 링크 */

/**
 * 초대 링크의 정본 출처. 프로필 링크와 같은 도메인이고 같은 이유로 HTTPS다 —
 * 앱이 있으면 앱에서(Universal Link / App Link), 없으면 웹에서 열린다.
 * 커스텀 스킴(`leave://invite/…`)은 앱이 없는 기기에서 아무 데도 가지 않으므로
 * 공유하지 않는다. 그 배경은 [`docs/deep-links.md`].
 */
export const INVITE_LINK_ORIGIN = "https://leave.moveto.kr";

/** 공유할 초대 주소. */
export function inviteLink(code: string): string {
  return `${INVITE_LINK_ORIGIN}/invite/${code}`;
}

/**
 * 같은 초대의 커스텀 스킴 주소. **공유하지 않는다.**
 *
 * `profileAppLink`와 같은 자리에서만 쓴다 — 이미 브라우저가 열려 버린 뒤에 앱을
 * 한 번 찔러 보는 용도다. 이유는 `profileAppLink` 주석과 docs/deep-links.md에 있다.
 */
export function inviteAppLink(code: string): string {
  return `leave://invite/${code}`;
}

/**
 * 링크에서 초대코드를 뽑는다. 못 뽑으면 null.
 *
 * 세 가지 모양을 모두 받는다(`profileUsernameFromUrl`과 같은 규칙이다).
 *  - `https://leave.moveto.kr/invite/A2C4D5`   공유되는 정본 주소
 *  - `leave://invite/A2C4D5`                   커스텀 스킴
 *  - `exp://192.168.0.2:8081/--/invite/A2C4D5` Expo Go / 개발 클라이언트
 *
 * 앞에 `/`가 오거나 문자열 처음일 때만 `invite/`를 세그먼트로 인정한다.
 * 캡처는 `/ ? #`를 빼고 잡지만 `decodeURIComponent`가 `%2F`·`%3F`·`%23`을 도로
 * 되살리므로, 형식 검사는 반드시 디코딩 **뒤**에 한다. 여기서 나온 값은 그대로
 * 라우트 파라미터가 되어 API 경로에 박힌다.
 *
 * 옛 32자 코드는 이 함수로 오지 않는다 — 그 시절 링크는 `/invite#코드`라
 * 프래그먼트에 있었고, 프래그먼트는 이 패턴에 걸리지 않는다.
 */
export function inviteCodeFromUrl(url: string): string | null {
  const match = /(?:^|\/)invite\/([^/?#]+)/.exec(url);
  if (!match?.[1]) return null;
  try {
    const code = normalizeInviteCode(decodeURIComponent(match[1]));
    return isInviteCodeFormat(code) ? code : null;
  } catch {
    // 잘못 인코딩된 링크(`%`로 끝나는 등). 목적지를 알 수 없으니 없는 것으로 본다.
    return null;
  }
}
