// D1의 "한 문장에 바인드 파라미터 100개" 상한에 걸렸던 자리들에 대한 회귀 테스트.
//
// 셋 다 같은 모양의 사고였다 — 규모가 작을 때는 멀쩡하다가 어느 수를 넘는 순간
// SQLITE_ERROR로 요청이 통째로 500이 된다. 경계 바로 위를 반드시 함께 확인한다.
import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

/** 2026-01-01부터 n일 뒤의 "YYYY-MM-DD". */
function day(n) {
  const d = new Date(Date.UTC(2026, 0, 1));
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 가입 시 심기는 기본 연가(24일)로는 모자란 테스트를 위해 적립분을 더한다. */
async function grantAnnualDays(token, days) {
  const res = await req("POST", "/leaves/grants", {
    token,
    body: { balanceKey: "annual", days },
  });
  assert.equal(res.status, 201, JSON.stringify(res.data));
}

/** 하루짜리 구간 count개를 빈틈없이 이어 붙인다. */
function dailySegments(count, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    category: "annual",
    startDate: day(offset + i),
    endDate: day(offset + i),
  }));
}

test("구간이 스키마 상한(30개)까지 있어도 등록·수정·조회가 된다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("구간상한-") });
  // 구간 30개 × 2회(등록·수정)를 감당할 잔여를 먼저 만든다.
  await grantAnnualDays(token, 60);

  // 구간 15개부터 한 INSERT 문이 상한을 넘었다(구간 행은 컬럼이 7개다).
  const created = await req("POST", "/leaves", {
    token,
    body: { title: "구간30", segments: dailySegments(30) },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.leave.segments.length, 30);
  assert.equal(created.data.leave.startDate, day(0));
  assert.equal(created.data.leave.endDate, day(29));

  // 목록 조회도 같은 구간을 그대로 돌려준다.
  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.status, 200);
  assert.equal(mine.data.leaves[0].segments.length, 30);

  // 수정 경로(구간을 지우고 다시 넣는다)도 같은 상한을 지난다.
  const updated = await req("PATCH", `/leaves/${created.data.leave.id}`, {
    token,
    body: { title: "구간30수정", segments: dailySegments(30, 100) },
  });
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.leave.segments.length, 30);
  assert.equal(updated.data.leave.startDate, day(100));

  // 옛 구간이 남아 있으면 잔여 계산이 두 배로 틀어진다.
  const after = await req("GET", "/leaves/mine", { token });
  assert.equal(after.data.leaves.length, 1);
  assert.equal(after.data.leaves[0].segments.length, 30);
});

test("구간 경계(14 → 15)에서 저장이 끊기지 않는다", async () => {
  for (const count of [14, 15]) {
    const { token } = await signup();
    await createUnit(token, { name: uniq(`경계${count}-`) });
    const res = await req("POST", "/leaves", {
      token,
      body: { title: `구간${count}`, segments: dailySegments(count) },
    });
    assert.equal(
      res.status,
      201,
      `구간 ${count}개: ${JSON.stringify(res.data)}`,
    );
    assert.equal(res.data.leave.segments.length, count);
  }
});

test("초과 알림 대상이 12명을 넘어도 등록이 성공하고 전원이 알림을 받는다", async () => {
  // 알림 행은 컬럼이 9개라 11명까지만 한 문장에 들어갔다. 13명으로 경계를 넘긴다.
  const MEMBERS = 13;
  const admin = await signup();
  const created = await createUnit(admin.token, {
    name: uniq("초과알림-"),
    // 상한을 1명으로 두면 두 번째 사람부터 무조건 초과가 난다.
    maxLeaveCount: 1,
  });
  assert.equal(created.status, 201);

  const tokens = [admin.token];
  for (let i = 1; i < MEMBERS; i += 1) {
    const member = await signup();
    const joined = await req("POST", "/units/join", {
      token: member.token,
      body: { code: created.data.invite.code },
    });
    assert.equal(joined.status, 200, JSON.stringify(joined.data));
    tokens.push(member.token);
  }

  // 전원이 같은 날 휴가를 넣는다. 마지막 사람의 등록에서 알림 대상이 13명이 된다.
  let last;
  for (const token of tokens) {
    last = await req("POST", "/leaves", {
      token,
      body: {
        title: "같은날",
        segments: [
          { category: "annual", startDate: day(200), endDate: day(200) },
        ],
      },
    });
    assert.equal(last.status, 201, JSON.stringify(last.data));
  }
  assert.ok(
    last.data.exceededDates.includes(day(200)),
    `초과일이 비었다: ${JSON.stringify(last.data.exceededDates)}`,
  );

  // 한 명이라도 빠지면 "일부에게만 알림이 간" 상태다 — 그게 이 사고의 모습이었다.
  await sleep(300);
  for (const [i, token] of tokens.entries()) {
    const box = await req("GET", "/notifications", { token });
    assert.equal(box.status, 200);
    assert.ok(
      box.data.notifications.length > 0,
      `${i}번째 부대원에게 알림이 없다`,
    );
  }
});
