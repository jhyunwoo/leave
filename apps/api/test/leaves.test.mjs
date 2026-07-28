import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

test("휴가 등록에는 소속 부대가 필요하다", async () => {
  const { token } = await signup();
  const res = await req("POST", "/leaves", {
    token,
    body: {
      title: "휴가",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      allocations: [{ category: "annual", days: 3 }],
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /부대/);
});

test("내 휴가 목록 CRUD", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("휴가부대-") });

  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "정기휴가",
      startDate: "2026-08-01",
      endDate: "2026-08-03",
      allocations: [{ category: "annual", days: 3 }],
    },
  });
  assert.equal(created.status, 201);
  const id = created.data.leave.id;

  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.data.leaves.length, 1);

  const updated = await req("PATCH", `/leaves/${id}`, {
    token,
    body: {
      title: "수정휴가",
      startDate: "2026-08-02",
      endDate: "2026-08-04",
      allocations: [{ category: "annual", days: 3 }],
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.leave.title, "수정휴가");

  const del = await req("DELETE", `/leaves/${id}`, { token });
  assert.equal(del.status, 200);

  const after = await req("GET", "/leaves/mine", { token });
  assert.equal(after.data.leaves.length, 0);
});

test("군별 기본 연가를 제안하고 모든 총량을 수정해 복합 휴가에서 차감한다", async () => {
  const { token } = await signup({ branch: "air_force" });
  await createUnit(token, { name: uniq("재원부대-") });

  const initial = await req("GET", "/leaves/balances", { token });
  assert.equal(initial.status, 200);
  const totals = Object.fromEntries(
    initial.data.balances.map((item) => [item.key, item.totalDays]),
  );
  assert.equal(totals.annual, 28);
  totals.annual = 30;
  totals.award = 7;
  totals.compensation = 4;

  const changed = await req("PUT", "/leaves/balances", {
    token,
    body: { totals },
  });
  assert.equal(changed.status, 200);
  assert.equal(
    changed.data.balances.find((item) => item.key === "annual").totalDays,
    30,
  );
  assert.equal(
    changed.data.balances.find((item) => item.key === "award").totalDays,
    7,
  );

  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "복합 휴가",
      startDate: "2026-09-01",
      endDate: "2026-09-05",
      allocations: [
        { category: "annual", days: 3 },
        { category: "award", days: 2 },
      ],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.leave.allocations.length, 2);

  const after = await req("GET", "/leaves/balances", { token });
  assert.equal(
    after.data.balances.find((item) => item.key === "annual").remainingDays,
    27,
  );
  assert.equal(
    after.data.balances.find((item) => item.key === "award").remainingDays,
    5,
  );

  totals.annual = 2;
  const belowUsed = await req("PUT", "/leaves/balances", {
    token,
    body: { totals },
  });
  assert.equal(belowUsed.status, 400);
  assert.match(belowUsed.data.error, /이미 3일/);
});

test("해군·공군 정기외박은 사용자가 주기와 회당 일수를 정하고 중복 없이 적립한다", async () => {
  const { token } = await signup({ branch: "navy" });
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const configured = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      nextGrantDate: today,
      intervalDays: 42,
      daysPerGrant: 4,
    },
  });
  assert.equal(configured.status, 200);
  const first = configured.data.balances.find(
    (item) => item.key === "regular_overnight",
  );
  assert.equal(first.automaticDays, 4);

  const repeated = await req("GET", "/leaves/balances", { token });
  const second = repeated.data.balances.find(
    (item) => item.key === "regular_overnight",
  );
  assert.equal(second.automaticDays, 4, "같은 도래일은 한 번만 적립해야 함");
  assert.equal(repeated.data.regularOvernight.intervalDays, 42);
  assert.equal(repeated.data.regularOvernight.daysPerGrant, 4);
});

test("직접 지정 최대 출타 인원 초과 시 초과일 계산 + 알림 + 푸시 발송 로그", async () => {
  // 비율상 전원 출타 가능하지만 직접 지정 최대 인원은 2명
  const owner = await signup();
  const unit = await createUnit(owner.token, {
    name: uniq("초과부대-"),
    maxLeaveNumerator: 1,
    maxLeaveDenominator: 1,
    maxLeaveCount: 2,
  });
  const unitId = unit.data.unit.id;

  const u2 = await signup();
  const u3 = await signup();
  await req("POST", `/units/${unitId}/join`, { token: u2.token });
  await req("POST", `/units/${unitId}/join`, { token: u3.token });
  // 관리자(owner)가 두 신청을 승인해야 부대원으로 편입된다.
  await req("POST", `/units/${unitId}/requests/${u2.data.user.id}/approve`, {
    token: owner.token,
  });
  await req("POST", `/units/${unitId}/requests/${u3.data.user.id}/approve`, {
    token: owner.token,
  });

  // 같은 날짜에 3명이 휴가 → 직접 지정한 2명 초과
  const range = { startDate: "2026-10-05", endDate: "2026-10-05" };
  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "휴가1",
      ...range,
      allocations: [{ category: "annual", days: 1 }],
    },
  });
  await req("POST", "/leaves", {
    token: u2.token,
    body: {
      title: "휴가2",
      ...range,
      allocations: [{ category: "annual", days: 1 }],
    },
  });
  const third = await req("POST", "/leaves", {
    token: u3.token,
    body: {
      title: "휴가3",
      ...range,
      allocations: [{ category: "annual", days: 1 }],
    },
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
