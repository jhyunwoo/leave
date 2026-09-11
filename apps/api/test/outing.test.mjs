// 외출 — 주기 기반 재원.
//
// 주기 산술 자체의 경계(달 말일·연말·전역일)는 packages/shared의 vitest가 지킨다.
// 여기서 확인하는 것은 서버만 아는 부분이다 — 가입할 때 군별 기본값이 실제로 깔리는가,
// 저장이 주기 몫과 "하루" 규칙을 막는가, 평일과 주말 주머니가 정말로 따로 도는가.
import assert from "node:assert/strict";
import { test } from "node:test";
import { req, signup, uniq, createUnit } from "./helpers.mjs";

/** 입대 2026-01-05 → 주기 시작 2026-01-01, 1주기는 2026-02-01부터 한 달씩. */
const ENLISTED = "2026-01-05";
const DISCHARGE = "2027-07-04";

function outingConfigs(token) {
  return req("GET", "/leaves/balances", { token }).then(
    (res) => res.data.outing,
  );
}

function byKind(configs, kind) {
  return configs.find((item) => item.kind === kind);
}

function postOuting(token, date, kind, extra = {}) {
  return req("POST", "/leaves", {
    token,
    body: {
      title: `${kind} 외출`,
      segments: [
        {
          category: "outing",
          outingKind: kind,
          startDate: date,
          endDate: date,
        },
      ],
      ...extra,
    },
  });
}

test("가입하면 군별 외출 기본 주기가 깔린다", async () => {
  const army = await signup({ enlistedAt: ENLISTED, dischargeAt: DISCHARGE });
  const armyConfigs = await outingConfigs(army.token);
  assert.equal(armyConfigs.length, 2);

  // 평일 외출은 전 군 월 2회.
  assert.deepEqual(
    (({ kind, enabled, startDate, intervalMonths, daysPerGrant }) => ({
      kind,
      enabled,
      startDate,
      intervalMonths,
      daysPerGrant,
    }))(byKind(armyConfigs, "weekday")),
    {
      kind: "weekday",
      enabled: true,
      // 입대한 달의 1일 — "한 달에 두 번"은 달력의 달로 센다.
      startDate: "2026-01-01",
      intervalMonths: 1,
      daysPerGrant: 2,
    },
  );
  // 주말 외출은 육군만 월 1회.
  assert.equal(byKind(armyConfigs, "weekend").enabled, true);
  assert.equal(byKind(armyConfigs, "weekend").daysPerGrant, 1);

  const navy = await signup({
    branch: "navy",
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const navyConfigs = await outingConfigs(navy.token);
  assert.equal(byKind(navyConfigs, "weekday").enabled, true);
  // 해·공군의 주말 외출 주기는 공개 규정에 없어 기본이 꺼짐이다.
  assert.equal(byKind(navyConfigs, "weekend").enabled, false);
  assert.equal(byKind(navyConfigs, "weekend").daysPerGrant, null);
});

test("외출 잔여는 주기에서 나온다 — 적립분 없이도 등록된다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const balances = (await req("GET", "/leaves/balances", { token })).data
    .balances;
  const weekday = balances.find((item) => item.key === "outing");
  assert.equal(weekday.label, "평일 외출");
  assert.equal(weekday.cycleScoped, true, "주기에서 파생해야 한다");

  const created = await postOuting(token, "2026-03-10", "weekday");
  assert.equal(created.status, 201);
  assert.equal(created.data.leave.segments[0].outingKind, "weekday");
  assert.equal(created.data.leave.segments[0].days, 1);
});

test("외출은 하루로만 등록된다 — 밤을 넘기면 그것은 외박이다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const res = await req("POST", "/leaves", {
    token,
    body: {
      title: "이틀 외출",
      segments: [
        {
          category: "outing",
          outingKind: "weekday",
          startDate: "2026-03-10",
          endDate: "2026-03-11",
        },
      ],
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /당일 복귀/);
});

test("주기 몫을 넘기면 막는다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  // 3월 주기 몫은 2회.
  assert.equal((await postOuting(token, "2026-03-10", "weekday")).status, 201);
  assert.equal((await postOuting(token, "2026-03-12", "weekday")).status, 201);

  const over = await postOuting(token, "2026-03-14", "weekday");
  assert.equal(over.status, 400);
  assert.match(over.data.error, /평일 외출 2주기.*몫 2회를 1회 초과/);

  // 다음 달은 새 주기라 다시 열린다.
  assert.equal((await postOuting(token, "2026-04-02", "weekday")).status, 201);
});

test("평일과 주말은 서로의 몫을 깎지 않는다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  assert.equal((await postOuting(token, "2026-03-10", "weekday")).status, 201);
  assert.equal((await postOuting(token, "2026-03-12", "weekday")).status, 201);
  // 평일 몫을 다 썼어도 주말 몫은 그대로다.
  assert.equal((await postOuting(token, "2026-03-14", "weekend")).status, 201);
  // 주말은 회당 1회라 두 번째부터 막힌다.
  const over = await postOuting(token, "2026-03-21", "weekend");
  assert.equal(over.status, 400);
  assert.match(over.data.error, /주말 외출/);
});

