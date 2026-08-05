import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildNotificationPushMessage,
  sendExpoPush,
  sendExpoPushMessages,
} from "../src/lib/push.ts";
import { req, signup, sleep } from "./helpers.mjs";

test("푸시 payload는 generic 문구와 notificationId만 포함한다", async () => {
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ data: [{ status: "ok", id: "ticket-id" }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  try {
    const notificationId = crypto.randomUUID();
    await sendExpoPush(
      ["ExponentPushToken[test-token]"],
      buildNotificationPushMessage(notificationId),
    );
    assert.equal(sent.length, 1);
    assert.equal(sent[0].title, "휴가 일정 알림");
    assert.equal(sent[0].body, "앱에서 새로운 알림을 확인해주세요.");
    assert.deepEqual(sent[0].data, { notificationId });
    assert.deepEqual(Object.keys(sent[0].data), ["notificationId"]);
    assert.ok(!JSON.stringify(sent[0]).includes("unitId"));
    assert.ok(!JSON.stringify(sent[0]).includes("dates"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("사용자별 notificationId를 민감 정보 없이 한 요청으로 배치한다", async () => {
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
        message: buildNotificationPushMessage(firstId),
      },
      {
        token: "ExponentPushToken[second]",
        message: buildNotificationPushMessage(secondId),
      },
    ]);
    assert.equal(calls, 1);
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
