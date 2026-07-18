import assert from "node:assert/strict";
import { test } from "node:test";
import { req, signup, sleep } from "./helpers.mjs";

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
