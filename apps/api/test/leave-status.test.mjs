import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup } from "./helpers.mjs";

test("초안은 나만 보이고 그룹 집계에 들어가지 않는다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 3 });
  const unitId = created.data.unit.id;
  const invite = created.data.invite.code;

  const draft = await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "고민 중인 계획",
      status: "draft",
      segments: [
        { category: "annual", startDate: "2026-09-10", endDate: "2026-09-11" },
      ],
    },
  });
  assert.equal(draft.status, 201);
  assert.equal(draft.data.leave.status, "draft");

  const other = await signup();
  await req("POST", "/units/join", {
    token: other.token,
    body: { code: invite },
  });

  // 남이 보는 집계에는 초안이 들어가면 안 된다.
  const otherView = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: other.token },
  );
  const otherDay = otherView.data.days.find((d) => d.date === "2026-09-10");
  assert.equal(otherDay.count, 0);
  assert.equal(otherView.data.leaves.length, 0);

  // 본인 달력에는 초안이 그대로 보여야 시뮬레이션이 성립한다.
  const ownView = await req("GET", `/units/${unitId}/calendar?month=2026-09`, {
    token: owner.token,
  });
  assert.equal(ownView.data.leaves.length, 1);
  assert.equal(ownView.data.leaves[0].status, "draft");
  // 초안은 집계에서 빠지므로 본인이 보는 count도 0이다.
  const ownDay = ownView.data.days.find((d) => d.date === "2026-09-10");
  assert.equal(ownDay.count, 0);
});

test("초안을 공유로 바꾸면 그때부터 집계에 잡힌다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 3 });
  const unitId = created.data.unit.id;

  const draft = await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "계획",
      status: "draft",
      segments: [
        { category: "annual", startDate: "2026-09-15", endDate: "2026-09-15" },
      ],
    },
  });
  const id = draft.data.leave.id;

  // 상태를 보내지 않는 수정은 초안을 조용히 공유로 바꾸지 않는다.
  const renamed = await req("PATCH", `/leaves/${id}`, {
    token: owner.token,
    body: {
      title: "이름만 변경",
      segments: [
        { category: "annual", startDate: "2026-09-15", endDate: "2026-09-15" },
      ],
    },
  });
  assert.equal(renamed.data.leave.status, "draft");

  const shared = await req("PATCH", `/leaves/${id}`, {
    token: owner.token,
    body: {
      title: "이름만 변경",
      status: "shared",
      segments: [
        { category: "annual", startDate: "2026-09-15", endDate: "2026-09-15" },
      ],
    },
  });
  assert.equal(shared.data.leave.status, "shared");

  const calendar = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: owner.token },
  );
  const day = calendar.data.days.find((d) => d.date === "2026-09-15");
  assert.equal(day.count, 1);
});

test("복귀일 계산 설정이 서버 집계에 그대로 반영된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, {
    maxLeaveCount: 3,
    returnDayCounts: false,
  });
  const unitId = created.data.unit.id;
  assert.equal(created.data.unit.returnDayCounts, false);

  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "8/24~8/26 휴가",
      segments: [
        { category: "annual", startDate: "2026-08-24", endDate: "2026-08-26" },
      ],
    },
  });

  const off = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: owner.token,
  });
  const byDate = (data, date) => data.days.find((d) => d.date === date).count;
  assert.equal(byDate(off.data, "2026-08-24"), 1);
  assert.equal(byDate(off.data, "2026-08-25"), 1);
  // 복귀일은 세지 않는 설정.
  assert.equal(byDate(off.data, "2026-08-26"), 0);

  const enabled = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { returnDayCounts: true },
  });
  assert.equal(enabled.data.unit.returnDayCounts, true);

  const on = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: owner.token,
  });
  assert.equal(byDate(on.data, "2026-08-26"), 1);
});

