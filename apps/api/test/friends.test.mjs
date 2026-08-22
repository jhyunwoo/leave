import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup } from "./helpers.mjs";

async function requestFriend(sender, receiver) {
  return req("POST", "/friends/requests", {
    token: sender.token,
    body: { email: `  ${receiver.email.toUpperCase()}  ` },
  });
}

async function acceptFriend(receiver, sender) {
  return req("POST", `/friends/requests/${sender.data.user.id}/accept`, {
    token: receiver.token,
  });
}

test("친구 요청 수명주기와 목록은 상호 동의를 요구한다", async () => {
  const first = await signup({ name: "첫째" });
  const second = await signup({ name: "둘째" });

  assert.equal((await req("GET", "/friends")).status, 401);
  assert.equal((await requestFriend(first, first)).status, 404);
  assert.equal(
    (await requestFriend(first, { ...second, email: "missing@example.com" }))
      .status,
    404,
  );

  assert.equal((await requestFriend(first, second)).status, 200);
  assert.equal(
    (await requestFriend(first, second)).status,
    200,
    "같은 방향 중복은 멱등",
  );
  const outgoing = await req("GET", "/friends/requests/outgoing", {
    token: first.token,
  });
  const incoming = await req("GET", "/friends/requests/incoming", {
    token: second.token,
  });
  assert.deepEqual(
    outgoing.data.requests.map((row) => row.userId),
    [second.data.user.id],
  );
  assert.deepEqual(
    incoming.data.requests.map((row) => row.userId),
    [first.data.user.id],
  );

  const before = await req(
    "GET",
    `/friends/${second.data.user.id}/schedule?startDate=2026-01-01&endDate=2026-12-31`,
    { token: first.token },
  );
  assert.equal(before.status, 403);
  assert.equal((await acceptFriend(second, first)).status, 200);
  assert.equal(
    (await acceptFriend(second, first)).status,
    200,
    "반복 수락은 멱등",
  );
  const friends = await req("GET", "/friends", { token: first.token });
  assert.deepEqual(
    friends.data.friends.map((row) => row.userId),
    [second.data.user.id],
  );

  assert.equal(
    (
      await req("DELETE", `/friends/${second.data.user.id}`, {
        token: first.token,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("GET", "/friends", { token: second.token })).data.friends.length,
    0,
  );
});

test("역방향 요청은 안전하게 수락되고 거절·취소가 동작한다", async () => {
  const first = await signup();
  const second = await signup();
  assert.equal((await requestFriend(first, second)).status, 200);
  assert.equal((await requestFriend(second, first)).status, 200);
  assert.equal(
    (await req("GET", "/friends", { token: first.token })).data.friends.length,
    1,
  );

  const third = await signup();
  assert.equal((await requestFriend(first, third)).status, 200);
  assert.equal(
    (
      await req("DELETE", `/friends/requests/incoming/${first.data.user.id}`, {
        token: third.token,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("GET", "/friends/requests/outgoing", { token: first.token }))
      .data.requests.length,
    0,
  );

  const fourth = await signup();
  assert.equal((await requestFriend(first, fourth)).status, 200);
  assert.equal(
    (
      await req("DELETE", `/friends/requests/outgoing/${fourth.data.user.id}`, {
        token: first.token,
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("GET", "/friends/requests/incoming", { token: fourth.token }))
      .data.requests.length,
    0,
  );
});

test("친구 달력은 수락·상태·필드 최소화·차단 권한을 서버에서 강제한다", async () => {
  const first = await signup({ name: "나" });
  const second = await signup({ name: "친구" });
  await createUnit(first.token);
  await createUnit(second.token);

  for (const [status, day] of [
    ["shared", "10"],
    ["approved", "11"],
    ["completed", "12"],
    ["draft", "13"],
    ["rejected", "14"],
    ["cancelled", "15"],
  ]) {
    const leave = await req("POST", "/leaves", {
      token: second.token,
      body: {
        title: `비밀 제목 ${status}`,
        reason: `비밀 사유 ${status}`,
        status,
        segments: [
          {
            category: "annual",
            startDate: `2026-09-${day}`,
            endDate: `2026-09-${day}`,
          },
        ],
      },
    });
    assert.equal(leave.status, 201, JSON.stringify(leave.data));
  }
  await req("POST", "/personal-events", {
    token: second.token,
    body: {
      title: "친구의 비밀 일정",
      startDate: "2026-09-10",
      endDate: "2026-09-10",
    },
  });

  const unauthorized = await req(
    "GET",
    `/friends/calendar?friendIds=${second.data.user.id}&month=2026-09`,
    { token: first.token },
  );
  assert.equal(unauthorized.status, 403);
  await requestFriend(first, second);
  await acceptFriend(second, first);

  const calendar = await req(
    "GET",
    `/friends/calendar?friendIds=${second.data.user.id}&month=2026-09`,
    { token: first.token },
  );
  assert.equal(calendar.status, 200, JSON.stringify(calendar.data));
  assert.deepEqual(calendar.data.leaves.map((row) => row.status).sort(), [
    "approved",
    "completed",
    "shared",
  ]);
  assert.ok(
    calendar.data.leaves.every(
      (row) => !("title" in row) && !("reason" in row) && !("note" in row),
    ),
  );
  assert.ok(!JSON.stringify(calendar.data).includes("친구의 비밀 일정"));

  const arbitrary = await signup();
  const rejected = await req(
    "GET",
    `/friends/calendar?friendIds=${second.data.user.id},${arbitrary.data.user.id}&month=2026-09`,
    { token: first.token },
  );
  assert.equal(rejected.status, 403);

  assert.equal(
    (
      await req("POST", "/moderation/blocks", {
        token: first.token,
        body: { userId: second.data.user.id },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("GET", "/friends", { token: first.token })).data.friends.length,
    0,
  );
  assert.equal(
    (
      await req(
        "GET",
        `/friends/calendar?friendIds=${second.data.user.id}&month=2026-09`,
        { token: first.token },
      )
    ).status,
    403,
  );
  assert.equal((await requestFriend(second, first)).status, 404);
  await req("DELETE", `/moderation/blocks/${second.data.user.id}`, {
    token: first.token,
  });
  assert.equal(
    (await req("GET", "/friends", { token: first.token })).data.friends.length,
    0,
    "차단 해제는 친구를 복원하지 않음",
  );
});

test("서로 다른 그룹과 그룹 변경에도 친구가 유지되고 최대 10명을 검증한다", async () => {
  const viewer = await signup();
  await createUnit(viewer.token);
  const accepted = [];
  for (let i = 0; i < 11; i += 1) {
    const friend = await signup({
      name: `친구${i.toString().padStart(2, "0")}`,
    });
    await createUnit(friend.token);
    await requestFriend(friend, viewer);
    await acceptFriend(viewer, friend);
    accepted.push(friend);
  }
  const tenIds = accepted
    .slice(0, 10)
    .map((friend) => friend.data.user.id)
    .join(",");
  assert.equal(
    (
      await req("GET", `/friends/calendar?friendIds=${tenIds}&month=2026-09`, {
        token: viewer.token,
      })
    ).status,
    200,
  );
  const elevenIds = accepted.map((friend) => friend.data.user.id).join(",");
  assert.equal(
    (
      await req(
        "GET",
        `/friends/calendar?friendIds=${elevenIds}&month=2026-09`,
        { token: viewer.token },
      )
    ).status,
    400,
  );

  await req("DELETE", "/units/leave", { token: accepted[0].token });
  assert.equal(
    (await req("GET", "/friends", { token: viewer.token })).data.friends.length,
    11,
  );
});

test("계정 삭제는 친구 관계와 요청을 제거한다", async () => {
  const first = await signup();
  const friend = await signup();
  const pending = await signup();
  await requestFriend(first, friend);
  await acceptFriend(friend, first);
  await requestFriend(pending, first);
  assert.equal(
    (await req("DELETE", "/auth/account", { token: first.token })).status,
    200,
  );
  assert.equal(
    (await req("GET", "/friends", { token: friend.token })).data.friends.length,
    0,
  );
  assert.equal(
    (await req("GET", "/friends/requests/outgoing", { token: pending.token }))
      .data.requests.length,
    0,
  );
});
