// 통합 테스트용 HTTP 헬퍼. 실행 중인 dev 서버(API_URL)에 요청을 보낸다.
const BASE = process.env.API_URL ?? "http://localhost:8799";

/** 충돌을 피하기 위한 짧은 유니크 문자열 */
export function uniq(prefix = "") {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** 공통 요청 함수 — { status, headers, data } 반환 */
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
  return {
    status: res.status,
    headers: Object.fromEntries(res.headers),
    data,
  };
}

/**
 * 기본값이 채워진 회원가입 헬퍼 (동의 포함).
 *
 * 공개 사용자 이름까지 함께 정해 준다 — 0023부터 친구 찾기가 이름 기반이라
 * 이름이 없는 계정은 검색되지도, 요청을 받지도 못한다. `username: null`을 넘기면
 * 이름 없는 계정(0023 이전 가입자)을 그대로 흉내 낸다.
 */
export async function signup(overrides = {}) {
  const { username, ...profile } = overrides;
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
    ...profile,
  };
  const res = await req("POST", "/auth/signup", { body });
  const token = res.data?.token;
  let handle = null;
  if (token && username !== null) {
    const set = await setUsername(token, username ?? uniq("u"));
    // 서버가 돌려준 정규형을 쓴다 — 보낸 값과 저장된 값이 다를 수 있다.
    handle = set.status === 200 ? set.data.username : null;
  }
  return { ...res, email, token, username: handle };
}

/** 공개 사용자 이름 설정 (PUT /users/me/username) */
export function setUsername(token, username) {
  return req("PUT", "/users/me/username", { token, body: { username } });
}

/** 부대 생성 (기본 하루 최대 출타 3명) */
export async function createUnit(token, overrides = {}) {
  const body = {
    name: uniq("부대-"),
    description: "테스트 부대",
    maxLeaveCount: 3,
    ...overrides,
  };
  return req("POST", "/units", { token, body });
}

/** 잠깐 대기 (백그라운드 waitUntil 작업이 D1에 반영되도록) */
export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
