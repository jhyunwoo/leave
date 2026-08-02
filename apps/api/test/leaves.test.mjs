import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

test("휴가 등록에는 소속 부대가 필요하다", async () => {
  const { token } = await signup();
  const res = await req("POST", "/leaves", {
    token,
    body: {
      title: "휴가",
      segments: [
        { category: "annual", startDate: "2026-08-01", endDate: "2026-08-03" },
      ],
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
      segments: [
        { category: "annual", startDate: "2026-08-01", endDate: "2026-08-03" },
      ],
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
      segments: [
        { category: "annual", startDate: "2026-08-02", endDate: "2026-08-04" },
      ],
    },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.data.leave.title, "수정휴가");

  const del = await req("DELETE", `/leaves/${id}`, { token });
  assert.equal(del.status, 200);

  const after = await req("GET", "/leaves/mine", { token });
  assert.equal(after.data.leaves.length, 0);
});

test("휴가 구간으로 어느 날이 어떤 재원인지 저장한다", async () => {
  const { token } = await signup({ branch: "air_force" });
  await createUnit(token, { name: uniq("구간부대-") });

  const totals = {};
  for (const item of (await req("GET", "/leaves/balances", { token })).data
    .balances) {
    totals[item.key] = item.totalDays;
  }
  totals.regular_overnight = 8;
  await req("PUT", "/leaves/balances", { token, body: { totals } });

  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "구간 휴가",
      segments: [
        { category: "annual", startDate: "2026-08-02", endDate: "2026-08-05" },
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2026-08-06",
          endDate: "2026-08-09",
        },
      ],
    },
  });
  assert.equal(created.status, 201);
  // 전체 기간은 구간에서 파생된다.
  assert.equal(created.data.leave.startDate, "2026-08-02");
  assert.equal(created.data.leave.endDate, "2026-08-09");
  assert.equal(created.data.leave.segments.length, 2);
  assert.equal(created.data.leave.segments[0].days, 4);

  const gap = await req("POST", "/leaves", {
    token,
    body: {
      title: "빈 날 있는 휴가",
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-02" },
        { category: "annual", startDate: "2026-09-04", endDate: "2026-09-05" },
      ],
    },
  });
  assert.equal(gap.status, 400);

  const overlap = await req("POST", "/leaves", {
    token,
    body: {
      title: "겹치는 휴가",
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-03" },
        { category: "annual", startDate: "2026-09-03", endDate: "2026-09-05" },
      ],
    },
  });
  assert.equal(overlap.status, 400);

  // 같은 재원이 두 번 나오는 구성(연가 → 외박 → 연가)도 허용한다.
  const sandwich = await req("POST", "/leaves", {
    token,
    body: {
      title: "샌드위치 휴가",
      segments: [
        { category: "annual", startDate: "2026-10-01", endDate: "2026-10-01" },
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2026-10-02",
          endDate: "2026-10-02",
        },
        { category: "annual", startDate: "2026-10-03", endDate: "2026-10-03" },
      ],
    },
  });
  assert.equal(sandwich.status, 201);
  assert.equal(sandwich.data.leave.segments.length, 3);
  // 같은 재원이 두 구간에 나뉘어도 합치면 연가 2일.
  assert.equal(
    sandwich.data.leave.segments
      .filter((s) => s.category === "annual")
      .reduce((n, s) => n + s.days, 0),
    2,
  );
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
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-03" },
        { category: "award", startDate: "2026-09-04", endDate: "2026-09-05" },
      ],
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.leave.segments.length, 2);

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

