import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup } from "./helpers.mjs";

test("개인 일정 CRUD·여러 날 표시·입력 검증", async () => {
  const owner = await signup();
  const created = await req("POST", "/personal-events", {
    token: owner.token,
    body: {
      title: "개인 일정",
      startDate: "2026-09-29",
      endDate: "2026-10-02",
      startTime: "09:30",
      endTime: "18:00",
      note: "비공개 메모",
    },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const id = created.data.event.id;
  assert.equal(
    (await req("GET", "/personal-events?month=2026-09", { token: owner.token }))
      .data.events.length,
    1,
  );
  assert.equal(
    (await req("GET", "/personal-events?month=2026-10", { token: owner.token }))
      .data.events.length,
    1,
  );

  const updated = await req("PATCH", `/personal-events/${id}`, {
    token: owner.token,
    body: {
      title: "수정 일정",
      endDate: "2026-10-03",
      startTime: null,
      endTime: null,
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.event.title, "수정 일정");
  assert.equal(updated.data.event.startTime, null);

  assert.equal(
    (
      await req("POST", "/personal-events", {
        token: owner.token,
        body: { title: "역순", startDate: "2026-10-02", endDate: "2026-10-01" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("POST", "/personal-events", {
        token: owner.token,
        body: {
          title: "시간",
          startDate: "2026-10-01",
          endDate: "2026-10-01",
          startTime: "18:00",
          endTime: "09:00",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await req("POST", "/personal-events", {
        token: owner.token,
        body: {
          title: "시간",
          startDate: "2026-10-01",
          endDate: "2026-10-01",
          startTime: "24:00",
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (await req("DELETE", `/personal-events/${id}`, { token: owner.token }))
      .status,
    200,
  );
  assert.equal(
    (await req("GET", `/personal-events/${id}`, { token: owner.token })).status,
    404,
  );
});

test("개인 일정은 소유자 외 읽기·수정·삭제가 불가능하다", async () => {
  const owner = await signup();
  const other = await signup();
  const created = await req("POST", "/personal-events", {
    token: owner.token,
    body: { title: "비밀", startDate: "2026-09-01", endDate: "2026-09-01" },
  });
  const id = created.data.event.id;
  assert.equal(
    (await req("GET", `/personal-events/${id}`, { token: other.token })).status,
    404,
  );
  assert.equal(
    (
      await req("PATCH", `/personal-events/${id}`, {
        token: other.token,
        body: { title: "탈취" },
      })
    ).status,
    404,
  );
  assert.equal(
    (await req("DELETE", `/personal-events/${id}`, { token: other.token }))
      .status,
    404,
  );
  assert.equal(
    (await req("GET", "/personal-events?month=2026-09", { token: other.token }))
      .data.events.length,
    0,
  );
});

test("개인 일정은 부대 집계·잔여·알림을 바꾸지 않는다", async () => {
  const owner = await signup();
  const unit = await createUnit(owner.token);
  const unitId = unit.data.unit.id;
  const beforeCalendar = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: owner.token },
  );
  const beforeBalances = await req("GET", "/leaves/balances", {
    token: owner.token,
  });
  const beforeNotifications = await req("GET", "/notifications", {
    token: owner.token,
  });
  await req("POST", "/personal-events", {
    token: owner.token,
    body: {
      title: "휴가 아닌 일정",
      startDate: "2026-09-10",
      endDate: "2026-09-12",
    },
  });
  const afterCalendar = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: owner.token },
  );
  const afterBalances = await req("GET", "/leaves/balances", {
    token: owner.token,
  });
  const afterNotifications = await req("GET", "/notifications", {
    token: owner.token,
  });
  assert.deepEqual(afterCalendar.data.days, beforeCalendar.data.days);
  assert.deepEqual(afterBalances.data, beforeBalances.data);
  assert.deepEqual(afterNotifications.data, beforeNotifications.data);
});

test("계정 삭제는 개인 일정을 제거하고 무소속 사용자도 개인 일정을 쓸 수 있다", async () => {
  const owner = await signup();
  const created = await req("POST", "/personal-events", {
    token: owner.token,
    body: {
      title: "무소속 일정",
      startDate: "2026-09-01",
      endDate: "2026-09-01",
    },
  });
  assert.equal(created.status, 201);
  assert.equal(
    (await req("DELETE", "/auth/account", { token: owner.token })).status,
    200,
  );
  assert.equal(
    (
      await req("GET", `/personal-events/${created.data.event.id}`, {
        token: owner.token,
      })
    ).status,
    401,
  );
});
