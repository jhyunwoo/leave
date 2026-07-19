import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

test("부대 생성 → 생성자는 자동 가입·관리자", async () => {
  const { token, data: me0 } = await signup();
  const created = await createUnit(token, { name: uniq("9단-") });
  assert.equal(created.status, 201);
  assert.equal(created.data.unit.memberCount, 1);

  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  // 생성자가 관리자
  assert.equal(me.data.unit.adminId, me.data.user.id);
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

test("가입 신청 → 관리자 승인 → 부대원 편입", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("가입부대-") });
  const unitId = unit.data.unit.id;

  const joiner = await signup();
  const join = await req("POST", `/units/${unitId}/join`, {
    token: joiner.token,
  });
  assert.equal(join.status, 200);
  assert.equal(join.data.requested, true);

  // 신청만 한 상태 — 아직 부대원 아님
  const meBefore = await req("GET", "/auth/me", { token: joiner.token });
  assert.equal(meBefore.data.unit, null);
  assert.equal(meBefore.data.joinRequest.unitId, unitId);

  // 관리자만 신청 목록 조회 가능
  const outsider = await signup();
  const forbidden = await req("GET", `/units/${unitId}/requests`, {
    token: outsider.token,
  });
  assert.equal(forbidden.status, 403);

  const requests = await req("GET", `/units/${unitId}/requests`, {
    token: owner.token,
  });
  assert.equal(requests.status, 200);
  assert.equal(requests.data.requests.length, 1);
  assert.equal(requests.data.requests[0].userId, joiner.data.user.id);

  // 승인
  const approve = await req(
    "POST",
    `/units/${unitId}/requests/${joiner.data.user.id}/approve`,
    { token: owner.token },
  );
  assert.equal(approve.status, 200);

  const meAfter = await req("GET", "/auth/me", { token: joiner.token });
  assert.equal(meAfter.data.unit.id, unitId);
  assert.equal(meAfter.data.joinRequest, null);

  const members = await req("GET", `/units/${unitId}/members`, {
    token: owner.token,
  });
  assert.equal(members.data.members.length, 2);
});

test("비관리자는 승인 불가 (403)", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("권한부대-") });
  const unitId = unit.data.unit.id;
  const joiner = await signup();
  await req("POST", `/units/${unitId}/join`, { token: joiner.token });

  const outsider = await signup();
  const res = await req(
    "POST",
    `/units/${unitId}/requests/${joiner.data.user.id}/approve`,
    { token: outsider.token },
  );
  assert.equal(res.status, 403);
});

test("관리자 거절 → 부대원 편입 안 됨", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("거절부대-") });
  const unitId = unit.data.unit.id;
  const joiner = await signup();
  await req("POST", `/units/${unitId}/join`, { token: joiner.token });

  const reject = await req(
    "POST",
    `/units/${unitId}/requests/${joiner.data.user.id}/reject`,
    { token: owner.token },
  );
  assert.equal(reject.status, 200);

  const me = await req("GET", "/auth/me", { token: joiner.token });
  assert.equal(me.data.unit, null);
  assert.equal(me.data.joinRequest, null);
});

test("부대 정보 수정은 관리자만 (headcount로 출타율 계산)", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, {
    name: uniq("수정부대-"),
    maxLeaveNumerator: 1,
    maxLeaveDenominator: 3,
  });
  const unitId = unit.data.unit.id;

  // 비관리자 403
  const outsider = await signup();
  const forbidden = await req("PATCH", `/units/${unitId}`, {
    token: outsider.token,
    body: { name: uniq("탈취-") },
  });
  assert.equal(forbidden.status, 403);

  // 부대 인원 30명 설정 → 하루 허용 floor(30/3)=10
  const patch = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { headcount: 30, description: "수정됨" },
  });
  assert.equal(patch.status, 200);
  assert.equal(patch.data.unit.headcount, 30);

  const cal = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: owner.token,
  });
  assert.equal(cal.status, 200);
  assert.equal(cal.data.days[0].allowed, 10);
});

test("관리자 이관 후 새 관리자만 수정 가능", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("이관부대-") });
  const unitId = unit.data.unit.id;

  // 부대원 편입
  const member = await signup();
  await req("POST", `/units/${unitId}/join`, { token: member.token });
  await req(
    "POST",
    `/units/${unitId}/requests/${member.data.user.id}/approve`,
    { token: owner.token },
  );

  // 부대원이 아닌 사람에게는 이관 불가 (400)
  const outsider = await signup();
  const badTransfer = await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: outsider.data.user.id },
  });
  assert.equal(badTransfer.status, 400);

  // 이관
  const transfer = await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: member.data.user.id },
  });
  assert.equal(transfer.status, 200);
  assert.equal(transfer.data.unit.adminId, member.data.user.id);

  // 이전 관리자는 이제 수정 불가
  const oldForbidden = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { description: "again" },
  });
  assert.equal(oldForbidden.status, 403);

  // 새 관리자는 수정 가능
  const ok = await req("PATCH", `/units/${unitId}`, {
    token: member.token,
    body: { description: "새 관리자" },
  });
  assert.equal(ok.status, 200);
});

test("관리자가 부대원 제거", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("제거부대-") });
  const unitId = unit.data.unit.id;
  const member = await signup();
  await req("POST", `/units/${unitId}/join`, { token: member.token });
  await req(
    "POST",
    `/units/${unitId}/requests/${member.data.user.id}/approve`,
    { token: owner.token },
  );

  // 자기 자신은 제거 불가
  const self = await req(
    "POST",
    `/units/${unitId}/members/${owner.data.user.id}/remove`,
    { token: owner.token },
  );
  assert.equal(self.status, 400);

  const remove = await req(
    "POST",
    `/units/${unitId}/members/${member.data.user.id}/remove`,
    { token: owner.token },
  );
  assert.equal(remove.status, 200);

  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit, null);
});

test("관리자는 다른 부대원 있으면 이관 전 탈퇴 불가(409), 이관 후 가능", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token, { name: uniq("탈퇴부대-") });
  const unitId = unit.data.unit.id;
  const member = await signup();
  await req("POST", `/units/${unitId}/join`, { token: member.token });
  await req(
    "POST",
    `/units/${unitId}/requests/${member.data.user.id}/approve`,
    { token: owner.token },
  );

  const blocked = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(blocked.status, 409);

  await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: member.data.user.id },
  });
  const ok = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(ok.status, 200);
});

test("혼자 남은 관리자가 나가면 빈 부대 삭제", async () => {
  const owner = await signup();
  const name = uniq("혼자부대-");
  const unit = await createUnit(owner.token, { name });
  const unitId = unit.data.unit.id;

  const leave = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(leave.status, 200);

  const found = await req("GET", `/units/${unitId}`, { token: owner.token });
  assert.equal(found.status, 404);
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

  const before = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token,
  });
  assert.equal(before.status, 200);
  assert.equal(before.data.leaves.length, 0);

  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "9월 휴가",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
    },
  });
  assert.equal(created.status, 201);

  const after = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token,
  });
  assert.equal(after.status, 200);
  assert.equal(after.data.leaves.length, 1);
  assert.equal(after.data.leaves[0].title, "9월 휴가");
});
