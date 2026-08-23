import assert from "node:assert/strict";
import { test } from "node:test";
import { req, setUsername, signup, uniq } from "./helpers.mjs";

/** 이름을 정하지 않은 채 계정만 만든다(0023 이전 가입자와 같은 상태). */
function nameless(overrides = {}) {
  return signup({ username: null, ...overrides });
}

test("사용자 이름 규칙 — 유효한 값은 정규형으로 저장된다", async () => {
  // 사례마다 꼬리표를 따로 붙인다 — 같은 정규형으로 접히는 두 사례를 한 스위트에
  // 넣으면 뒤엣것이 규칙 위반이 아니라 "이미 쓰는 이름"으로 떨어진다.
  const tag = (label) => label + uniq("");
  const cases = [
    [tag("hyunwoo"), (v) => v],
    [tag("HYUNWOO").toUpperCase(), (v) => v.toLowerCase()],
    [tag("현우"), (v) => v],
    [tag("현우_24_"), (v) => v],
    [tag("연세대.hyunwoo."), (v) => v],
    [tag("_hyunwoo"), (v) => v],
    [tag("hyunwoo_"), (v) => v],
    [tag("hyunwoo__24"), (v) => v],
    [`  ${tag("spaced")}  `, (v) => v.trim()],
    // 코드포인트 30자 경계 — 바이트가 아니라 글자 수로 센다.
    ["가".repeat(30), (v) => v],
  ].map(([input, expect]) => [input, expect(input)]);
  for (const [input, expected] of cases) {
    const user = await nameless();
    const res = await setUsername(user.token, input);
    assert.equal(res.status, 200, `${input}: ${JSON.stringify(res.data)}`);
    assert.equal(res.data.username, expected, input);
  }

  // 숫자만으로도 성립한다.
  const numeric = await nameless();
  assert.equal(
    (await setUsername(numeric.token, "2026" + uniq(""))).status,
    200,
  );
});

test("사용자 이름 규칙 — 어긋난 값은 400으로 거절한다", async () => {
  const invalid = [
    "",
    "   ",
    "a".repeat(31),
    "가".repeat(31),
    "hyun woo",
    "hyun\two",
    "hyun\nwoo",
    ".hyunwoo",
    "hyunwoo.",
    "hyunwoo..24",
    "hyun-woo",
    "@hyunwoo",
    "hyun#woo",
    "현우\u{1f60a}",
    "김현우!",
    "漢字이름",
    "ひらがな",
    "кириллица",
    // 보이지 않는 문자(zero width space)로 남의 이름을 흉내 낼 수 없어야 한다.
    "hyun​woo",
    // 예약어 — 라우트 경로와 겹쳐 아무도 가질 수 없다.
    "me",
    "search",
    "availability",
    "admin",
  ];
  // 규칙 위반도 쓰기 제한 카운터를 소모한다(미들웨어가 검증보다 먼저 돈다).
  // 한 계정으로 전부 시도하면 뒤쪽이 400이 아니라 429가 되므로 나눠서 확인한다.
  const users = [await nameless(), await nameless()];
  for (const [index, value] of invalid.entries()) {
    const user = users[index % users.length];
    const res = await setUsername(user.token, value);
    assert.equal(res.status, 400, `${JSON.stringify(value)} 는 거절돼야 한다`);
  }
  // 하나도 저장되지 않았다.
  for (const user of users) {
    const status = await req("GET", "/auth/onboarding", { token: user.token });
    assert.equal(status.data.username, null);
  }
});

