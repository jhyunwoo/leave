// 통합 테스트용 HTTP 헬퍼. 실행 중인 dev 서버(API_URL)에 요청을 보낸다.
const BASE = process.env.API_URL ?? "http://localhost:8799";

/** 충돌을 피하기 위한 짧은 유니크 문자열 */
export function uniq(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 공통 요청 함수 — { status, data } 반환 */
export async function req(method, path, { token, body, headers } = {}) {
  const h = { "content-type": "application/json", ...(headers ?? {}) };
  if (token) h.authorization = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers: h,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

/** 기본값이 채워진 회원가입 헬퍼 (동의 포함) */
export async function signup(overrides = {}) {
  const email = `${uniq("u")}@test.com`;
  const body = {
    email,
    password: "password123",
    name: "테스터",
    branch: "army",
    enlistedAt: "2026-01-05",
    dischargeAt: "2027-07-04",
    rank: "private",
    dataConsent: true,
    ...overrides,
  };
  const res = await req("POST", "/auth/signup", { body });
  return { ...res, email, token: res.data?.token };
}

/** 부대 생성 (기본 출타율 1/3) */
export async function createUnit(token, overrides = {}) {
  const body = {
    name: uniq("부대-"),
    description: "테스트 부대",
    maxLeaveNumerator: 1,
    maxLeaveDenominator: 3,
    ...overrides,
  };
  return req("POST", "/units", { token, body });
}

/** 잠깐 대기 (백그라운드 waitUntil 작업이 D1에 반영되도록) */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
