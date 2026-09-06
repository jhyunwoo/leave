import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, setUsername, signup, uniq } from "./helpers.mjs";

function publicProfile(username, headers) {
  return req("GET", `/public/users/${encodeURIComponent(username)}`, {
    headers,
  });
}

const unavailable = {
  error: "사용자를 찾을 수 없습니다",
  code: "user_unavailable",
};

test("공개 프로필은 토큰 없이 정확히 별칭과 사용자 이름만 반환한다", async () => {
  const target = await signup({
    name: "공개 별칭",
    username: `Public${uniq("")}`,
    branch: "air_force",
    enlistedAt: "2026-03-23",
    dischargeAt: "2027-12-22",
  });
  await createUnit(target.token);

  const found = await publicProfile(target.username);
  assert.equal(found.status, 200, JSON.stringify(found.data));
  assert.deepEqual(found.data, {
    name: "공개 별칭",
    username: target.username,
  });
  assert.deepEqual(Object.keys(found.data).sort(), ["name", "username"]);
  assert.equal(found.headers["cache-control"], "no-store");

  const body = JSON.stringify(found.data);
  for (const secret of [
    target.data.user.id,
    target.email,
    "air_force",
    "2026-03-23",
    "2027-12-22",
    "unitId",
    "relationship",
    "rank",
  ]) {
    assert.ok(
      !body.includes(secret),
      `${secret} 가 익명 응답에 있으면 안 된다`,
    );
  }
});

test("공개 프로필은 주소의 대소문자와 유니코드를 저장 정규형으로 조회한다", async () => {
  const ascii = await signup({ username: `Mixed${uniq("")}` });
  const upper = await publicProfile(ascii.username.toUpperCase());
  assert.equal(upper.status, 200);
  assert.equal(upper.data.username, ascii.username);

  const composed = `한글${uniq("")}`.normalize("NFC");
  await signup({ username: composed });
  const decomposed = composed.normalize("NFD");
  assert.notEqual(decomposed, composed, "테스트 전제: 분해형이 달라야 한다");
  const normalized = await publicProfile(decomposed);
  assert.equal(normalized.status, 200);
  assert.equal(normalized.data.username, composed);
});

test("없는·이름 없는·온보딩 미완료 계정은 모두 같은 404다", async () => {
  const namelessCandidate = `nameless${uniq("")}`;
  const nameless = await signup({
    name: namelessCandidate,
    username: null,
  });
  assert.equal(nameless.username, null);

  const pendingUsername = `pending${uniq("")}`;
  const pending = await req("POST", "/auth/signup", {
    body: {
      email: `${uniq("pending")}@test.com`,
      password: "password123",
      dataConsent: true,
    },
  });
  assert.equal(pending.status, 201);
  assert.equal(pending.data.onboardingCompleted, false);
  assert.equal(
    (await setUsername(pending.data.token, pendingUsername)).status,
    200,
  );

  const responses = await Promise.all([
    publicProfile(`ghost${uniq("")}`),
    // 별칭이나 내부 id로 이름 없는 계정을 찾을 수 없어야 한다.
    publicProfile(namelessCandidate),
    publicProfile(nameless.data.user.id),
    publicProfile(pendingUsername),
  ]);
  for (const response of responses) {
    assert.equal(response.status, 404, JSON.stringify(response.data));
    assert.deepEqual(response.data, unavailable);
    assert.equal(response.headers["cache-control"], "no-store");
  }
});

test("사용자 이름을 바꾸면 이전 공개 주소는 닫히고 새 주소만 열린다", async () => {
  const tag = uniq("");
  const target = await signup({ name: "이름 변경", username: `before${tag}` });
  const oldUsername = target.username;
  const newUsername = `after${tag}`;

  assert.equal((await publicProfile(oldUsername)).status, 200);
  assert.equal((await setUsername(target.token, newUsername)).status, 200);

  const stale = await publicProfile(oldUsername);
  assert.equal(stale.status, 404);
  assert.deepEqual(stale.data, unavailable);

  const fresh = await publicProfile(newUsername.toUpperCase());
  assert.equal(fresh.status, 200);
  assert.deepEqual(fresh.data, {
    name: "이름 변경",
    username: newUsername,
  });
});

test("기존 사용자 프로필은 계속 인증과 관계 응답을 요구한다", async () => {
  const viewer = await signup();
  const target = await signup({ name: "인증 프로필" });

  const anonymous = await req(
    "GET",
    `/users/${encodeURIComponent(target.username)}`,
  );
  assert.equal(anonymous.status, 401);

  const authenticated = await req(
    "GET",
    `/users/${encodeURIComponent(target.username)}`,
    { token: viewer.token },
  );
  assert.equal(authenticated.status, 200);
  assert.deepEqual(Object.keys(authenticated.data).sort(), [
    "name",
    "relationship",
    "userId",
    "username",
  ]);
  assert.equal(authenticated.data.userId, target.data.user.id);
  assert.equal(authenticated.data.relationship, "none");
});

test("공개 프로필 조회는 접속 IP별로 제한한다", async () => {
  const target = await signup();
  const headers = { "CF-Connecting-IP": "198.51.100.77" };
  const limit = 60;

  // 고정 창의 끝에서 시작하면 앞선 창과 다음 창에 요청이 나뉠 수 있다. 두 창의
  // 상한보다 한 번 더 시도해 429를 확인하되, 테스트용 상한은 작게 유지한다.
  for (let count = 0; count <= limit * 2; count += 1) {
    const response = await publicProfile(target.username, headers);
    if (response.status === 429) {
      assert.equal(response.headers["retry-after"], "60");
      assert.equal(response.headers["cache-control"], "no-store");
      return;
    }
    assert.equal(response.status, 200, `${count + 1}번째 요청`);
  }
  assert.fail("두 고정 창 안에서 rate limit이 적용되지 않았습니다");
});