test("유니코드 정규화는 같은 한글 이름을 두 계정으로 만들지 못한다", async () => {
  const composed = "한글" + uniq("");
  const decomposed = composed.normalize("NFD");
  assert.notEqual(decomposed, composed, "테스트 전제: 분해형이 실제로 다르다");

  const first = await nameless();
  assert.equal((await setUsername(first.token, composed)).status, 200);

  const second = await nameless();
  const clash = await setUsername(second.token, decomposed);
  assert.equal(clash.status, 409, JSON.stringify(clash.data));
  assert.equal(clash.data.code, "username_taken");

  // 영문 대소문자도 같은 이름이다.
  const ascii = "MixedCase" + uniq("");
  const third = await nameless();
  assert.equal((await setUsername(third.token, ascii)).status, 200);
  const fourth = await nameless();
  const asciiClash = await setUsername(fourth.token, ascii.toLowerCase());
  assert.equal(asciiClash.status, 409);
});

test("같은 이름을 동시에 노린 요청은 정확히 하나만 성공한다", async () => {
  const contested = "race" + uniq("");
  const racers = await Promise.all([
    nameless(),
    nameless(),
    nameless(),
    nameless(),
  ]);
  const results = await Promise.all(
    racers.map((user) => setUsername(user.token, contested)),
  );
  const codes = results.map((res) => res.status).sort();
  assert.equal(
    codes.filter((code) => code === 200).length,
    1,
    `정확히 하나만 성공: ${JSON.stringify(results.map((r) => [r.status, r.data]))}`,
  );
  assert.ok(
    codes.filter((code) => code !== 200).every((code) => code === 409),
    `나머지는 500이 아니라 409여야 한다: ${JSON.stringify(codes)}`,
  );
});

test("중복 확인은 검색·프로필과 같은 정규화를 쓴다", async () => {
  const taken = "AvailCheck" + uniq("");
  const owner = await signup({ username: taken });
  assert.equal(owner.username, taken.toLowerCase());

  const other = await nameless();
  const check = async (value) =>
    req("GET", `/users/availability?username=${encodeURIComponent(value)}`, {
      token: other.token,
    });

  const upper = await check(taken.toUpperCase());
  assert.equal(upper.status, 200);
  assert.equal(upper.data.username, taken.toLowerCase());
  assert.equal(upper.data.available, false, "대문자로 물어도 같은 이름이다");

  const free = await check("free" + uniq(""));
  assert.equal(free.data.available, true);

  // 자기가 이미 쓰는 이름은 사용 가능으로 본다(대소문자만 바꾸는 변경 등).
  const mine = await req(
    "GET",
    `/users/availability?username=${encodeURIComponent(taken)}`,
    { token: owner.token },
  );
  assert.equal(mine.data.available, true);

  assert.equal((await check("bad name")).status, 400);
});

test("온보딩은 이름 없이 완료되지 않고, 기존 계정은 완료 상태로 남는다", async () => {
  // 계정만 만든 신규 사용자 — 복무정보를 저장해도 이름이 없으면 완료할 수 없다.
  const email = `${uniq("ob")}@test.com`;
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
          name: "온보딩",
          branch: "army",
          enlistedAt: "2026-01-05",
          dischargeAt: "2027-07-04",
          rank: "private",
        },
      })
    ).status,
    200,
  );
  const blocked = await req("POST", "/auth/onboarding/complete", { token });
  assert.equal(blocked.status, 400, JSON.stringify(blocked.data));

  const status = await req("GET", "/auth/onboarding", { token });
  assert.equal(status.data.completed, false);
  assert.equal(status.data.username, null);

  assert.equal((await setUsername(token, "ob" + uniq(""))).status, 200);
  assert.equal(
    (await req("POST", "/auth/onboarding/complete", { token })).status,
    200,
  );

  // 0023 이전 계정: 온보딩은 완료된 채 이름만 비어 있다 → 1회성 설정 화면 대상.
  const legacy = await nameless();
  const legacyStatus = await req("GET", "/auth/onboarding", {
    token: legacy.token,
  });
  assert.equal(legacyStatus.data.completed, true);
  assert.equal(legacyStatus.data.username, null);
  assert.equal(
    (await req("GET", "/auth/me", { token: legacy.token })).data.user.username,
    null,
  );
});
