import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

test("휴가 등록에는 소속 부대가 필요하다", async () => {
  const { token } = await signup();
  const res = await req("POST", "/leaves", {
    token,
    body: { title: "휴가", startDate: "2026-08-01", endDate: "2026-08-03" },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /부대/);
});

test("내 휴가 목록 CRUD", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("휴가부대-") });

  const created = await req("POST", "/leaves", {
    token,
    body: { title: "정기휴가", startDate: "2026-08-01", endDate: "2026-08-03" },
  });
  assert.equal(created.status, 201);
  const id = created.data.leave.id;

  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.data.leaves.length, 1);

  const updated = await req("PATCH", `/leaves/${id}`, {
    token,
    body: { title: "수정휴가", startDate: "2026-08-02", endDate: "2026-08-04" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.leave.title, "수정휴가");

  const del = await req("DELETE", `/leaves/${id}`, { token });
  assert.equal(del.status, 200);

  const after = await req("GET", "/leaves/mine", { token });
  assert.equal(after.data.leaves.length, 0);
});

test("출타율 초과 시 초과일 계산 + 알림 + 푸시 발송 로그", async () => {
  // 출타율 1/3 부대에 3명 → 2명 이상 겹치면 초과
  const owner = await signup();
  const unit = await createUnit(owner.token, {
    name: uniq("초과부대-"),
    maxLeaveNumerator: 1,
    maxLeaveDenominator: 3,
  });
  const unitId = unit.data.unit.id;

  const u2 = await signup();
  const u3 = await signup();
  await req("POST", `/units/${unitId}/join`, { token: u2.token });
  await req("POST", `/units/${unitId}/join`, { token: u3.token });

  // 같은 날짜에 3명이 휴가 → 1/3(=1명) 초과
  const range = { startDate: "2026-10-05", endDate: "2026-10-05" };
  await req("POST", "/leaves", {
    token: owner.token,
    body: { title: "휴가1", ...range },
  });
  await req("POST", "/leaves", {
    token: u2.token,
    body: { title: "휴가2", ...range },
  });
  const third = await req("POST", "/leaves", {
    token: u3.token,
    body: { title: "휴가3", ...range },
  });

  assert.equal(third.status, 201);
  assert.ok(
    third.data.exceededDates.includes("2026-10-05"),
    "10월 5일이 초과일로 계산되어야 함",
  );

  // 초과일에 걸린 부대원에게 인앱 알림이 생성된다
  const notis = await req("GET", "/notifications", { token: owner.token });
  assert.ok(notis.data.notifications.length >= 1, "알림이 생성되어야 함");
  assert.ok(notis.data.unreadCount >= 1);

  // 푸시 발송 로그(push_logs, direction=send)가 남는다 — waitUntil이므로 잠깐 대기
  await sleep(700);
  const activity = await req("GET", "/auth/activity", { token: owner.token });
  const sendLogs = activity.data.pushLogs.filter((l) => l.direction === "send");
  assert.ok(sendLogs.length >= 1, "푸시 발송 로그가 있어야 함");
  // 실제 Expo 토큰이 없으므로 skipped 상태로 기록된다
  assert.ok(["skipped", "ok", "error"].includes(sendLogs[0].status));
});
