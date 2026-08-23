import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup } from "./helpers.mjs";

/** 공개 사용자 이름으로 친구를 요청한다. 대소문자·공백·@는 서버가 정규화한다. */
async function requestFriend(sender, receiver) {
  return req("POST", "/friends/requests", {
    token: sender.token,
    body: { username: `  ${receiver.username.toUpperCase()}  ` },
  });
}

async function acceptFriend(receiver, sender) {
  return req("POST", `/friends/requests/${sender.data.user.id}/accept`, {
    token: receiver.token,
  });
}

function scheduleOf(viewer, target) {
  return req(
    "GET",
    `/friends/${target.data.user.id}/schedule?startDate=2026-01-01&endDate=2026-12-31`,
    { token: viewer.token },
  );
}

test("친구 요청 수명주기와 목록은 상호 동의를 요구한다", async () => {
  const first = await signup({ name: "첫째" });
  const second = await signup({ name: "둘째" });

  assert.equal((await req("GET", "/friends")).status, 401);
  assert.equal((await requestFriend(first, first)).status, 400, "자기 자신");
  assert.equal(
    (await requestFriend(first, { ...second, username: "nobody.here.42" }))
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
  assert.equal(
    incoming.data.requests[0].username,
    first.username,
    "요청 목록에 @아이디가 함께 온다",
  );

  assert.equal((await scheduleOf(first, second)).status, 403);
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
  assert.equal(friends.data.friends[0].username, second.username);

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

/**
 * 회귀 테스트 — 예전에는 반대 방향 요청이 자동으로 수락으로 수렴했다.
 * 그러면 받는 사람이 수락을 누른 적 없이 자기 일정이 공개된다.
 */
test("반대 방향 요청은 자동 수락되지 않고 명시적 수락만 친구로 만든다", async () => {
  const alice = await signup({ name: "앨리스" });
  const bob = await signup({ name: "밥" });

  assert.equal((await requestFriend(alice, bob)).status, 200);

  const crossed = await requestFriend(bob, alice);
  assert.equal(crossed.status, 409, JSON.stringify(crossed.data));
  assert.equal(crossed.data.code, "incoming_request_exists");

  // 아직 친구가 아니다 — 양쪽 모두.
  for (const [viewer, target] of [
    [alice, bob],
    [bob, alice],
  ]) {
    assert.equal(
      (await req("GET", "/friends", { token: viewer.token })).data.friends
        .length,
      0,
    );
    assert.equal((await scheduleOf(viewer, target)).status, 403);
  }
  // 대기 중인 요청은 처음 것 하나뿐이고 방향도 그대로다.
  assert.deepEqual(
    (await req("GET", "/friends/requests/incoming", { token: bob.token })).data
      .requests.length,
    1,
  );
  assert.deepEqual(
    (await req("GET", "/friends/requests/incoming", { token: alice.token }))
      .data.requests.length,
    0,
  );

  // 요청자는 자기 요청을 수락할 수 없다.
  assert.equal((await acceptFriend(alice, bob)).status, 404);
  assert.equal(
    (await req("GET", "/friends", { token: alice.token })).data.friends.length,
    0,
  );

  // 받은 사람이 명시적으로 수락해야 친구가 된다.
  assert.equal((await acceptFriend(bob, alice)).status, 200);
  assert.equal(
    (await req("GET", "/friends", { token: alice.token })).data.friends.length,
    1,
  );
  assert.equal((await scheduleOf(alice, bob)).status, 200);
  assert.equal((await scheduleOf(bob, alice)).status, 200);

  // 이미 친구인 상대에게 다시 요청하면 409.
  const again = await requestFriend(alice, bob);
  assert.equal(again.status, 409);
  assert.equal(again.data.code, "already_friends");
});

test("거절·취소는 관계를 없애고 다시 요청할 수 있다", async () => {
  const first = await signup();
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
  assert.equal(
    (await requestFriend(first, third)).status,
    200,
    "거절 뒤 다시 요청할 수 있다",
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
  // 취소된 요청을 수락하면 "없는 요청"이다 — 성공으로 답하면 화면과 DB가 갈린다.
  assert.equal((await acceptFriend(fourth, first)).status, 404);
});

/**
 * 권한 회귀 테스트 — 친구를 끊은 다음 요청은 그 자리에서 막혀야 한다.
 * UI 상태가 아니라 API가 지키는 경계인지 확인한다.
 */
test("친구 삭제는 양쪽의 일정 조회 권한을 즉시 끊는다", async () => {
  const viewer = await signup({ name: "보는이" });
  const friend = await signup({ name: "친구" });
  await createUnit(friend.token);
  assert.equal(
    (
      await req("POST", "/leaves", {
        token: friend.token,
        body: {
          title: "비밀 제목",
          reason: "비밀 사유",
          status: "shared",
          segments: [
            {
              category: "annual",
              startDate: "2026-05-04",
              endDate: "2026-05-06",
            },
          ],
        },
      })
    ).status,
    201,
  );
  await requestFriend(viewer, friend);
  await acceptFriend(friend, viewer);

  const before = await scheduleOf(viewer, friend);
  assert.equal(before.status, 200);
  assert.equal(before.data.leaves.length, 1);
  assert.equal(
    before.headers["cache-control"],
    "no-store",
    "친구 일정은 캐시에 남기지 않는다",
  );

  // 상대(friend)가 끊는다 — 지운 쪽이 아니라 남은 쪽도 즉시 막혀야 한다.
  assert.equal(
    (
      await req("DELETE", `/friends/${viewer.data.user.id}`, {
        token: friend.token,
      })
    ).status,
    200,
  );

  const after = await scheduleOf(viewer, friend);
  assert.equal(after.status, 403, JSON.stringify(after.data));
  assert.equal(after.data.code, "not_friends");
  assert.ok(!("leaves" in after.data), "본문에 일정이 실리면 안 된다");
  assert.equal(
    (await scheduleOf(friend, viewer)).status,
    403,
    "끊은 쪽도 볼 수 없다",
  );
  assert.equal(
    (
      await req(
        "GET",
        `/friends/calendar?friendIds=${friend.data.user.id}&month=2026-05`,
        { token: viewer.token },
      )
    ).status,
    403,
  );
  for (const [viewerSide, target] of [
    [viewer, friend],
    [friend, viewer],
  ]) {
    assert.equal(
      (await req("GET", "/friends", { token: viewerSide.token })).data.friends
        .length,
      0,
      "양쪽 목록에서 사라진다",
    );
    assert.ok(target.data.user.id);
  }

  // 다시 요청할 수 있고, 예전 수락 상태가 되살아나지 않는다.
  assert.equal((await requestFriend(viewer, friend)).status, 200);
  assert.equal((await scheduleOf(viewer, friend)).status, 403);
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
  const body = JSON.stringify(calendar.data);
  assert.ok(!body.includes(second.email), "이메일이 새면 안 된다");
  assert.ok(!body.includes("enlistedAt") && !body.includes("rankLabel"));

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
  assert.equal(
    (await requestFriend(second, first)).status,
    404,
    "차단은 친구 요청도 막는다",
  );
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

test("계정 삭제는 친구 관계와 요청을 제거하고 이름을 놓아준다", async () => {
  const first = await signup({ username: "leaving.soon" });
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
  // 이름은 계정과 함께 사라진다 — 남겨 두면 아무도 못 쓰는 이름만 늘어난다.
  const reclaimed = await signup({ username: "leaving.soon" });
  assert.equal(reclaimed.username, "leaving.soon");
});
