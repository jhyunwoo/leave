import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

test("부대 생성 → 생성자는 자동 가입 상태", async () => {
  const { token } = await signup();
  const created = await createUnit(token, { name: uniq("9단-") });
  assert.equal(created.status, 201);
  assert.equal(created.data.unit.memberCount, 1);

  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.data.unit.id, created.data.unit.id);
});

test("부대 검색", async () => {
  const { token } = await signup();
  const name = uniq("검색부대-");
  await createUnit(token, { name });
  const found = await req("GET", `/units?q=${encodeURIComponent(name)}`, {
    token,
  });
  assert.equal(found.status, 200);
  assert.ok(found.data.units.some((u) => u.name === name));
});

test("같은 이름 부대는 409", async () => {
  const { token } = await signup();
  const name = uniq("중복부대-");
  await createUnit(token, { name });
  const dup = await createUnit(token, { name });
  assert.equal(dup.status, 409);
});

test("부대 가입 후 부대원 목록 조회", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("가입부대-") });
  const unitId = unit.data.unit.id;

  const joiner = await signup();
  const join = await req("POST", `/units/${unitId}/join`, {
    token: joiner.token,
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.unit.memberCount, 2);

  const members = await req("GET", `/units/${unitId}/members`, {
    token: joiner.token,
  });
  assert.equal(members.status, 200);
  assert.equal(members.data.members.length, 2);
});

test("부대원이 아니면 달력 조회 403", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("비밀부대-") });
  const outsider = await signup();
  const res = await req(
    "GET",
    `/units/${unit.data.unit.id}/calendar?month=2026-08`,
    { token: outsider.token },
  );
  assert.equal(res.status, 403);
});

test("달력 캐시: 휴가 등록 후 즉시 달력에 반영된다 (무효화 동작)", async () => {
  const { token } = await signup();
  const unit = await createUnit(token, { name: uniq("달력부대-") });
  const unitId = unit.data.unit.id;
  const month = "2026-09";

  // 최초 조회 → 캐시 채움
  const before = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token,
  });
  assert.equal(before.status, 200);
  assert.equal(before.data.leaves.length, 0);

  // 휴가 등록 (캐시 버전 무효화되어야 함)
  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "9월 휴가",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
    },
  });
  assert.equal(created.status, 201);

  // 재조회 → 방금 등록한 휴가가 보여야 한다 (stale 캐시가 아님)
  const after = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token,
  });
  assert.equal(after.status, 200);
  assert.equal(after.data.leaves.length, 1);
  assert.equal(after.data.leaves[0].title, "9월 휴가");
});