test("당일 외출은 복귀일 설정과 무관하게 하루로 센다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, {
    maxLeaveCount: 3,
    returnDayCounts: false,
  });
  const unitId = created.data.unit.id;

  const outing = await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "당일 외출",
      segments: [
        { category: "annual", startDate: "2026-08-28", endDate: "2026-08-28" },
      ],
    },
  });
  assert.equal(outing.status, 201, JSON.stringify(outing.data));

  const calendar = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-08`,
    { token: owner.token },
  );
  const day = calendar.data.days.find((d) => d.date === "2026-08-28");
  assert.equal(day.count, 1);
});

test("블랙아웃은 관리자만 등록하고 달력에 blocked로 표시된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 3 });
  const unitId = created.data.unit.id;
  const invite = created.data.invite.code;

  const member = await signup();
  await req("POST", "/units/join", {
    token: member.token,
    body: { code: invite },
  });

  // 일반 참여자는 등록할 수 없다.
  const forbidden = await req("POST", `/units/${unitId}/blackouts`, {
    token: member.token,
    body: { startDate: "2026-09-01", endDate: "2026-09-03" },
  });
  assert.equal(forbidden.status, 403);

  const invalid = await req("POST", `/units/${unitId}/blackouts`, {
    token: owner.token,
    body: { startDate: "2026-09-05", endDate: "2026-09-01" },
  });
  assert.equal(invalid.status, 400);

  const createdBlackout = await req("POST", `/units/${unitId}/blackouts`, {
    token: owner.token,
    body: {
      startDate: "2026-09-01",
      endDate: "2026-09-03",
      reason: "정기 검열",
    },
  });
  assert.equal(createdBlackout.status, 201);
  const blackoutId = createdBlackout.data.blackout.id;

  const calendar = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: member.token },
  );
  const blocked = (date) =>
    calendar.data.days.find((d) => d.date === date).blocked;
  assert.equal(blocked("2026-09-01"), true);
  assert.equal(blocked("2026-09-03"), true);
  assert.equal(blocked("2026-09-04"), false);
  assert.equal(calendar.data.blackouts.length, 1);
  assert.equal(calendar.data.blackouts[0].reason, "정기 검열");

  // 참여자도 목록은 볼 수 있어야 계획을 세울 수 있다.
  const list = await req("GET", `/units/${unitId}/blackouts`, {
    token: member.token,
  });
  assert.equal(list.status, 200);
  assert.equal(list.data.blackouts.length, 1);

  const notAdmin = await req(
    "DELETE",
    `/units/${unitId}/blackouts/${blackoutId}`,
    { token: member.token },
  );
  assert.equal(notAdmin.status, 403);

  const removed = await req(
    "DELETE",
    `/units/${unitId}/blackouts/${blackoutId}`,
    { token: owner.token },
  );
  assert.equal(removed.status, 200);

  const after = await req("GET", `/units/${unitId}/calendar?month=2026-09`, {
    token: owner.token,
  });
  assert.equal(after.data.days.find((d) => d.date === "2026-09-01").blocked, false);
});

test("그룹을 나간 사람의 기존 일정은 집계에서 빠진다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 3 });
  const unitId = created.data.unit.id;
  const invite = created.data.invite.code;

  const leaver = await signup();
  await req("POST", "/units/join", {
    token: leaver.token,
    body: { code: invite },
  });
  await req("POST", "/leaves", {
    token: leaver.token,
    body: {
      title: "휴가",
      segments: [
        { category: "annual", startDate: "2026-09-20", endDate: "2026-09-21" },
      ],
    },
  });

  const before = await req("GET", `/units/${unitId}/calendar?month=2026-09`, {
    token: owner.token,
  });
  assert.equal(
    before.data.days.find((d) => d.date === "2026-09-20").count,
    1,
  );

  const left = await req("POST", "/units/leave", { token: leaver.token });
  assert.equal(left.status, 200);

  const after = await req("GET", `/units/${unitId}/calendar?month=2026-09`, {
    token: owner.token,
  });
  assert.equal(after.data.days.find((d) => d.date === "2026-09-20").count, 0);
});
