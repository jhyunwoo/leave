import { markEmailVerified } from "./helpers.mjs";
// GET /auth/me/duty-days — 남은 일과일.
//
// 요일·공휴일·전역일 당일 같은 경계는 packages/shared의 vitest가 지킨다(순수 함수라
// 오늘 날짜에 기대지 않고 셀 수 있다). 여기서 확인하는 것은 서버만 아는 부분이다 —
// **무엇을 빼기로 했는가**: 부대 휴일은 빼고, 외출과 초안 휴가는 빼지 않는다.
//
// 그래서 절대값을 박아 두지 않는다. 테스트가 도는 날이 달라지면 정답도 달라지기
// 때문이다. 대신 "남은 구간을 통째로 덮으면 0이 되는가 / 그대로인가"만 본다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

const SEOUL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function today() {
  return SEOUL.format(new Date());
}

function addDays(date, days) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * 남은 창을 통째로 덮는 휴가를 넣으려면 그만큼의 재원이 있어야 한다.
 * 기본값은 연가 24일뿐이라 60일짜리 휴가가 잔여 부족으로 거절된다.
 */
async function topUpBalances(token) {
  const totals = {};
  for (const item of (await req("GET", "/leaves/balances", { token })).data
    .balances) {
    totals[item.key] = item.totalDays;
  }
  totals.annual = 300;
  const res = await req("PUT", "/leaves/balances", { token, body: { totals } });
  assert.equal(res.status, 200);
}

/**
 * 실제로 일과가 있는 날 하나를 찾는다.
 *
 * 외출이 일과일을 깎지 않는다는 것을 "숫자가 그대로다"로만 보면, 하필 주말이나
 * 공휴일을 골랐을 때도 통과해 버린다. 연가를 하루 넣어 **실제로 1이 줄어드는 날**을
 * 확인하고 되돌린 뒤, 그 날짜를 외출에 쓴다.
 */
async function findDutyDate(token, from) {
  const before = (await readDutyDays(token)).data.dutyDays;
  for (let offset = 0; offset < 10; offset += 1) {
    const date = addDays(from, offset);
    const created = await req("POST", "/leaves", {
      token,
      body: {
        title: "탐색",
        segments: [{ category: "annual", startDate: date, endDate: date }],
      },
    });
    assert.equal(created.status, 201);
    const after = (await readDutyDays(token)).data.dutyDays;
    await req("DELETE", `/leaves/${created.data.leave.id}`, { token });
    if (after === before - 1) return date;
  }
  throw new Error("열흘 안에 일과일이 없다");
}

/** 전역이 60일 남은 계정. 창이 짧아 휴가 한 건으로 통째로 덮을 수 있다. */
async function soldierWithUnit() {
  const from = today();
  const dischargeAt = addDays(from, 60);
  const account = await signup({
    enlistedAt: addDays(from, -400),
    dischargeAt,
  });
  await createUnit(account.token, { name: uniq("일과일-") });
  await topUpBalances(account.token);
  return { ...account, from, dischargeAt, through: addDays(dischargeAt, -1) };
}

function readDutyDays(token) {
  return req("GET", "/auth/me/duty-days", { token });
}

/** 남은 창을 통째로 덮는 휴가 한 건. */
function coverWindow(token, soldier, segment, status) {
  return req("POST", "/leaves", {
    token,
    body: {
      title: "창 전체",
      ...(status ? { status } : {}),
      segments: [
        { startDate: soldier.from, endDate: soldier.through, ...segment },
      ],
    },
  });
}

test("남은 일과일은 인증과 온보딩을 요구한다", async () => {
  const anonymous = await readDutyDays(undefined);
  assert.equal(anonymous.status, 401);

  const email = `${uniq("duty-")}@test.com`;
  const created = await req("POST", "/auth/signup", {
    body: {
      email,
      password: "password123",
      dataConsent: true,
    },
  });
  assert.equal(created.status, 201);
  markEmailVerified(email);
  const blocked = await readDutyDays(created.data.token);
  assert.equal(blocked.status, 428);
});

