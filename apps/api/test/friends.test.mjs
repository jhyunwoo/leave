import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUnit,
  isoDaysFromToday,
  openTestDb,
  req,
  signup,
} from "./helpers.mjs";

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
  const summary = friends.data.friends[0];
  assert.equal(summary.enlistedAt, second.data.user.enlistedAt);
  assert.equal(summary.dischargeAt, second.data.user.dischargeAt);
  const duty = await req("GET", "/auth/me/duty-days", { token: second.token });
  assert.equal(summary.dutyDays, duty.data.dutyDays);
  assert.equal(friends.headers["cache-control"], "no-store");
  assert.equal("enlistedAt" in incoming.data.requests[0], false);

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

  // 이 테스트가 보는 것은 "어떤 상태가 친구에게 새는가"이지 날짜가 아니다.
  // 지난 달로 잡으면 복귀일이 지난 계획이 전부 복귀 완료로 굳어(그리고 붙어 있으면
  // 한 건으로 병합돼) 상태별 구분 자체가 사라진다. 40일 뒤가 속한 달의 10~15일은
  // 오늘이 그 달의 며칠이든 언제나 미래다.
  const month = isoDaysFromToday(40).slice(0, 7);

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
            startDate: `${month}-${day}`,
            endDate: `${month}-${day}`,
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
      startDate: `${month}-10`,
      endDate: `${month}-10`,
    },
  });

  const unauthorized = await req(
    "GET",
    `/friends/calendar?friendIds=${second.data.user.id}&month=${month}`,
    { token: first.token },
  );
  assert.equal(unauthorized.status, 403);
  await requestFriend(first, second);
  await acceptFriend(second, first);

  const calendar = await req(
    "GET",
    `/friends/calendar?friendIds=${second.data.user.id}&month=${month}`,
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
    `/friends/calendar?friendIds=${second.data.user.id},${arbitrary.data.user.id}&month=${month}`,
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
        `/friends/calendar?friendIds=${second.data.user.id}&month=${month}`,
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
  // 공유 설정 행이 있어도 탈퇴가 막히지 않고, 행도 함께 사라져야 한다.
  assert.equal(
    (
      await req("PATCH", "/friends/sharing", {
        token: first.token,
        body: { leaveSchedule: false },
      })
    ).status,
    200,
  );
  assert.equal(
    (await req("DELETE", "/auth/account", { token: first.token })).status,
    200,
  );
  const db = openTestDb();
  try {
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS count FROM user_friend_sharing WHERE user_id = ?",
        )
        .get(first.data.user.id).count,
      0,
    );
  } finally {
    db.close();
  }
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

/**
 * 다른 모든 범위 조회에는 상한이 있다(달력 9개월, 휴가 366일). 여기만 비어 있어서
 * `0001-01-01~9999-12-31`이 그대로 통과했다 — `MAX_DATE_RANGE_DAYS`가 존재하는 이유가
 * 바로 그런 요청 하나로 워커 메모리를 넘기는 일이었다.
 */
test("친구 일정 조회에도 날짜 범위 상한이 있다", async () => {
  const viewer = await signup({ name: "보는쪽" });
  const friend = await signup({ name: "친구쪽" });
  assert.equal((await requestFriend(viewer, friend)).status, 200);
  assert.equal((await acceptFriend(friend, viewer)).status, 200);

  const range = (startDate, endDate) =>
    req(
      "GET",
      `/friends/${friend.data.user.id}/schedule?startDate=${startDate}&endDate=${endDate}`,
      { token: viewer.token },
    );

  // 366일(윤년 포함 1년)은 통과한다.
  assert.equal((await range("2026-01-01", "2026-12-31")).status, 200);
  assert.equal((await range("2028-01-01", "2028-12-31")).status, 200);
  // 367일부터 막는다 (2026은 평년이라 2026-01-01~2027-01-01이 정확히 366일이다).
  assert.equal((await range("2026-01-01", "2027-01-01")).status, 200);
  const tooLong = await range("2026-01-01", "2027-01-02");
  assert.equal(tooLong.status, 400);
  assert.match(tooLong.data.error, /366/);
  // 전체 달력을 훑는 요청도 막힌다.
  assert.equal((await range("0001-01-01", "9999-12-31")).status, 400);
});