test("해군·공군 정기외박은 주기 안에서만 쓰이고 이월되지 않는다", async () => {
  const owner = await signup({ branch: "navy" });
  const unit = await createUnit(owner.token, { name: uniq("정기외박부대-") });
  const token = owner.token;
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
  const daysAgo = (n) => shift(today, -n);
  const regular = (data) =>
    data.balances.find((item) => item.key === "regular_overnight");
  assert.ok(unit.data.unit.id);

  // 주기 시작일이 오늘이면 아직 첫 적립 전이라 쓸 수 있는 정기외박이 0일이다.
  const waiting = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: today,
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });
  assert.equal(waiting.status, 200);
  assert.deepEqual(
    {
      total: regular(waiting.data).totalDays,
      remaining: regular(waiting.data).remainingDays,
      cycleScoped: regular(waiting.data).cycleScoped,
    },
    { total: 0, remaining: 0, cycleScoped: true },
  );

  // 첫 적립 전에는 정기외박을 쓸 수 없다.
  const tooEarly = await req("POST", "/leaves", {
    token,
    body: {
      title: "첫 적립 전 정기외박",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: today,
          endDate: today,
        },
      ],
    },
  });
  assert.equal(tooEarly.status, 400);
  assert.match(tooEarly.data.error, /첫 적립일/);

  // 주기 시작일을 126일 전으로 옮긴다. 첫 적립은 그 42일 뒤인 daysAgo(84)이므로
  // 1주기는 daysAgo(84)~daysAgo(43), 2주기는 daysAgo(42)~daysAgo(1), 3주기가 오늘 시작.
  await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: daysAgo(126),
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });

  // 지난 1주기·2주기를 한 번도 쓰지 않았지만 쌓이지 않는다 — 이번 주기 몫은 3일뿐.
  const current = await req("GET", "/leaves/balances", { token });
  assert.equal(regular(current.data).totalDays, 3, "이월되면 안 됨");
  assert.equal(regular(current.data).remainingDays, 3);
  assert.equal(regular(current.data).usedDays, 0);

  // 이번 주기에 2박 3일을 쓰면 잔여가 0이 된다.
  const used = await req("POST", "/leaves", {
    token,
    body: {
      title: "이번 주기 정기외박",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: today,
          endDate: shift(today, 2),
        },
      ],
    },
  });
  assert.equal(used.status, 201);
  const afterUse = await req("GET", "/leaves/balances", { token });
  assert.equal(regular(afterUse.data).usedDays, 3);
  assert.equal(regular(afterUse.data).remainingDays, 0);

  // 같은 주기에 하루 더 쓰려 하면 그 주기 몫을 넘어 거절된다.
  const over = await req("POST", "/leaves", {
    token,
    body: {
      title: "초과 정기외박",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: shift(today, 4),
          endDate: shift(today, 4),
        },
      ],
    },
  });
  assert.equal(over.status, 400);
  assert.match(over.data.error, /주기.*몫 3일을 1일 초과/);

  // 지난 주기(2주기)에는 아직 몫이 남아 있어 그 주기 날짜로는 등록된다.
  const past = await req("POST", "/leaves", {
    token,
    body: {
      title: "지난 주기 정기외박",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: daysAgo(10),
          endDate: daysAgo(8),
        },
      ],
    },
  });
  assert.equal(past.status, 201, "지난 주기 몫은 그 주기 날짜로 쓸 수 있어야 함");
  // 지난 주기에 쓴 건 이번 주기 사용량에 섞이지 않는다.
  const mixed = await req("GET", "/leaves/balances", { token });
  assert.equal(regular(mixed.data).usedDays, 3, "이번 주기 사용량만 세야 함");

  // 주기 재원은 총량을 직접 고칠 수 없다 — 다른 재원 저장은 그대로 동작한다.
  // 클라이언트는 늘 전 재원을 한 번에 보내므로 그대로 흉내낸다.
  const body = Object.fromEntries(
    mixed.data.balances.map((item) => [item.key, item.totalDays]),
  );
  const totals = await req("PUT", "/leaves/balances", {
    token,
    body: { totals: { ...body, regular_overnight: 99, award: 7 } },
  });
  assert.equal(totals.status, 200);
  assert.equal(regular(totals.data).totalDays, 3, "주기 재원 총량은 무시해야 함");
  assert.equal(
    totals.data.balances.find((item) => item.key === "award").totalDays,
    7,
  );
});

test("아직 오지 않은 정기외박 주기도 그 몫 안에서 미리 쓸 수 있다", async () => {
  const owner = await signup({ branch: "navy" });
  await createUnit(owner.token, { name: uniq("미래주기부대-") });
  const token = owner.token;
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

  // 주기 시작일이 42일 전이면 첫 적립이 오늘이다. 1주기는 오늘~오늘+41,
  // 2주기는 오늘+42~오늘+83, 3주기는 오늘+84부터.
  const saved = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: shift(today, -42),
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });
  assert.equal(saved.status, 200);

  // 이번 주기 몫을 다 써도 다음 주기에는 영향이 없다.
  const thisCycle = await req("POST", "/leaves", {
    token,
    body: {
      title: "이번 주기",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: today,
          endDate: shift(today, 2),
        },
      ],
    },
  });
  assert.equal(thisCycle.status, 201);

  // 아직 오지 않은 2주기 날짜로 등록된다 — 이게 이번 변경의 핵심.
  const nextCycle = await req("POST", "/leaves", {
    token,
    body: {
      title: "다음 주기 미리 등록",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: shift(today, 50),
          endDate: shift(today, 52),
        },
      ],
    },
  });
  assert.equal(
    nextCycle.status,
    201,
    `미래 주기는 허용해야 함: ${JSON.stringify(nextCycle.data)}`,
  );

  // 그 미래 주기 몫을 넘기면 여전히 막는다.
  const tooMuch = await req("POST", "/leaves", {
    token,
    body: {
      title: "다음 주기 초과",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: shift(today, 60),
          endDate: shift(today, 60),
        },
      ],
    },
  });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.data.error, /몫 3일을 1일 초과/);
});

