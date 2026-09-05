import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUnit,
  req,
  setUsername,
  signup,
  sleep,
  uniq,
} from "./helpers.mjs";

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
  const initialBootstrap = await req("GET", "/auth/bootstrap", { token });
  assert.equal(initialBootstrap.status, 200);
  assert.deepEqual(initialBootstrap.data.onboarding, initial.data);
  assert.equal(initialBootstrap.data.me, null);

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
      carryOver: true,
    },
  });
  assert.equal(regular.status, 200);
  // 온보딩에서 정한 이월 여부가 이어하기 상태에 그대로 실려야 화면이 되살릴 수 있다.
  const savedOvernight = await req("GET", "/auth/onboarding", { token });
  assert.equal(savedOvernight.data.regularOvernight.carryOver, true);

  // 공개 사용자 이름이 없으면 온보딩을 마칠 수 없다 — 활성 사용자에게는 항상
  // 이름이 있다는 불변식을 애플리케이션 경계가 지킨다(0023).
  const tooEarly = await req("POST", "/auth/onboarding/complete", { token });
  assert.equal(tooEarly.status, 400);
  const handle = uniq("ob");
  assert.equal((await setUsername(token, handle)).status, 200);
  const withName = await req("GET", "/auth/onboarding", { token });
  assert.equal(withName.data.username, handle);

  const completed = await req("POST", "/auth/onboarding/complete", { token });
  assert.equal(completed.status, 200);
  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.branch, "air_force");
  assert.equal(me.data.user.username, handle);
  const completedBootstrap = await req("GET", "/auth/bootstrap", { token });
  assert.equal(completedBootstrap.status, 200);
  assert.equal(completedBootstrap.data.onboarding.completed, true);
  assert.deepEqual(completedBootstrap.data.me, me.data);

  // 완료 API는 재호출해도 연가를 중복 생성하지 않는다.
  assert.equal(
    (await req("POST", "/auth/onboarding/complete", { token })).status,
    200,
  );
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

test("패스키 관리와 로그인 options는 비밀번호 재확인·인증 경계를 지킨다", async () => {
  const { token } = await signup();
  const empty = await req("GET", "/auth/passkeys", { token });
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.data.passkeys, []);

  const unauthorized = await req(
    "POST",
    "/auth/passkeys/registration/options",
    { body: { name: "노트북", currentPassword: "password123" } },
  );
  assert.equal(unauthorized.status, 401);

  const wrong = await req("POST", "/auth/passkeys/registration/options", {
    token,
    body: { name: "노트북", currentPassword: "wrong-password" },
  });
  assert.equal(wrong.status, 400);

  const begin = await req("POST", "/auth/passkeys/registration/options", {
    token,
    body: { name: "노트북", currentPassword: "password123" },
  });
  assert.equal(begin.status, 200);
  assert.ok(begin.data.ceremonyId);
  assert.equal(begin.data.options.rp.id, "leave.moveto.kr");
  assert.equal(
    begin.data.options.authenticatorSelection.residentKey,
    "required",
  );

  const loginBegin = await req("POST", "/auth/passkeys/authentication/options");
  assert.equal(loginBegin.status, 200);
  assert.ok(loginBegin.data.options.challenge);

  const missing = await req("DELETE", "/auth/passkeys/not-found", {
    token,
    body: { currentPassword: "password123" },
  });
  assert.equal(missing.status, 404);
});

