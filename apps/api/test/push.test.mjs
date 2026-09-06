import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNotificationPushMessage,
  sendExpoPush,
  sendExpoPushMessages,
} from "../src/lib/push.ts";
import { req, signup, sleep } from "./helpers.mjs";

for (const notification of [
  {
    id: "friend-leave",
    title: "친구의 새 휴가",
    body: "민수님이 11.2 ~ 11.4 휴가를 등록했어요.",
  },
  {
    id: "friend-request",
    title: "새 친구 요청",
    body: "지민님이 친구 요청을 보냈어요. 친구 탭에서 확인해주세요.",
  },
  {
    id: "overage",
    title: "최대 출타 인원 초과 알림",
    body: "우리 그룹에서 11월 2일 외 2일에 최대 출타 인원을 초과했습니다. 휴가 일정을 확인해주세요.",
  },
  {
    id: "admin",
    title: "서비스 점검 안내",
    body: "9월 7일 02:00~03:00에는 서비스 이용이 어려워요.",
  },
]) {
  test(`푸시에 알림별 제목과 상세 본문을 전달한다: ${notification.id}`, async () => {
    const originalFetch = globalThis.fetch;
    let sent;
    globalThis.fetch = async (_url, init) => {
      sent = JSON.parse(String(init.body));
      return Response.json({ data: [{ status: "ok", id: "ticket-id" }] });
    };
    try {
      await sendExpoPush(
        ["ExponentPushToken[test-token]"],
        buildNotificationPushMessage({
          ...notification,
          userId: "recipient",
          leaveId: "private-leave",
          datesJson: '["2026-11-02"]',
        }),
      );
      assert.equal(sent.length, 1);
      assert.equal(sent[0].title, notification.title);
      assert.equal(sent[0].body, notification.body);
      assert.deepEqual(sent[0].data, { notificationId: notification.id });
      assert.deepEqual(Object.keys(sent[0]).sort(), [
        "body",
        "data",
        "sound",
        "title",
        "to",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

test("서로 다른 알림 내용과 수신자별 notificationId를 한 요청으로 배치한다", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  let sent;
  globalThis.fetch = async (_url, init) => {
    calls += 1;
    sent = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        data: [
          { status: "ok", id: "ticket-1" },
          { status: "ok", id: "ticket-2" },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const firstId = crypto.randomUUID();
    const secondId = crypto.randomUUID();
    await sendExpoPushMessages([
      {
        token: "ExponentPushToken[first]",
        message: buildNotificationPushMessage({
          id: firstId,
          title: "새 친구 요청",
          body: "민수님의 친구 요청",
        }),
      },
      {
        token: "ExponentPushToken[second]",
        message: buildNotificationPushMessage({
          id: secondId,
          title: "친구의 새 휴가",
          body: "지민님의 11월 2일 휴가",
        }),
      },
    ]);
    assert.equal(calls, 1);
    assert.deepEqual(
      sent.map(({ to, title, body }) => ({ to, title, body })),
      [
        {
          to: "ExponentPushToken[first]",
          title: "새 친구 요청",
          body: "민수님의 친구 요청",
        },
        {
          to: "ExponentPushToken[second]",
          title: "친구의 새 휴가",
          body: "지민님의 11월 2일 휴가",
        },
      ],
    );
    assert.deepEqual(
      sent.map((message) => message.data),
      [{ notificationId: firstId }, { notificationId: secondId }],
    );
    assert.ok(!JSON.stringify(sent).includes("unitId"));
    assert.ok(!JSON.stringify(sent).includes("dates"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("Expo 푸시 토큰 등록", async () => {
  const { token } = await signup();
  const res = await req("PUT", "/push/token", {
    token,
    body: { token: "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]" },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
});

test("푸시 수신/열람 이벤트 보고 → 로그로 열람 가능", async () => {
  const { token } = await signup();

  const receipt = await req("POST", "/push/events", {
    token,
    body: {
      direction: "receipt",
      title: "출타율 초과 알림",
      body: "테스트 알림",
      data: { type: "overage" },
    },
  });
  assert.equal(receipt.status, 200);

  const open = await req("POST", "/push/events", {
    token,
    body: { direction: "open", title: "출타율 초과 알림" },
  });
  assert.equal(open.status, 200);

  await sleep(300);
  const activity = await req("GET", "/auth/activity", { token });
  const directions = activity.data.pushLogs.map((l) => l.direction);
  assert.ok(directions.includes("receipt"), "receipt 로그가 있어야 함");
  assert.ok(directions.includes("open"), "open 로그가 있어야 함");
  for (const log of activity.data.pushLogs) {
    assert.ok(!Object.hasOwn(log, "title"));
    assert.ok(!Object.hasOwn(log, "body"));
    assert.ok(!Object.hasOwn(log, "data"));
    assert.ok(!Object.hasOwn(log, "detail"));
  }
});

test("잘못된 direction 값은 400", async () => {
  const { token } = await signup();
  const res = await req("POST", "/push/events", {
    token,
    body: { direction: "invalid" },
  });
  assert.equal(res.status, 400);
});

test("인증 없이는 이벤트 보고 불가 (401)", async () => {
  const res = await req("POST", "/push/events", {
    body: { direction: "receipt" },
  });
  assert.equal(res.status, 401);
});