test("적립일이 전역일 뒤인 정기외박 주기는 미리 쓸 수 없다", async () => {
  // 전역이 2026-12-31이고 주기 시작일이 2026-01-01, 주기 42일이면
  // 첫 적립은 2026-02-12, 이후 42일마다. 2027년 날짜가 속한 주기는
  // 적립일이 전역 뒤라 몫을 받지 못한다.
  const owner = await signup({
    branch: "air_force",
    enlistedAt: "2026-01-05",
    dischargeAt: "2026-12-31",
  });
  await createUnit(owner.token, { name: uniq("전역후부대-") });
  const token = owner.token;

  const saved = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: "2026-01-01",
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });
  assert.equal(saved.status, 200);

  const afterDischarge = await req("POST", "/leaves", {
    token,
    body: {
      title: "전역 후 주기",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2027-03-01",
          endDate: "2027-03-02",
        },
      ],
    },
  });
  assert.equal(afterDischarge.status, 400);
  assert.match(afterDischarge.data.error, /전역일 뒤/);
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
  const oneDay = [
    { category: "annual", startDate: "2026-10-05", endDate: "2026-10-05" },
  ];
  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "휴가1",
      segments: oneDay,
    },
  });
  await req("POST", "/leaves", {
    token: u2.token,
    body: {
      title: "휴가2",
      segments: oneDay,
    },
  });
  const third = await req("POST", "/leaves", {
    token: u3.token,
    body: {
      title: "휴가3",
      segments: oneDay,
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

/** 한국 시간 오늘에서 days만큼 옮긴 YYYY-MM-DD. */
function todayShift(days) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const fundOf = (page, key) => page.funds.find((f) => f.key === key);

test("적립분 CRUD — 만기 있는 건과 없는 건을 따로 들고 고친다", async () => {
  const { token } = await signup({ branch: "army" });
  await createUnit(token, { name: uniq("적립분부대-") });

  const dated = await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 3, expiresOn: todayShift(30), note: "사격 우수" },
  });
  assert.equal(dated.status, 201);

  const open = await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 2 },
  });
  assert.equal(open.status, 201);

  const award = fundOf(open.data, "award");
  assert.equal(award.totalDays, 5);
  assert.equal(award.remainingDays, 5);
  assert.equal(award.grants.length, 2);
  // 만기가 빠른 건이 먼저 온다.
  assert.equal(award.grants[0].days, 3);
  assert.equal(award.grants[0].note, "사격 우수");
  assert.equal(award.grants[0].status, "active");
  assert.equal(award.grants[1].expiresOn, null);

  const grantId = award.grants[0].id;
  const patched = await req("PATCH", `/leaves/grants/${grantId}`, {
    token,
    body: { days: 6 },
  });
  assert.equal(patched.status, 200);
  assert.equal(fundOf(patched.data, "award").totalDays, 8);

  const removed = await req("DELETE", `/leaves/grants/${grantId}`, { token });
  assert.equal(removed.status, 200);
  assert.equal(fundOf(removed.data, "award").totalDays, 2);

  const missing = await req("DELETE", `/leaves/grants/${grantId}`, { token });
  assert.equal(missing.status, 404);
});

test("남의 적립분은 고치거나 지울 수 없다", async () => {
  const mine = await signup();
  const other = await signup();
  const created = await req("POST", "/leaves/grants", {
    token: mine.token,
    body: { balanceKey: "award", days: 3 },
  });
  const id = fundOf(created.data, "award").grants[0].id;

  assert.equal(
    (await req("PATCH", `/leaves/grants/${id}`, { token: other.token, body: { days: 9 } })).status,
    404,
  );
  assert.equal(
    (await req("DELETE", `/leaves/grants/${id}`, { token: other.token })).status,
    404,
  );
});