test("/auth/me 는 인증 필요", async () => {
  const noAuth = await req("GET", "/auth/me");
  assert.equal(noAuth.status, 401);
  assert.equal((await req("GET", "/auth/bootstrap")).status, 401);

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

test("계정 삭제: 혼자 남은 관리자가 지우면 그룹과 초대코드가 함께 사라진다", async () => {
  // 탈퇴 조율(관리자 이관 → 없으면 그룹 삭제)의 다른 쪽 분기.
  // 이관 분기는 units.test.mjs가 지킨다.
  const admin = await signup();
  const created = await createUnit(admin.token);
  assert.equal(created.status, 201);
  const code = created.data.invite.code;

  const del = await req("DELETE", "/auth/account", { token: admin.token });
  assert.equal(del.status, 200);

  // 남은 초대코드로는 아무도 들어올 수 없다. 그룹이 사라졌기 때문이다.
  const outsider = await signup();
  const join = await req("POST", "/units/join", {
    token: outsider.token,
    body: { code },
  });
  assert.equal(join.status, 400);
  assert.match(join.data.error, /초대코드/);
});

test("계정 삭제: 나를 차단한 사람의 목록이 깨지지 않는다", async () => {
  // 차단은 양방향으로 지운다. 남으면 없는 id를 계속 숨기려 든다.
  const admin = await signup();
  const created = await createUnit(admin.token);
  const unitId = created.data.unit.id;
  const code = created.data.invite.code;

  const member = await signup();
  assert.equal(
    (await req("POST", "/units/join", { token: member.token, body: { code } }))
      .status,
    200,
  );

  const blocked = await req("POST", "/moderation/blocks", {
    token: admin.token,
    body: { userId: member.data.user.id },
  });
  assert.equal(blocked.status, 200);

  assert.equal(
    (await req("DELETE", "/auth/account", { token: member.token })).status,
    200,
  );

  const members = await req("GET", `/units/${unitId}/members`, {
    token: admin.token,
  });
  assert.equal(members.status, 200);
  assert.deepEqual(
    members.data.members.map((m) => m.id),
    [admin.data.user.id],
  );
});

test("육군 온보딩은 달 단위 정기외박 주기를 저장하고 달력에 맞춰 계산한다", async () => {
  const email = `${uniq("army-overnight-")}@test.com`;
  const created = await req("POST", "/auth/signup", {
    body: { email, password: "password123", dataConsent: true },
  });
  assert.equal(created.status, 201);
  const token = created.data.token;

  assert.equal(
    (
      await req("PUT", "/auth/onboarding/profile", {
        token,
        body: {
          name: "분기외박",
          branch: "army",
          enlistedAt: "2026-01-05",
          dischargeAt: "2027-07-04",
          rank: "private",
        },
      })
    ).status,
    200,
  );

  // 육군은 분기(3개월)마다 1박 2일 — 주기가 달 단위다.
  const regular = await req("PUT", "/auth/onboarding/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: "2026-01-31",
      intervalMonths: 3,
      daysPerGrant: 2,
    },
  });
  assert.equal(regular.status, 200);

  const status = await req("GET", "/auth/onboarding", { token });
  assert.equal(status.data.regularOvernight.intervalMonths, 3);
  assert.equal(status.data.regularOvernight.intervalDays, null);
  // 보내지 않으면 꺼진 채로 저장된다 — 구버전 앱이 스위치 없이 저장하는 경우다.
  assert.equal(status.data.regularOvernight.carryOver, false);

  assert.equal((await setUsername(token, uniq("army"))).status, 200);
  assert.equal(
    (await req("POST", "/auth/onboarding/complete", { token })).status,
    200,
  );

  // 적립일이 달력의 같은 날에 떨어진다. 1/31 기준이라 없는 날은 말일로 접힌다
  // (4/30 → 7/31): 일수로 근사하면 여기서부터 어긋난다.
  const grants = await req("GET", "/leaves/grants", { token });
  assert.equal(grants.status, 200);
  assert.equal(grants.data.regularOvernight.intervalMonths, 3);
  const cycles = grants.data.regularOvernight.cycles;
  assert.deepEqual(
    cycles
      .slice(0, 3)
      .map((cycle) => [cycle.start, cycle.end, cycle.grantDays]),
    [
      ["2026-04-30", "2026-07-30", 2],
      ["2026-07-31", "2026-10-30", 2],
      ["2026-10-31", "2027-01-30", 2],
    ],
  );

  // 이월까지 켜 둔 상태에서 군종을 바꾼다 — 지울 때 함께 꺼져야 한다.
  assert.equal(
    (
      await req("PUT", "/auth/onboarding/regular-overnight", {
        token,
        body: {
          enabled: true,
          startDate: "2026-01-31",
          intervalMonths: 3,
          daysPerGrant: 2,
          carryOver: true,
        },
      })
    ).status,
    200,
  );

  // 주기 단위가 군마다 다르므로, 군종을 바꾸면 앞 군의 설정을 지우고 다시 묻는다.
  assert.equal(
    (
      await req("PUT", "/auth/onboarding/profile", {
        token,
        body: {
          name: "분기외박",
          branch: "navy",
          enlistedAt: "2026-01-05",
          dischargeAt: "2027-09-04",
          rank: "private",
        },
      })
    ).status,
    200,
  );
  const cleared = await req("GET", "/auth/onboarding", { token });
  assert.equal(cleared.data.regularOvernight.enabled, false);
  assert.equal(cleared.data.regularOvernight.intervalMonths, null);
  assert.equal(cleared.data.regularOvernight.intervalDays, null);
  assert.equal(cleared.data.regularOvernight.carryOver, false);
});
