import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

test("회원가입은 개인정보 동의(dataConsent)가 없으면 400", async () => {
  const email = `${uniq("u")}@test.com`;
  const { status, data } = await req("POST", "/auth/signup", {
    body: {
      email,
      password: "password123",
      name: "테스터",
      branch: "army",
      enlistedAt: "2026-01-05",
      dischargeAt: "2027-07-04",
      rank: "private",
      dataConsent: false,
    },
  });
  assert.equal(status, 400);
  assert.match(data.error, /동의/);
});

test("동의하면 회원가입 성공 — 토큰과 사용자 정보 반환", async () => {
  const { status, data } = await signup();
  assert.equal(status, 201);
  assert.ok(data.token);
  assert.ok(data.user.id);
  assert.equal(data.user.branch, "army");
  assert.ok(data.user.rankLabel, "계산된 계급 라벨이 있어야 함");
});

test("계정 생성 후 온보딩을 중단·재개하고 완료한다", async () => {
  const email = `${uniq("onboarding-")}@test.com`;
  const created = await req("POST", "/auth/signup", {
    body: { email, password: "password123", dataConsent: true },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.onboardingCompleted, false);
  assert.equal(created.data.user, null);
  const token = created.data.token;

  const blocked = await req("GET", "/auth/me", { token });
  assert.equal(blocked.status, 428);
  const initial = await req("GET", "/auth/onboarding", { token });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.completed, false);
  assert.equal(initial.data.profile, null);

  const profile = await req("PUT", "/auth/onboarding/profile", {
    token,
    body: {
      name: "라임고래",
      branch: "air_force",
      enlistedAt: "2026-03-23",
      dischargeAt: "2027-12-22",
      rank: "private",
    },
  });
  assert.equal(profile.status, 200);
  const regular = await req("PUT", "/auth/onboarding/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: "2026-05-11",
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });
  assert.equal(regular.status, 200);

  const completed = await req("POST", "/auth/onboarding/complete", { token });
  assert.equal(completed.status, 200);
  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.branch, "air_force");

  // 완료 API는 재호출해도 연가를 중복 생성하지 않는다.
  assert.equal((await req("POST", "/auth/onboarding/complete", { token })).status, 200);
  const grants = await req("GET", "/leaves/grants", { token });
  const annual = grants.data.funds.find((fund) => fund.key === "annual");
  assert.equal(annual.grants.length, 1);
});

test("중복 이메일 가입은 409", async () => {
  const first = await signup();
  const { status } = await signup({ email: first.email });
  assert.equal(status, 409);
});

test("로그인: 성공/실패", async () => {
  const { email } = await signup();
  const ok = await req("POST", "/auth/login", {
    body: { email, password: "password123" },
  });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.token);

  const bad = await req("POST", "/auth/login", {
    body: { email, password: "wrong-password" },
  });
  assert.equal(bad.status, 401);
});

test("/auth/me 는 인증 필요", async () => {
  const noAuth = await req("GET", "/auth/me");
  assert.equal(noAuth.status, 401);

  const { token } = await signup();
  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.unit, null);
});

test("접속 기록이 남고 /auth/activity로 열람 가능 (동의 기반 로깅)", async () => {
  const { token } = await signup();
  // 인증 요청을 몇 번 만들어 접속 기록을 생성
  await req("GET", "/auth/me", {
    token,
    headers: { "X-Client-Platform": "web", "X-Client-Version": "1.2.3" },
  });
  // 접속 로그는 waitUntil로 비동기 기록되므로 잠깐 대기
  await sleep(500);

  const activity = await req("GET", "/auth/activity", { token });
  assert.equal(activity.status, 200);
  assert.ok(Array.isArray(activity.data.accessLogs));
  assert.ok(
    activity.data.accessLogs.length >= 1,
    "본인 접속 기록이 최소 1건 있어야 함",
  );
  const meLog = activity.data.accessLogs.find((l) => l.path === "/auth/me");
  assert.ok(meLog, "/auth/me 접속 기록이 있어야 함");
  assert.equal(meLog.platform, "web");
  assert.equal(meLog.appVersion, "1.2.3");
  assert.equal(meLog.method, "GET");
  assert.ok(!Object.hasOwn(meLog, "ip"));
  assert.ok(!Object.hasOwn(meLog, "country"));
  assert.ok(!Object.hasOwn(meLog, "userAgent"));
});

test("계정 삭제는 인증이 필요하다", async () => {
  const noAuth = await req("DELETE", "/auth/account");
  assert.equal(noAuth.status, 401);
});

test("계정 삭제: 계정·휴가·부대 소속이 모두 사라진다", async () => {
  // 부대 가입 + 휴가 등록으로 관련 데이터를 만든 뒤 삭제
  const { token, email } = await signup();
  await createUnit(token);
  const leaveRes = await req("POST", "/leaves", {
    token,
    body: {
      title: "정기휴가",
      segments: [
        { category: "annual", startDate: "2026-08-01", endDate: "2026-08-03" },
      ],
    },
  });
  assert.equal(leaveRes.status, 201);

  // 삭제 실행
  const del = await req("DELETE", "/auth/account", { token });
  assert.equal(del.status, 200);
  assert.equal(del.data.ok, true);

  // 토큰(세션)이 무효화되어 내 정보 조회가 401
  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.status, 401);

  // 같은 이메일로 다시 로그인 불가 (계정이 삭제됨)
  const login = await req("POST", "/auth/login", {
    body: { email, password: "password123" },
  });
  assert.equal(login.status, 401);

  // 같은 이메일로 재가입이 가능해야 함 (완전히 삭제되었으므로)
  const again = await signup({ email });
  assert.equal(again.status, 201);
});
