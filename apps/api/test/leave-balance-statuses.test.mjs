/**
 * 잔여 휴가가 어떤 상태의 휴가를 세는가.
 *
 * 예전에는 `userSegmentsQuery`에 상태 조건이 아예 없어서 **취소·반려한 휴가가 계속
 * 잔여를 깎았다.** 사용자는 휴가를 취소해도 일수가 돌아오지 않는 것을 봤고, 폼·달력은
 * 다른 기준으로 세서 층마다 숫자가 달랐다. 기준은 `BALANCE_LEAVE_STATUSES` 하나다.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

const annual = (data) => data.balances.find((item) => item.key === "annual");

async function member() {
  const { token } = await signup();
  await createUnit(token, { name: uniq("잔여부대-"), maxLeaveCount: 30 });
  return token;
}

test("취소하면 잔여 휴가가 돌아온다", async () => {
  const token = await member();
  const before = annual(
    (await req("GET", "/leaves/balances", { token })).data,
  ).remainingDays;

  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "연가",
      status: "approved",
      segments: [
        { category: "annual", startDate: "2026-08-03", endDate: "2026-08-05" },
      ],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(
    annual((await req("GET", "/leaves/balances", { token })).data)
      .remainingDays,
    before - 3,
  );

  // `/status`는 사용자가 직접 고를 수 있는 상태만 받는다(종료 상태는 제외). 취소는
  // 전체 수정 경로로 들어온다.
  const cancelled = await req("PATCH", `/leaves/${created.data.leave.id}`, {
    token,
    body: {
      title: "연가",
      status: "cancelled",
      segments: [
        { category: "annual", startDate: "2026-08-03", endDate: "2026-08-05" },
      ],
    },
  });
  assert.equal(cancelled.status, 200, cancelled.data?.error);

  const after = await req("GET", "/leaves/balances", { token });
  assert.equal(
    annual(after.data).remainingDays,
    before,
    "취소분이 돌아와야 한다",
  );
  assert.equal(annual(after.data).usedDays, 0);
});

test("초안은 내가 잡아 둔 계획이라 잔여에서 빠진다", async () => {
  const token = await member();
  const before = annual(
    (await req("GET", "/leaves/balances", { token })).data,
  ).remainingDays;

  const draft = await req("POST", "/leaves", {
    token,
    body: {
      title: "고민 중",
      status: "draft",
      segments: [
        { category: "annual", startDate: "2026-08-10", endDate: "2026-08-11" },
      ],
    },
  });
  assert.equal(draft.status, 201);
  assert.equal(
    annual((await req("GET", "/leaves/balances", { token })).data)
      .remainingDays,
    before - 2,
  );
});

test("초안과 실제 휴가가 같은 날을 덮어도 하루를 두 번 세지 않는다", async () => {
  const token = await member();
  const before = annual(
    (await req("GET", "/leaves/balances", { token })).data,
  ).remainingDays;
  const body = (status) => ({
    title: status === "draft" ? "시뮬레이션" : "실제 휴가",
    status,
    segments: [
      { category: "annual", startDate: "2026-09-07", endDate: "2026-09-11" },
    ],
  });

  assert.equal(
    (await req("POST", "/leaves", { token, body: body("draft") })).status,
    201,
  );
  // 같은 상태끼리만 겹침을 보므로(leave-merge) 상태가 다르면 둘 다 저장된다.
  assert.equal(
    (await req("POST", "/leaves", { token, body: body("shared") })).status,
    201,
  );

  const after = await req("GET", "/leaves/balances", { token });
  assert.equal(
    annual(after.data).usedDays,
    5,
    "5일 여행에서 5일만 빠져야 한다",
  );
  assert.equal(annual(after.data).remainingDays, before - 5);
});

/**
 * 사용자가 고른 주기가 있으면 그 주기에서 통째로 뺀다. 서버가 이 컬럼을 읽지 않던
 * 동안에는 항상 겹침 계산으로 떨어져, 주기를 걸친 정기외박이 두 주기로 쪼개졌고
 * 폼(=/leaves/mine을 보는 쪽)과 귀속이 갈렸다.
 */
test("선택한 주기가 있으면 정기외박 전체를 그 주기에서 뺀다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("주기부대-"), maxLeaveCount: 30 });

  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shift = (from, days) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // 주기 시작일을 126일 전으로 → 첫 적립은 84일 전, 3주기가 오늘 시작한다.
  const config = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: shift(today, -126),
      intervalDays: 42,
      daysPerGrant: 4,
    },
  });
  assert.equal(config.status, 200);

  // 2주기 마지막 날과 3주기 첫날에 걸치는 구간을 3주기(오늘 시작)에 배정한다.
  const straddling = await req("POST", "/leaves", {
    token,
    body: {
      title: "주기를 걸친 정기외박",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: shift(today, -1),
          endDate: shift(today, 1),
          regularOvernightCycleStart: today,
        },
      ],
    },
  });
  assert.equal(straddling.status, 201, straddling.data?.error);

  const grants = await req("GET", "/leaves/grants", { token });
  const cycles = grants.data.regularOvernight?.cycles ?? [];
  const current = cycles.find((cycle) => cycle.start === today);
  assert.ok(current, "오늘 시작하는 주기가 목록에 있어야 한다");
  assert.equal(current.usedDays, 3, "3일 전부가 선택한 주기로 가야 한다");

  const previous = cycles.find((cycle) => cycle.end === shift(today, -1));
  if (previous) assert.equal(previous.usedDays, 0, "앞 주기는 건드리지 않는다");
});
