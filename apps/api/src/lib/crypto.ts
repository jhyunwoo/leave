/** Workers WebCrypto 기반 비밀번호 해싱(PBKDF2-SHA256)과 세션 토큰 생성. */

// 배럴(`@leave/shared`)이 아니라 하위 경로로 가져온다. 이 파일은 보안 회귀
// 테스트(`test/security.test.mjs`)가 번들러 없이 Node에서 직접 import하는데,
// 배럴의 `export * from "./dates"`는 확장자가 없어 Node ESM이 풀지 못한다.
// `invite-code.ts`는 아무것도 import하지 않아 그대로 로드된다.
import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
} from "@leave/shared/invite-code";

// Workers의 WebCrypto는 PBKDF2 반복을 100,000회로 제한한다 — 그 상한을 그대로 사용.
const PBKDF2_ITERATIONS = 100_000;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

async function pbkdf2Hex(password: string, saltHex: string): Promise<string> {
  const salt = new Uint8Array(
    saltHex.match(/.{2}/g)?.map((h) => parseInt(h, 16)) ?? [],
  );
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

export async function hashPassword(
  password: string,
): Promise<{ hash: string; salt: string }> {
  const salt = bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
  return { hash: await pbkdf2Hex(password, salt), salt };
}

export async function verifyPassword(
  password: string,
  salt: string,
  expectedHash: string,
): Promise<boolean> {
  const hash = await pbkdf2Hex(password, salt);
  if (hash.length !== expectedHash.length) return false;
  // 타이밍 공격 방지용 상수 시간 비교
  let diff = 0;
  for (let i = 0; i < hash.length; i++) {
    diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 계정을 못 찾았을 때도 같은 비용을 치르기 위한 자리표시 재료.
 *
 * 실제 salt·hash와 같은 모양이어야 한다 — salt 16바이트(32 hex), hash 32바이트(64 hex).
 * 길이가 다르면 `verifyPassword`가 PBKDF2 뒤의 비교를 건너뛰어 다시 짧아진다.
 */
const ABSENT_ACCOUNT_SALT = "0".repeat(32);
const ABSENT_ACCOUNT_HASH = "0".repeat(64);

/**
 * 계정이 있든 없든 **같은 양의 일**을 하고 판정한다.
 *
 * 계정을 못 찾았을 때 그냥 실패로 돌아가면, 그 응답은 인덱스 조회 한 번(밀리초)만에
 * 끝나고 계정이 있을 때는 PBKDF2 10만 회(수십 밀리초)를 거친다. 그 차이가 그대로
 * "이 주소로 가입했는가"에 대한 답이 된다 — 응답 본문과 상태 코드를 아무리 똑같이
 * 맞춰도 시간이 알려준다.
 *
 * 이 서비스는 그 질문을 열어 두지 않기로 이미 정했다. 친구 찾기를 이메일에서 공개
 * 사용자 이름으로 옮긴 것(0023)이 같은 이유였다(docs/architecture.md). 로그인만
 * 시간으로 답하고 있으면 그 결정이 반쪽이 된다.
 *
 * @param credentials 계정이 있으면 그 salt·hash, 없으면 null.
 */
export async function verifyPasswordOrDecoy(
  password: string,
  credentials: { salt: string; hash: string } | null,
): Promise<boolean> {
  const material = credentials ?? {
    salt: ABSENT_ACCOUNT_SALT,
    hash: ABSENT_ACCOUNT_HASH,
  };
  const matched = await verifyPassword(password, material.salt, material.hash);
  // 자리표시 hash는 어떤 비밀번호와도 맞지 않지만, 우연에 기대지 않는다.
  return credentials !== null && matched;
}

export function generateSessionToken(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * 그룹 초대코드: 사전(Crockford Base32) 6자.
 *
 * 사전이 32자이고 256을 정확히 나누므로 바이트를 그대로 접어도 **편향이 없다**
 * (`byte % 32`의 각 값이 8개씩 대응한다). 사전 길이를 바꾸면 이 성질이 깨지므로
 * 그때는 거절 표집으로 바꿔야 한다.
 *
 * 길이를 줄이면서 유효기간·사용 횟수·조인 레이트리밋을 함께 조였다. 그 셋이
 * 한 묶음이라는 설명은 `packages/shared/src/invite-code.ts`에 있다.
 * 원문은 발급 응답 외에는 보존하지 않는다.
 */
export function generateInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(INVITE_CODE_LENGTH));
  let code = "";
  for (const byte of bytes) {
    code += INVITE_CODE_ALPHABET[byte % INVITE_CODE_ALPHABET.length];
  }
  return code;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return bytesToHex(new Uint8Array(digest));
}
