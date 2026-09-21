// 통합 테스트용 HTTP 헬퍼. 실행 중인 dev 서버(API_URL)에 요청을 보낸다.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const BASE = process.env.API_URL ?? "http://localhost:8799";
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  if (token) markEmailVerified(body.email);
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

/**
 * run-tests.mjs가 만든 격리 D1 파일. 러너와 같은 상태를 직접 들여다본다.
 *
 * HTTP로는 볼 수 없는 것을 확인할 때만 쓴다 — 직렬화가 파생한 값이 아니라
 * **저장된 값** 자체를 봐야 하는 테스트(보관 기간 정리, 지난 계획 굳히기)가 그렇다.
 */
export function openTestDb() {
  const dir = path.join(
    apiDir,
    ".wrangler",
    "test-state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  );
  const file = readdirSync(dir).find(
    (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
  );
  assert.ok(file, `D1 파일을 찾지 못했다: ${dir}`);
  const db = new DatabaseSync(path.join(dir, file));
  // wrangler dev가 같은 파일을 쥐고 있다 — 잠깐 잠겨 있어도 기다린다.
  db.exec("PRAGMA busy_timeout = 20000");
  return db;
}

/** cron 트리거를 로컬에서 실행시키는 wrangler dev의 진입점. */
export async function runScheduled() {
  const res = await fetch(`${BASE}/cdn-cgi/handler/scheduled`);
  assert.equal(res.status, 200, "scheduled 핸들러 호출 실패");
  // waitUntil 안에서 도는 작업이라 응답 뒤에도 잠깐 이어진다.
  await new Promise((r) => setTimeout(r, 800));
}

/**
 * 오늘(KST) 기준 n일 뒤의 달력 날짜(YYYY-MM-DD).
 *
 * 고정 날짜 fixture는 그 날이 지나면 **테스트가 말하던 뜻이 조용히 뒤집힌다** —
 * "미래의 휴가"로 쓴 2026-10-20이 언젠가 과거가 되는 식이다. 지난/앞으로가
 * 뜻을 가지는 자리에서는 반드시 이걸 쓴다.
 */
export function isoDaysFromToday(days) {
  const now = new Date();
  const kstNoon = new Date(
    now.getTime() + 9 * 60 * 60 * 1000 + days * 24 * 60 * 60 * 1000,
  );
  return kstNoon.toISOString().slice(0, 10);
}

/** 이메일 인증 이외 기능의 fixture. 실제 인증 테스트는 이 헬퍼를 쓰지 않는다. */
export function markEmailVerified(email) {
  const db = openTestDb();
  try {
    db.prepare("UPDATE users SET email_verified_at = ? WHERE email = ?").run(
      new Date().toISOString(),
      email,
    );
  } finally {
    db.close();
  }
}