test("만기가 지난 적립분은 잔여에서 빠지고 소멸로 잡힌다", async () => {
  const { token } = await signup();
  await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 4, expiresOn: todayShift(-1) },
  });

  const balances = await req("GET", "/leaves/balances", { token });
  const award = balances.data.balances.find((item) => item.key === "award");
  assert.equal(award.totalDays, 4);
  assert.equal(award.remainingDays, 0);
  assert.equal(award.expiredDays, 4);
  assert.equal(award.grantCount, 1);
});

test("부여일이 아직 안 온 적립분은 예정으로 빠진다", async () => {
  const { token } = await signup();
  await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 4, grantedOn: todayShift(10) },
  });
  const balances = await req("GET", "/leaves/balances", { token });
  const award = balances.data.balances.find((item) => item.key === "award");
  assert.equal(award.upcomingDays, 4);
  assert.equal(award.remainingDays, 0);
});

test("만기가 지난 날짜에는 그 적립분으로 휴가를 쓸 수 없다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("만기부대-") });
  await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 5, expiresOn: todayShift(10) },
  });

  const tooLate = await req("POST", "/leaves", {
    token,
    body: {
      title: "만기 넘긴 포상",
      segments: [
        { category: "award", startDate: todayShift(20), endDate: todayShift(21) },
      ],
    },
  });
  assert.equal(tooLate.status, 400);
  assert.match(tooLate.data.error, /포상휴가/);

  const inTime = await req("POST", "/leaves", {
    token,
    body: {
      title: "만기 전 포상",
      segments: [
        { category: "award", startDate: todayShift(5), endDate: todayShift(6) },
      ],
    },
  });
  assert.equal(inTime.status, 201);

  const page = await req("GET", "/leaves/grants", { token });
  const award = fundOf(page.data, "award");
  assert.equal(award.usedDays, 2);
  assert.equal(award.remainingDays, 3);
  assert.equal(award.grants[0].usedDays, 2);
});

test("적립분을 꽉 채워 쓴 휴가도 같은 범위로 다시 수정할 수 있다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("수정부대-") });
  await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 2, expiresOn: todayShift(30) },
  });

  const created = await req("POST", "/leaves", {
    token,
    body: {
      title: "포상휴가",
      segments: [
        { category: "award", startDate: todayShift(3), endDate: todayShift(4) },
      ],
    },
  });
  assert.equal(created.status, 201);

  // 같은 범위로 제목만 바꾼다 — 자기 자신과 부딪히면 안 된다.
  const patched = await req("PATCH", `/leaves/${created.data.leave.id}`, {
    token,
    body: {
      title: "포상휴가(수정)",
      segments: [
        { category: "award", startDate: todayShift(3), endDate: todayShift(4) },
      ],
    },
  });
  assert.equal(patched.status, 200);
});

test("구버전 총량 API는 만기 없는 기본 적립분만 늘리고 줄인다", async () => {
  const { token } = await signup({ branch: "army" });

  const base = await req("GET", "/leaves/balances", { token });
  const totals = Object.fromEntries(
    base.data.balances.map((item) => [item.key, item.totalDays]),
  );
  totals.award = 7;
  assert.equal((await req("PUT", "/leaves/balances", { token, body: { totals } })).status, 200);

  let page = await req("GET", "/leaves/grants", { token });
  let award = fundOf(page.data, "award");
  assert.equal(award.grants.length, 1);
  assert.equal(award.grants[0].days, 7);
  assert.equal(award.grants[0].expiresOn, null);

  // 만기가 붙은 적립분을 더한 뒤 총량을 올리면 만기 없는 쪽만 커진다.
  await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "award", days: 3, expiresOn: todayShift(30) },
  });
  totals.award = 12;
  assert.equal((await req("PUT", "/leaves/balances", { token, body: { totals } })).status, 200);

  page = await req("GET", "/leaves/grants", { token });
  award = fundOf(page.data, "award");
  assert.equal(award.totalDays, 12);
  const dated = award.grants.find((g) => g.expiresOn !== null);
  const open = award.grants.find((g) => g.expiresOn === null);
  assert.equal(dated.days, 3);
  assert.equal(open.days, 9);
});

test("자동 적립을 쓰면 정기외박 적립분을 따로 만들 수 없다", async () => {
  const { token } = await signup({ branch: "navy" });
  await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: todayShift(-90),
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });

  const rejected = await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "regular_overnight", days: 3 },
  });
  assert.equal(rejected.status, 400);
  assert.match(rejected.data.error, /주기 설정/);

  // 육군은 자동 적립이 없으므로 수동 적립분을 가질 수 있다.
  const army = await signup({ branch: "army" });
  const allowed = await req("POST", "/leaves/grants", {
    token: army.token,
    body: { balanceKey: "regular_overnight", days: 3 },
  });
  assert.equal(allowed.status, 201);
});