test("첫 적립 전에는 쓸 수 없다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  // 주기 시작 2026-01-01, 첫 적립은 한 주기 뒤인 2026-02-01.
  const early = await postOuting(token, "2026-01-20", "weekday");
  assert.equal(early.status, 400);
  assert.match(early.data.error, /첫 적립일/);
});

test("설정을 바꾸면 잔여가 곧바로 따라온다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const saved = await req("PUT", "/leaves/outing", {
    token,
    body: {
      kind: "weekday",
      enabled: true,
      startDate: "2026-01-01",
      intervalMonths: 1,
      daysPerGrant: 4,
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(byKind(saved.data.outing, "weekday").daysPerGrant, 4);

  // 4회로 늘렸으니 3월에 세 번째도 들어간다.
  assert.equal((await postOuting(token, "2026-03-10", "weekday")).status, 201);
  assert.equal((await postOuting(token, "2026-03-12", "weekday")).status, 201);
  assert.equal((await postOuting(token, "2026-03-14", "weekday")).status, 201);
});

test("끄면 주기가 사라지고 적립분 셈으로 돌아간다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const off = await req("PUT", "/leaves/outing", {
    token,
    body: { kind: "weekday", enabled: false },
  });
  assert.equal(off.status, 200);
  assert.equal(byKind(off.data.outing, "weekday").enabled, false);

  const balances = off.data.balances.find((item) => item.key === "outing");
  assert.equal(balances.cycleScoped, false);
  // 적립분이 없으므로 이제는 잔여 부족으로 막힌다.
  const res = await postOuting(token, "2026-03-10", "weekday");
  assert.equal(res.status, 400);
  assert.match(res.data.error, /평일 외출/);

  // 적립분을 손으로 넣으면 다시 쓸 수 있다 — 주기를 끈 갈래는 원장으로 돈다.
  const grant = await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "outing", days: 3 },
  });
  assert.equal(grant.status, 201);
  assert.equal((await postOuting(token, "2026-03-10", "weekday")).status, 201);
});

test("주기를 쓰는 갈래의 적립분은 손으로 만들 수 없다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const res = await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "outing", days: 3 },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /평일 외출.*자동으로 계산/);
});

test("주기 수 상한을 넘기는 설정은 저장되지 않는다", async () => {
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const res = await req("PUT", "/leaves/outing", {
    token,
    body: {
      kind: "weekday",
      enabled: true,
      startDate: "1900-01-01",
      intervalDays: 1,
      daysPerGrant: 1,
    },
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /주기를 \d+개 만듭니다/);
});

test("보유 휴가는 외출을 '남은 휴가 일수'에 더하지 않는다", async () => {
  // 외출은 일이 아니라 횟수다 — 당일 복귀라 일과가 사라지지 않는다.
  // 대신 화면이 제 단위로 그릴 수 있도록 주기 목록을 따로 실어 보낸다.
  const { token } = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  const page = (await req("GET", "/leaves/grants", { token })).data;
  const manual = page.funds
    .filter((fund) => !fund.cycleScoped)
    .reduce((sum, fund) => sum + fund.remainingDays, 0);
  const overnightAhead = page.regularOvernight.cycles
    .filter((cycle) => cycle.state !== "past")
    .reduce((sum, cycle) => sum + cycle.remainingDays, 0);
  assert.equal(page.totals.remainingDays, manual + overnightAhead);

  const weekday = page.outing.find((fund) => fund.kind === "weekday");
  assert.equal(weekday.enabled, true);
  assert.ok(weekday.cycles.length > 0, "주기 목록이 있어야 한다");
  // 외출 주기에는 색이 없다 — 달력이 색 선이 아니라 시작일 마커로 그린다.
  assert.equal(weekday.cycles[0].color, undefined);
  assert.equal(page.regularOvernight.cycles.length, 0);
});

test("외출도 부대 출타 집계에는 들어간다", async () => {
  // 일과일에서는 빼지만(duty-days) 부대 달력에서는 센다 — 묻는 것이 다르다.
  const owner = await signup({
    enlistedAt: ENLISTED,
    dischargeAt: DISCHARGE,
  });
  await createUnit(owner.token, { name: uniq("외출부대-") });
  const me = await req("GET", "/auth/me", { token: owner.token });
  const unitId = me.data.unit.id;

  assert.equal(
    (await postOuting(owner.token, "2026-03-10", "weekday")).status,
    201,
  );
  const calendar = await req("GET", `/units/${unitId}/calendar?month=2026-03`, {
    token: owner.token,
  });
  assert.equal(calendar.status, 200);
  const day = calendar.data.days.find((item) => item.date === "2026-03-10");
  assert.equal(day.count, 1, "외출도 그날 부대 밖에 있는 인원이다");
});