test("친구 달력은 휴가와 외출을 갈라 알려주되 세부 종류는 감춘다", async () => {
  const viewer = await signup({ name: "보는이" });
  const friend = await signup({ name: "나가는이" });
  await createUnit(viewer.token);
  await createUnit(friend.token);
  await requestFriend(viewer, friend);
  await acceptFriend(friend, viewer);

  for (const segment of [
    { category: "outing", startDate: "2026-10-05", endDate: "2026-10-05" },
    { category: "annual", startDate: "2026-10-12", endDate: "2026-10-14" },
  ]) {
    const created = await req("POST", "/leaves", {
      token: friend.token,
      body: {
        title: `비밀 제목 ${segment.category}`,
        status: "shared",
        segments: [segment],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
  }

  const calendar = await req(
    "GET",
    `/friends/calendar?friendIds=${friend.data.user.id}&month=2026-10`,
    { token: viewer.token },
  );
  assert.equal(calendar.status, 200, JSON.stringify(calendar.data));
  assert.deepEqual(
    calendar.data.leaves.map((row) => `${row.startDate}:${row.kind}`).sort(),
    ["2026-10-05:outing", "2026-10-12:leave"],
  );
  // 갈래는 알려주지만 그 갈래를 만든 구간·재원은 그대로 감춘다 — 연가인지 병가인지는
  // 친구가 알 일이 아니다.
  const body = JSON.stringify(calendar.data);
  assert.ok(!body.includes("segments") && !body.includes("category"));
  assert.ok(!body.includes("annual") && !body.includes("비밀 제목"));

  const schedule = await scheduleOf(viewer, friend);
  assert.equal(schedule.status, 200);
  assert.deepEqual(
    schedule.data.leaves.map((row) => row.kind),
    ["outing", "leave"],
    "같은 스키마를 쓰는 일정 조회도 갈래를 싣는다",
  );
});

test("친구별 일과일은 소속 휴일을 분리하고 전역자는 0으로 반환한다", async () => {
  const viewer = await signup();
  const profile = {
    enlistedAt: isoDaysFromToday(-400),
    dischargeAt: isoDaysFromToday(60),
  };
  const holidayFriend = await signup({ ...profile, name: "휴무 친구" });
  const workingFriend = await signup({ ...profile, name: "일과 친구" });
  const dischargedFriend = await signup({
    enlistedAt: isoDaysFromToday(-600),
    dischargeAt: isoDaysFromToday(-1),
  });
  const unit = await createUnit(holidayFriend.token);
  const holiday = await req("POST", `/units/${unit.data.unit.id}/events`, {
    token: holidayFriend.token,
    body: {
      title: "비공개 부대 휴일",
      isHoliday: true,
      startDate: isoDaysFromToday(0),
      endDate: isoDaysFromToday(59),
    },
  });
  assert.equal(holiday.status, 201);
  for (const friend of [holidayFriend, workingFriend, dischargedFriend]) {
    assert.equal((await requestFriend(viewer, friend)).status, 200);
    assert.equal((await acceptFriend(friend, viewer)).status, 200);
  }
  const response = await req("GET", "/friends", { token: viewer.token });
  assert.equal(response.status, 200);
  const summaries = new Map(
    response.data.friends.map((friend) => [friend.userId, friend]),
  );
  assert.equal(summaries.get(holidayFriend.data.user.id).dutyDays, 0);
  assert.ok(summaries.get(workingFriend.data.user.id).dutyDays > 0);
  assert.equal(summaries.get(dischargedFriend.data.user.id).dutyDays, 0);
  for (const friend of [holidayFriend, workingFriend, dischargedFriend]) {
    const own = await req("GET", "/auth/me/duty-days", { token: friend.token });
    assert.equal(
      summaries.get(friend.data.user.id).dutyDays,
      own.data.dutyDays,
    );
  }
  assert.equal(
    JSON.stringify(response.data).includes("비공개 부대 휴일"),
    false,
  );
  assert.equal("unitId" in response.data.friends[0], false);
});

test("친구 목록은 외출·초안을 뺀 다음 휴가를 싣고, 휴가 일정을 끈 친구는 비운다", async () => {
  const viewer = await signup({ name: "보는이" });
  const planner = await signup({ name: "계획한이" });
  const away = await signup({ name: "나가있는이" });
  const hider = await signup({ name: "숨기는이" });
  const idle = await signup({ name: "없는이" });
  for (const user of [viewer, planner, away, hider, idle]) {
    await createUnit(user.token);
  }
  for (const friend of [planner, away, hider, idle]) {
    assert.equal((await requestFriend(viewer, friend)).status, 200);
    assert.equal((await acceptFriend(friend, viewer)).status, 200);
  }
  const createLeave = async (user, status, category, from, to) => {
    const created = await req("POST", "/leaves", {
      token: user.token,
      body: {
        title: "휴가",
        status,
        segments: [
          {
            category,
            startDate: isoDaysFromToday(from),
            endDate: isoDaysFromToday(to),
          },
        ],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
  };
  // 내일 외출과 사흘 뒤 초안은 "다음 휴가"가 아니다.
  await createLeave(planner, "shared", "outing", 1, 1);
  await createLeave(planner, "draft", "annual", 3, 4);
  await createLeave(planner, "shared", "annual", 20, 22);
  await createLeave(planner, "approved", "annual", 10, 12);
  // 이미 나가 있으면 그 휴가다.
  await createLeave(away, "approved", "annual", 0, 2);
  await createLeave(away, "shared", "annual", 30, 31);
  await createLeave(hider, "shared", "annual", 5, 6);
  await req("PATCH", "/friends/sharing", {
    token: hider.token,
    body: { leaveSchedule: false },
  });

  const response = await req("GET", "/friends", { token: viewer.token });
  assert.equal(response.status, 200, JSON.stringify(response.data));
  const nextLeaves = Object.fromEntries(
    response.data.friends.map((row) => [row.userId, row.nextLeave]),
  );
  assert.deepEqual(nextLeaves, {
    [planner.data.user.id]: {
      startDate: isoDaysFromToday(10),
      endDate: isoDaysFromToday(12),
    },
    [away.data.user.id]: {
      startDate: isoDaysFromToday(0),
      endDate: isoDaysFromToday(2),
    },
    [hider.data.user.id]: null,
    [idle.data.user.id]: null,
  });
});

/**
 * 공유 설정 — 친구에게 무엇을 보여줄지는 본인이 고른다.
 *
 * 화면이 가리는 것이 아니라 서버가 응답에서 빼는지 확인한다. 행이 없는 사용자
 * (설정을 한 번도 건드리지 않은 대다수)는 지금까지처럼 전부 공유한다.
 */
test("공유 설정은 기본값이 전부 공유이고 보낸 항목만 바꾼다", async () => {
  const user = await signup();
  assert.equal((await req("GET", "/friends/sharing")).status, 401);

  const initial = await req("GET", "/friends/sharing", { token: user.token });
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.data.sharing, {
    serviceProgress: true,
    dutyDays: true,
    leaveSchedule: true,
  });

  const first = await req("PATCH", "/friends/sharing", {
    token: user.token,
    body: { dutyDays: false },
  });
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.sharing, {
    serviceProgress: true,
    dutyDays: false,
    leaveSchedule: true,
  });
  // 다른 항목만 보내도 앞서 끈 값은 그대로다. 본문 전체로 덮어쓰면 여기서
  // 끈 적 없는 기본값으로 되살아난다.
  const second = await req("PATCH", "/friends/sharing", {
    token: user.token,
    body: { leaveSchedule: false },
  });
  assert.deepEqual(second.data.sharing, {
    serviceProgress: true,
    dutyDays: false,
    leaveSchedule: false,
  });
  assert.deepEqual(
    (await req("GET", "/friends/sharing", { token: user.token })).data.sharing,
    { serviceProgress: true, dutyDays: false, leaveSchedule: false },
  );

  assert.equal(
    (
      await req("PATCH", "/friends/sharing", {
        token: user.token,
        body: { dutyDays: "no" },
      })
    ).status,
    400,
  );
});

test("복무율·남은 일과일을 끄면 친구 목록이 그 값을 보내지 않는다", async () => {
  const viewer = await signup({ name: "보는이" });
  const friend = await signup({
    name: "숨기는이",
    enlistedAt: "2026-02-09",
    dischargeAt: "2027-08-08",
  });
  await requestFriend(viewer, friend);
  await acceptFriend(friend, viewer);
  const listOf = () => req("GET", "/friends", { token: viewer.token });

  const shared = (await listOf()).data.friends[0];
  assert.equal(shared.enlistedAt, "2026-02-09");
  assert.equal(shared.dischargeAt, "2027-08-08");
  assert.equal(typeof shared.dutyDays, "number");

  await req("PATCH", "/friends/sharing", {
    token: friend.token,
    body: { serviceProgress: false },
  });
  const withoutProgress = await listOf();
  const [progressHidden] = withoutProgress.data.friends;
  assert.equal(progressHidden.enlistedAt, null);
  assert.equal(progressHidden.dischargeAt, null);
  assert.equal(typeof progressHidden.dutyDays, "number", "끈 항목만 빠진다");
  const body = JSON.stringify(withoutProgress.data);
  assert.ok(
    !body.includes("2026-02-09") && !body.includes("2027-08-08"),
    "입대일·전역일이 본문 어디에도 남으면 안 된다",
  );

  await req("PATCH", "/friends/sharing", {
    token: friend.token,
    body: { dutyDays: false },
  });
  const bothHidden = (await listOf()).data.friends[0];
  assert.equal(bothHidden.dutyDays, null);
  assert.equal(bothHidden.enlistedAt, null);

  await req("PATCH", "/friends/sharing", {
    token: friend.token,
    body: { serviceProgress: true, dutyDays: true },
  });
  const restored = (await listOf()).data.friends[0];
  assert.equal(restored.enlistedAt, "2026-02-09");
  assert.equal(restored.dischargeAt, "2027-08-08");
  assert.equal(typeof restored.dutyDays, "number");
});

test("휴가 일정을 끄면 달력·일정 조회가 그 사람의 휴가를 싣지 않는다", async () => {
  const viewer = await signup({ name: "보는이" });
  const hider = await signup({ name: "숨기는이" });
  const sharer = await signup({ name: "보여주는이" });
  for (const user of [viewer, hider, sharer]) await createUnit(user.token);
  for (const friend of [hider, sharer]) {
    await requestFriend(viewer, friend);
    await acceptFriend(friend, viewer);
  }
  // 40일 뒤가 속한 달의 10~12일은 오늘이 그 달의 며칠이든 언제나 미래다.
  const month = isoDaysFromToday(40).slice(0, 7);
  for (const [user, day] of [
    [viewer, "10"],
    [hider, "11"],
    [sharer, "12"],
  ]) {
    const created = await req("POST", "/leaves", {
      token: user.token,
      body: {
        title: "연가",
        status: "shared",
        segments: [
          {
            category: "annual",
            startDate: `${month}-${day}`,
            endDate: `${month}-${day}`,
          },
        ],
      },
    });
    assert.equal(created.status, 201, JSON.stringify(created.data));
  }
  // 조회자도 자기 일정을 끈다 — 남에게 숨기는 설정이 내 달력에서 나를 지우면 안 된다.
  for (const user of [hider, viewer]) {
    await req("PATCH", "/friends/sharing", {
      token: user.token,
      body: { leaveSchedule: false },
    });
  }

  const friendIds = `${hider.data.user.id},${sharer.data.user.id}`;
  const expectedOwners = [viewer.data.user.id, sharer.data.user.id].sort();
  const calendar = await req(
    "GET",
    `/friends/calendar?friendIds=${friendIds}&month=${month}`,
    { token: viewer.token },
  );
  assert.equal(calendar.status, 200, JSON.stringify(calendar.data));
  assert.deepEqual(
    calendar.data.leaves.map((row) => row.userId).sort(),
    expectedOwners,
  );
  const sharedFlags = new Map(
    calendar.data.people.map((person) => [
      person.userId,
      person.leaveScheduleShared,
    ]),
  );
  assert.equal(sharedFlags.get(hider.data.user.id), false);
  assert.equal(sharedFlags.get(sharer.data.user.id), true);
  assert.equal(sharedFlags.get(viewer.data.user.id), true);

  const calendars = await req(
    "GET",
    `/friends/calendars?friendIds=${friendIds}&months=${month}`,
    { token: viewer.token },
  );
  assert.equal(calendars.status, 200, JSON.stringify(calendars.data));
  assert.deepEqual(
    calendars.data.calendars[0].leaves.map((row) => row.userId).sort(),
    expectedOwners,
  );

  const scheduleOfHider = () =>
    req(
      "GET",
      `/friends/${hider.data.user.id}/schedule?startDate=${month}-01&endDate=${month}-28`,
      { token: viewer.token },
    );
  const hidden = await scheduleOfHider();
  assert.equal(hidden.status, 200, JSON.stringify(hidden.data));
  assert.deepEqual(hidden.data.leaves, []);
  assert.equal(hidden.data.people[0].leaveScheduleShared, false);

  const friends = await req("GET", "/friends", { token: viewer.token });
  assert.deepEqual(
    Object.fromEntries(
      friends.data.friends.map((row) => [row.userId, row.leaveScheduleShared]),
    ),
    { [hider.data.user.id]: false, [sharer.data.user.id]: true },
  );

  await req("PATCH", "/friends/sharing", {
    token: hider.token,
    body: { leaveSchedule: true },
  });
  const visible = await scheduleOfHider();
  assert.equal(visible.data.leaves.length, 1);
  assert.equal(visible.data.people[0].leaveScheduleShared, true);

  // 공유를 켜 둔 것은 친구에게 보여주겠다는 뜻이지 아무에게나 열겠다는 뜻이 아니다.
  const stranger = await signup();
  assert.equal(
    (
      await req(
        "GET",
        `/friends/${hider.data.user.id}/schedule?startDate=${month}-01&endDate=${month}-28`,
        { token: stranger.token },
      )
    ).status,
    403,
  );
});
