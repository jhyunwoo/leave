import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

/**
 * 친구 관련 알림은 부수효과다 — 요청·휴가 등록의 응답에는 나타나지 않고,
 * 받는 사람의 알림함에서만 확인할 수 있다. 그래서 "누구에게 가고 누구에게는
 * 가지 않는가"를 여기서 고정한다. 이 판정이 틀리면 초안(나만 보는 계획)이나
 * 차단한 사람의 일정이 조용히 새어 나간다.
 */

async function notificationsOf(user) {
  const res = await req("GET", "/notifications", { token: user.token });
  assert.equal(res.status, 200);
  return res.data.notifications;
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

/** 친구가 휴가를 등록할 수 있으려면 그 사람이 그룹에 속해 있어야 한다. */
async function withUnit(user) {
  await createUnit(user.token, { name: uniq("친구알림부대-") });
  return user;
}

test("친구 요청을 보내면 받는 사람의 알림함에 한 건이 쌓인다", async () => {
  const sender = await signup({ name: "보낸사람" });
  const receiver = await signup({ name: "받는사람" });

  await req("POST", "/friends/requests", {
    token: sender.token,
    body: { username: receiver.username },
  });
  await sleep(300);

  const received = await notificationsOf(receiver);
  assert.equal(received.length, 1);
  assert.match(received[0].body, /보낸사람/);
  // 보낸 사람에게는 아무것도 가지 않는다.
  assert.equal((await notificationsOf(sender)).length, 0);
});

test("같은 요청을 다시 보내도 알림은 늘어나지 않는다", async () => {
  const sender = await signup({ name: "재전송" });
  const receiver = await signup();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await req("POST", "/friends/requests", {
      token: sender.token,
      body: { username: receiver.username },
    });
  }
  await sleep(300);

  assert.equal((await notificationsOf(receiver)).length, 1);
});

test("알림을 끈 사람에게는 친구 요청 알림이 가지 않는다", async () => {
  const sender = await signup({ name: "보낸사람" });
  const receiver = await signup();
  await req("PATCH", "/notifications/preferences", {
    token: receiver.token,
    body: { friendRequest: false },
  });

  await req("POST", "/friends/requests", {
    token: sender.token,
    body: { username: receiver.username },
  });
  await sleep(300);

  assert.equal((await notificationsOf(receiver)).length, 0);
});

test("휴가를 등록하면 수락된 친구에게만 알림이 간다", async () => {
  const actor = await withUnit(await signup({ name: "휴가등록자" }));
  const friend = await signup({ name: "친구" });
  const stranger = await signup({ name: "남" });
  const pendingOnly = await signup({ name: "대기중" });

  await befriend(actor, friend);
  // 수락하지 않은 요청은 친구가 아니다.
  await req("POST", "/friends/requests", {
    token: actor.token,
    body: { username: pendingOnly.username },
  });

  const before = (await notificationsOf(friend)).length;
  const created = await req("POST", "/leaves", {
    token: actor.token,
    body: {
      title: "연가",
      segments: [
        { category: "annual", startDate: "2026-11-02", endDate: "2026-11-04" },
      ],
    },
  });
  assert.equal(created.status, 201);
  await sleep(400);

  const friendNotifications = await notificationsOf(friend);
  assert.equal(friendNotifications.length, before + 1);
  assert.match(friendNotifications[0].body, /휴가등록자/);
  // 내 휴가 상세 링크는 비워 두고, 친구 일정 조회에 쓸 연결 정보를 따로 담는다.
  assert.equal(friendNotifications[0].leaveId, null);
  assert.deepEqual(friendNotifications[0].friendLeave, {
    userId: actor.data.user.id,
    leaveId: created.data.leave.id,
    startDate: "2026-11-02",
    endDate: "2026-11-04",
  });

  assert.equal((await notificationsOf(stranger)).length, 0);
  // 대기중인 사람에게는 친구 요청 알림 한 건만 있어야 한다.
  const pendingNotifications = await notificationsOf(pendingOnly);
  assert.equal(pendingNotifications.length, 1);
  assert.match(pendingNotifications[0].title, /친구 요청/);
});

test("초안으로 저장한 휴가는 친구에게 알리지 않는다", async () => {
  const actor = await withUnit(await signup({ name: "초안작성자" }));
  const friend = await signup();
  await befriend(actor, friend);

  const before = (await notificationsOf(friend)).length;
  const created = await req("POST", "/leaves", {
    token: actor.token,
    body: {
      title: "초안",
      status: "draft",
      segments: [
        { category: "annual", startDate: "2026-11-20", endDate: "2026-11-21" },
      ],
    },
  });
  assert.equal(created.status, 201);
  await sleep(400);

  assert.equal((await notificationsOf(friend)).length, before);
});

test("친구 휴가 알림을 끈 사람에게는 가지 않는다", async () => {
  const actor = await withUnit(await signup({ name: "등록자" }));
  const friend = await signup();
  await befriend(actor, friend);
  await req("PATCH", "/notifications/preferences", {
    token: friend.token,
    body: { friendLeave: false },
  });

  const before = (await notificationsOf(friend)).length;
  await req("POST", "/leaves", {
    token: actor.token,
    body: {
      title: "연가",
      segments: [
        { category: "annual", startDate: "2026-12-01", endDate: "2026-12-02" },
      ],
    },
  });
  await sleep(400);

  assert.equal((await notificationsOf(friend)).length, before);
});