test("남은 일과일은 오늘부터 전역 전날까지를 세고 남은 달력일수를 넘지 않는다", async () => {
  const soldier = await soldierWithUnit();

  const me = await req("GET", "/auth/me", { token: soldier.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.daysUntilDischarge, 60);

  const { status, data } = await readDutyDays(soldier.token);
  assert.equal(status, 200);
  assert.equal(data.from, soldier.from);
  // 전역일 당일은 일과일이 아니므로 마지막으로 세는 날은 그 전날이다.
  assert.equal(data.through, soldier.through);
  assert.ok(Number.isInteger(data.dutyDays));
  assert.ok(data.dutyDays >= 0);
  assert.ok(
    data.dutyDays <= me.data.user.daysUntilDischarge,
    `일과일(${data.dutyDays})이 남은 달력일수(${me.data.user.daysUntilDischarge})보다 많을 수 없다`,
  );
});

test("전역한 계정은 0을 돌려준다", async () => {
  const from = today();
  const { token } = await signup({
    enlistedAt: addDays(from, -600),
    dischargeAt: addDays(from, -30),
  });
  const { status, data } = await readDutyDays(token);
  assert.equal(status, 200);
  assert.equal(data.dutyDays, 0);
});

test("남은 구간을 덮는 휴가는 일과일을 0으로 만들고, 되돌리면 원래대로 돌아온다", async () => {
  const soldier = await soldierWithUnit();
  const before = await readDutyDays(soldier.token);
  assert.ok(before.data.dutyDays > 0, "60일 안에는 평일이 남아 있어야 한다");

  const created = await coverWindow(soldier.token, soldier, {
    category: "annual",
  });
  assert.equal(created.status, 201);
  const during = await readDutyDays(soldier.token);
  assert.equal(during.data.dutyDays, 0);

  const removed = await req("DELETE", `/leaves/${created.data.leave.id}`, {
    token: soldier.token,
  });
  assert.equal(removed.status, 200);
  const after = await readDutyDays(soldier.token);
  assert.equal(after.data.dutyDays, before.data.dutyDays);
});

test("외출과 초안 휴가는 일과일에서 빠지지 않는다", async () => {
  const outing = await soldierWithUnit();
  // 외출은 하루짜리다(부대관리훈령 — 당일 복귀). 그래서 남은 창을 통째로 덮는
  // 대신, 연가로 1이 줄어드는 것을 확인한 그 날짜에 외출을 넣는다.
  const dutyDate = await findDutyDate(outing.token, outing.from);
  const outingBefore = await readDutyDays(outing.token);
  // 외출은 같은 날 복귀한다 — 나가 있어도 그 날의 일과가 사라지지 않는다.
  const outingLeave = await req("POST", "/leaves", {
    token: outing.token,
    body: {
      title: "외출",
      segments: [
        {
          category: "outing",
          outingKind: "weekday",
          startDate: dutyDate,
          endDate: dutyDate,
        },
      ],
    },
  });
  assert.equal(outingLeave.status, 201);
  const outingAfter = await readDutyDays(outing.token);
  assert.equal(outingAfter.data.dutyDays, outingBefore.data.dutyDays);

  const draft = await soldierWithUnit();
  const draftBefore = await readDutyDays(draft.token);
  // 초안은 나만 보는 시뮬레이션이라 집계 어디에도 들어가지 않는다.
  const draftLeave = await coverWindow(
    draft.token,
    draft,
    { category: "annual" },
    "draft",
  );
  assert.equal(draftLeave.status, 201);
  const draftAfter = await readDutyDays(draft.token);
  assert.equal(draftAfter.data.dutyDays, draftBefore.data.dutyDays);
});

test("부대 휴일은 일과일에서 빠지고, 휴일이 아닌 부대 일정은 빠지지 않는다", async () => {
  const soldier = await soldierWithUnit();
  const unit = await req("GET", "/auth/me", { token: soldier.token });
  const unitId = unit.data.unit.id;
  const before = await readDutyDays(soldier.token);
  assert.ok(before.data.dutyDays > 0);

  const plain = await req("POST", `/units/${unitId}/events`, {
    token: soldier.token,
    body: {
      title: "정신교육",
      isHoliday: false,
      startDate: soldier.from,
      endDate: soldier.through,
    },
  });
  assert.equal(plain.status, 201);
  const afterPlain = await readDutyDays(soldier.token);
  assert.equal(afterPlain.data.dutyDays, before.data.dutyDays);

  const holiday = await req("POST", `/units/${unitId}/events`, {
    token: soldier.token,
    body: {
      title: "부대 휴무",
      isHoliday: true,
      startDate: soldier.from,
      endDate: soldier.through,
    },
  });
  assert.equal(holiday.status, 201);
  const afterHoliday = await readDutyDays(soldier.token);
  assert.equal(afterHoliday.data.dutyDays, 0);
});

test("그룹에 참여하지 않은 계정도 일과일을 받는다", async () => {
  const from = today();
  const { token } = await signup({
    enlistedAt: addDays(from, -400),
    dischargeAt: addDays(from, 60),
  });
  const { status, data } = await readDutyDays(token);
  assert.equal(status, 200);
  assert.ok(data.dutyDays > 0);
});
