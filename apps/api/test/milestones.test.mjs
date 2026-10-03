import assert from "node:assert/strict";
import { test } from "node:test";
import { isoDaysFromToday, req, runScheduled, signup } from "./helpers.mjs";

/**
 * 복무 기념일 알림(전역 D-n·진급)은 cron의 부수효과다. 받는 사람의 알림함에서만
 * 확인할 수 있으므로 "누구에게 가고 누구에게는 가지 않는가"를 여기서 고정한다.
 *
 * 입대일을 20일 전으로 잡는 이유: 기본 입대일(2026-01-05)이면 테스트를 돌리는 날이
 * 하필 진급일(매월 1일)일 때 진급 알림이 한 건 더 끼어 개수가 틀어진다.
 */

const RECENT_ENLISTMENT = () => isoDaysFromToday(-20);

async function notificationsOf(user) {
  const res = await req("GET", "/notifications", { token: user.token });
  assert.equal(res.status, 200);
  return res.data.notifications;
}

function milestonesOf(list) {
  return list.filter((n) => n.milestone !== null);
}

async function befriend(first, second) {
  const requested = await req("POST", "/friends/requests", {
    token: first.token,
    body: { username: second.username },
  });
  assert.equal(requested.status, 200);
  const accepted = await req(
    "POST",
    `/friends/requests/${first.data.user.id}/accept`,
    { token: second.token },
  );
  assert.equal(accepted.status, 200);
}

/** 오늘(KST)이 전역 D-`days`인 사람. */
function signupCountdown(days, overrides = {}) {
  return signup({
    enlistedAt: RECENT_ENLISTMENT(),
    dischargeAt: isoDaysFromToday(days),
    ...overrides,
  });
}

/** 다음 달 1일(KST)과 그날 09:00 KST의 epoch ms. */
function nextFirstOfMonth() {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const first = new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth() + 1, 1),
  );
  return { date: first.toISOString().slice(0, 10), time: first.getTime() };
}

function shiftMonths(isoDate, months) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function shiftDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

test("전역 D-100이면 본인과 친구에게 알리고, 다시 돌려도 한 번만 간다", async () => {
  const subject = await signupCountdown(100, { name: "백일남음" });
  const friend = await signup({ name: "친구" });
  await befriend(subject, friend);
  const friendBefore = (await notificationsOf(friend)).length;

  await runScheduled();
  await runScheduled();

  const mine = milestonesOf(await notificationsOf(subject));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].title, "전역 D-100");
  assert.deepEqual(mine[0].milestone, {
    kind: "discharge_countdown",
    days: 100,
    userId: null,
  });

  const theirs = await notificationsOf(friend);
  assert.equal(theirs.length, friendBefore + 1);
  assert.equal(theirs[0].title, "친구의 전역 D-100");
  assert.match(theirs[0].body, /백일남음님이 전역까지 100일/);
  // 친구의 기념일은 그 친구로 잇는다.
  assert.deepEqual(theirs[0].milestone, {
    kind: "discharge_countdown",
    days: 100,
    userId: subject.data.user.id,
  });
});

test("하루 전에도 알리고, 목록에 없는 D-n은 알리지 않는다", async () => {
  const tomorrow = await signupCountdown(1);
  const ninetyNine = await signupCountdown(99);

  await runScheduled();

  const [first] = milestonesOf(await notificationsOf(tomorrow));
  assert.equal(first?.title, "전역 하루 전이에요");
  assert.equal(first?.milestone.days, 1);
  assert.equal(milestonesOf(await notificationsOf(ninetyNine)).length, 0);
});

test("수신 설정을 끈 사람에게는 가지 않는다(본인·친구 따로)", async () => {
  const subject = await signupCountdown(50);
  const muted = await signup();
  const listening = await signup();
  await befriend(subject, muted);
  await befriend(subject, listening);

  await req("PATCH", "/notifications/preferences", {
    token: subject.token,
    body: { dischargeCountdown: false },
  });
  await req("PATCH", "/notifications/preferences", {
    token: muted.token,
    body: { friendDischargeCountdown: false },
  });

  await runScheduled();

  assert.equal(milestonesOf(await notificationsOf(subject)).length, 0);
  assert.equal(milestonesOf(await notificationsOf(muted)).length, 0);
  // 본인이 자기 알림을 꺼도 친구에게는 간다 — 둘은 다른 사람의 설정이다.
  assert.equal(milestonesOf(await notificationsOf(listening)).length, 1);
});

