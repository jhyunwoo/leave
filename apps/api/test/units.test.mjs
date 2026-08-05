import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

async function joinCreatedUnit(token, created) {
  return req("POST", "/units/join", {
    token,
    body: { code: created.data.invite.code },
  });
}

test("그룹 생성 → 생성자는 자동 가입·관리자이고 초대코드는 한 번 반환된다", async () => {
  const { token } = await signup();
  const created = await createUnit(token, {
    name: uniq("비식별그룹-"),
    referenceMemberTotal: 60,
    maxLeaveCount: 12,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.unit.memberCount, 1);
  assert.equal(created.data.unit.referenceMemberTotal, 60);
  assert.ok(created.data.unit.lastTotalUpdatedAt);
  assert.match(created.data.invite.code, /^[A-Za-z0-9_-]{32,}$/);

  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  assert.equal(me.data.unit.adminId, me.data.user.id);
  assert.equal(me.data.joinRequest, null);
});

test("초대코드 가입은 즉시 부대원 편입되고 멤버 목록에 반영된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const member = await signup();
  const joined = await joinCreatedUnit(member.token, created);
  assert.equal(joined.status, 200);
  assert.equal(joined.data.joined, true);
  assert.equal(joined.data.unit.id, created.data.unit.id);

  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  const members = await req("GET", `/units/${created.data.unit.id}/members`, {
    token: owner.token,
  });
  assert.equal(members.status, 200);
  assert.equal(members.data.members.length, 2);
});

test("관리자가 계정을 지우면 남은 부대원에게 관리자 권한이 이관된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const deleted = await req("DELETE", "/auth/account", { token: owner.token });
  assert.equal(deleted.status, 200);
  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  assert.equal(me.data.unit.adminId, member.data.user.id);

  const patch = await req("PATCH", `/units/${created.data.unit.id}`, {
    token: member.token,
    body: { description: "승계된 관리자" },
  });
  assert.equal(patch.status, 200);
});

test("그룹 정보 수정은 현재 관리자만 가능하고 기준 인원 갱신 시각을 관리한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, {
    referenceMemberTotal: 50,
    maxLeaveCount: 10,
  });
  const unitId = created.data.unit.id;
  const outsider = await signup();
  const forbidden = await req("PATCH", `/units/${unitId}`, {
    token: outsider.token,
    body: { name: uniq("탈취-") },
  });
  assert.equal(forbidden.status, 403);

  const beforeUpdatedAt = created.data.unit.lastTotalUpdatedAt;
  const patched = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { referenceMemberTotal: 55, maxLeaveCount: 2 },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.unit.referenceMemberTotal, 55);
  assert.equal(patched.data.unit.maxLeaveCount, 2);
  assert.ok(patched.data.unit.lastTotalUpdatedAt >= beforeUpdatedAt);

  const zero = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { maxLeaveCount: 0 },
  });
  assert.equal(zero.status, 200);
  assert.equal(zero.data.unit.maxLeaveCount, 0);
  const nulled = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { maxLeaveCount: null },
  });
  assert.equal(nulled.status, 400);
});

test("관리자 이관 후 새 관리자만 수정할 수 있다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);
  const outsider = await signup();

  const badTransfer = await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: outsider.data.user.id },
  });
  assert.equal(badTransfer.status, 400);
  const transferred = await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: member.data.user.id },
  });
  assert.equal(transferred.status, 200);
  assert.equal(transferred.data.unit.adminId, member.data.user.id);

  const oldForbidden = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { description: "이전 관리자" },
  });
  assert.equal(oldForbidden.status, 403);
  const updated = await req("PATCH", `/units/${unitId}`, {
    token: member.token,
    body: { description: "새 관리자" },
  });
  assert.equal(updated.status, 200);
});

test("관리자는 멤버를 제거할 수 있지만 자신은 제거할 수 없다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const self = await req(
    "POST",
    `/units/${unitId}/members/${owner.data.user.id}/remove`,
    { token: owner.token },
  );
  assert.equal(self.status, 400);
  const removed = await req(
    "POST",
    `/units/${unitId}/members/${member.data.user.id}/remove`,
    { token: owner.token },
  );
  assert.equal(removed.status, 200);
  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit, null);
});

test("관리자는 이관 전 탈퇴할 수 없고 이관 후에는 탈퇴할 수 있다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const blocked = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(blocked.status, 409);
  await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: member.data.user.id },
  });
  const left = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(left.status, 200);
  const me = await req("GET", "/auth/me", { token: owner.token });
  assert.equal(me.data.unit, null);
});

test("상세·멤버·달력은 현재 멤버십을 서버에서 검증한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const outsider = await signup();

  const detail = await req("GET", `/units/${unitId}`, {
    token: outsider.token,
  });
  const members = await req("GET", `/units/${unitId}/members`, {
    token: outsider.token,
  });
  const calendar = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: outsider.token,
  });
  assert.equal(detail.status, 403);
  assert.equal(members.status, 403);
  assert.equal(calendar.status, 403);
});

test("달력은 익명 집계와 본인 일정만 반환하고 현재 월 ±3개월로 제한한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 1 });
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);
  const date = "2026-08-15";

  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "관리자 비밀 일정",
      reason: "외부에 노출되면 안 됨",
      segments: [{ category: "annual", startDate: date, endDate: date }],
    },
  });
  await req("POST", "/leaves", {
    token: member.token,
    body: {
      title: "내 일정",
      reason: "내 사유",
      segments: [{ category: "annual", startDate: date, endDate: date }],
    },
  });

  const calendar = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: member.token,
  });
  assert.equal(calendar.status, 200);
  const day = calendar.data.days.find((item) => item.date === date);
  assert.equal(day.count, 2);
  assert.equal(day.exceeded, true);
  assert.ok(!Object.hasOwn(day, "userIds"));
  assert.equal(calendar.data.leaves.length, 1);
  assert.equal(calendar.data.leaves[0].title, "내 일정");
  assert.equal(calendar.data.leaves[0].reason, "내 사유");
  for (const key of [
    "userId",
    "userName",
    "userRankLabel",
    "userProfileImageKey",
  ]) {
    assert.ok(!Object.hasOwn(calendar.data.leaves[0], key));
  }
  assert.doesNotMatch(
    JSON.stringify(calendar.data),
    /관리자 비밀 일정|외부에 노출/,
  );

  const current = new Date();
  const farYear = current.getUTCFullYear() + 2;
  const far = await req(
    "GET",
    `/units/${unitId}/calendar?month=${farYear}-01`,
    { token: member.token },
  );
  assert.equal(far.status, 400);
});

test("휴가 등록 뒤 달력 집계와 본인 상세에 즉시 반영된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const month = "2026-09";
  const before = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token: owner.token,
  });
  assert.equal(before.status, 200);
  assert.equal(before.data.leaves.length, 0);

  const added = await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "9월 휴가",
      segments: [
        { category: "annual", startDate: "2026-09-10", endDate: "2026-09-12" },
      ],
    },
  });
  assert.equal(added.status, 201);
  const after = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token: owner.token,
  });
  assert.equal(after.status, 200);
  assert.equal(after.data.leaves.length, 1);
  assert.equal(after.data.leaves[0].title, "9월 휴가");
});