test("주기 목록은 첫 적립일부터 전역일까지 이어진다", async () => {
  const { token } = await signup({
    branch: "navy",
    enlistedAt: "2026-01-05",
    dischargeAt: "2027-07-04",
  });
  const startDate = "2026-01-05";
  await req("PUT", "/leaves/regular-overnight", {
    token,
    body: { enabled: true, startDate, intervalDays: 42, daysPerGrant: 3 },
  });

  const page = await req("GET", "/leaves/grants", { token });
  const cycles = page.data.regularOvernight.cycles;
  assert.ok(cycles.length > 10);
  // 1주기는 주기 시작일이 아니라 한 주기 뒤 첫 적립일에 시작한다.
  assert.equal(cycles[0].index, 1);
  assert.equal(cycles[0].start, "2026-02-16");
  // 모든 주기가 회당 적립 일수를 쥐고 시작한다.
  assert.ok(cycles.every((c) => c.grantDays === 3));
  assert.ok(cycles[cycles.length - 1].end >= "2027-07-04");
  assert.equal(cycles.filter((c) => c.state === "current").length, 1);
  // 주기 재원은 적립분 원장이 아니라 주기 목록에서 셈한다.
  assert.equal(fundOf(page.data, "regular_overnight").cycleScoped, true);
  assert.equal(fundOf(page.data, "regular_overnight").grants.length, 0);
});

test("남은 휴가에 앞으로 받을 주기 몫까지 들어간다", async () => {
  const { token } = await signup({
    branch: "navy",
    enlistedAt: "2026-01-05",
    dischargeAt: "2027-07-04",
  });
  await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: "2026-01-05",
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });

  const page = await req("GET", "/leaves/grants", { token });
  const { totals, regularOvernight } = page.data;
  const cycles = regularOvernight.cycles;
  const sumOf = (state) =>
    cycles
      .filter((c) => c.state === state)
      .reduce((sum, c) => sum + c.remainingDays, 0);

  // 지난 주기 몫은 소멸, 이번·앞으로의 주기 몫은 남은 휴가.
  const ahead = sumOf("current") + sumOf("future");
  assert.ok(ahead > 0, "앞으로 받을 주기 몫이 있어야 한다");
  const funds = page.data.funds.filter((fund) => !fund.cycleScoped);
  const manual = funds.reduce((sum, fund) => sum + fund.remainingDays, 0);
  assert.equal(totals.remainingDays, manual + ahead);
  assert.equal(
    totals.totalDays,
    funds.reduce((sum, fund) => sum + fund.totalDays, 0) +
      cycles.reduce((sum, c) => sum + c.grantDays, 0),
  );
  // 소멸에는 지나간 주기의 미사용분이 함께 잡힌다.
  assert.equal(
    totals.expiredDays,
    funds.reduce((sum, fund) => sum + fund.expiredDays, 0) + sumOf("past"),
  );
  // 총량 = 사용 + 남은 + 소멸 + 적립 예정 (막대와 부제가 어긋나지 않도록).
  // 미귀속 사용분이 있으면 이 항등식이 깨지므로 그것부터 확인한다.
  assert.equal(totals.unattributedDays, 0);
  assert.equal(
    totals.totalDays,
    totals.usedDays +
      totals.remainingDays +
      totals.expiredDays +
      totals.upcomingDays,
  );

  // 내 휴가 탭이 같은 수를 낼 수 있어야 한다: 이번 주기 잔여 + 앞으로 받을 몫.
  const balances = await req("GET", "/leaves/balances", { token });
  const regularItem = balances.data.balances.find(
    (item) => item.key === "regular_overnight",
  );
  assert.equal(regularItem.cycleScoped, true);
  assert.equal(regularItem.remainingDays + regularItem.upcomingDays, ahead);
});

test("적립분 입력값 검증 — 0일과 뒤집힌 만기는 거절한다", async () => {
  const { token } = await signup();
  assert.equal(
    (await req("POST", "/leaves/grants", { token, body: { balanceKey: "award", days: 0 } })).status,
    400,
  );
  const flipped = await req("POST", "/leaves/grants", {
    token,
    body: {
      balanceKey: "award",
      days: 2,
      grantedOn: todayShift(30),
      expiresOn: todayShift(10),
    },
  });
  assert.equal(flipped.status, 400);
  assert.match(flipped.data.error, /부여일과 같거나 뒤/);
});