test("복무율을 공유하지 않으면 친구에게 알리지 않는다", async () => {
  const subject = await signupCountdown(10);
  const friend = await signup();
  await befriend(subject, friend);
  const sharing = await req("PATCH", "/friends/sharing", {
    token: subject.token,
    body: { serviceProgress: false },
  });
  assert.equal(sharing.status, 200);

  await runScheduled();

  // 본인 축하는 그대로 간다.
  assert.equal(milestonesOf(await notificationsOf(subject)).length, 1);
  assert.equal(milestonesOf(await notificationsOf(friend)).length, 0);
});

test("수락하지 않은 요청과 차단한 사이에는 알리지 않는다", async () => {
  const subject = await signupCountdown(200);
  const pending = await signup();
  const blocker = await signup();
  await req("POST", "/friends/requests", {
    token: subject.token,
    body: { username: pending.username },
  });
  await befriend(subject, blocker);
  const blocked = await req("POST", "/moderation/blocks", {
    token: blocker.token,
    body: { userId: subject.data.user.id },
  });
  assert.equal(blocked.status, 200);

  await runScheduled();

  assert.equal(milestonesOf(await notificationsOf(pending)).length, 0);
  assert.equal(milestonesOf(await notificationsOf(blocker)).length, 0);
});

test("진급일(매월 1일)에 새 계급을 알린다", async () => {
  const { date, time } = nextFirstOfMonth();
  // 입대 두 달 뒤가 마침 1일이면 그날이 일병 진급일이다.
  const subject = await signup({
    name: "새일병",
    enlistedAt: shiftMonths(date, -2),
    dischargeAt: shiftDays(date, 401),
  });
  // 가입 때 이미 상병이라고 적은 사람은 표준 진급일에 축하하지 않는다.
  const early = await signup({
    enlistedAt: shiftMonths(date, -2),
    dischargeAt: shiftDays(date, 401),
    rank: "corporal",
  });
  const friend = await signup();
  await befriend(subject, friend);

  await runScheduled(time);

  const [mine] = milestonesOf(await notificationsOf(subject));
  assert.equal(mine?.title, "일병 진급을 축하해요");
  assert.deepEqual(mine?.milestone, {
    kind: "promotion",
    rank: "private_first",
    userId: null,
  });
  const [theirs] = milestonesOf(await notificationsOf(friend));
  assert.equal(theirs?.title, "친구의 일병 진급");
  assert.equal(theirs?.milestone.userId, subject.data.user.id);
  assert.equal(milestonesOf(await notificationsOf(early)).length, 0);
});

test("수신 설정 네 종류는 기본이 켜짐이고 따로 바꿀 수 있다", async () => {
  const user = await signup();
  const initial = await req("GET", "/notifications/preferences", {
    token: user.token,
  });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.preferences.dischargeCountdown, true);
  assert.equal(initial.data.preferences.promotion, true);
  assert.equal(initial.data.preferences.friendDischargeCountdown, true);
  assert.equal(initial.data.preferences.friendPromotion, true);

  const updated = await req("PATCH", "/notifications/preferences", {
    token: user.token,
    body: { promotion: false, friendPromotion: false },
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(
    {
      dischargeCountdown: updated.data.preferences.dischargeCountdown,
      promotion: updated.data.preferences.promotion,
      friendDischargeCountdown:
        updated.data.preferences.friendDischargeCountdown,
      friendPromotion: updated.data.preferences.friendPromotion,
      friendLeave: updated.data.preferences.friendLeave,
    },
    {
      dischargeCountdown: true,
      promotion: false,
      friendDischargeCountdown: true,
      friendPromotion: false,
      friendLeave: true,
    },
  );
});
