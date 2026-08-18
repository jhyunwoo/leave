import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

/**
 * 알림은 클라이언트가 직접 만들 수 없다 — 서버가 초과를 감지할 때만 생긴다
 * (lib/overage.ts). 그래서 삭제를 시험하려면 먼저 초과 상황을 만들어야 한다.
 *
 * 하루 최대 출타 1명인 부대에 두 명이 같은 날 휴가를 넣으면, 그날 휴가 중인
 * 부대원 모두에게 알림이 간다. 그 알림을 받은 첫 사용자를 돌려준다.
 */
async function userWithNotification() {
  const owner = await signup();
  const unit = await createUnit(owner.token, {
    name: uniq("알림삭제부대-"),
    maxLeaveCount: 1,
  });

  const other = await signup();
  await req("POST", "/units/join", {
    token: other.token,
    body: { code: unit.data.invite.code },
  });

  const oneDay = [
    { category: "annual", startDate: "2026-11-09", endDate: "2026-11-09" },
  ];
  await req("POST", "/leaves", {
    token: owner.token,
    body: { title: "휴가1", segments: oneDay },
  });
  await req("POST", "/leaves", {
    token: other.token,
    body: { title: "휴가2", segments: oneDay },
  });

  const list = await req("GET", "/notifications", { token: owner.token });
  assert.ok(
    list.data.notifications.length >= 1,
    "초과 알림이 만들어져야 시험할 수 있다",
  );
  return { token: owner.token, list, otherToken: other.token };
}

test("알림을 지우면 목록과 안 읽음 수에서 함께 빠진다", async () => {
  const { token, list } = await userWithNotification();
  const target = list.data.notifications[0];
  const before = list.data.unreadCount;
  assert.equal(target.read, false, "갓 만들어진 알림은 안 읽음 상태다");

  const del = await req("DELETE", `/notifications/${target.id}`, { token });
  assert.equal(del.status, 200);
  assert.equal(del.data.ok, true);

  const after = await req("GET", "/notifications", { token });
  assert.ok(
    !after.data.notifications.some((n) => n.id === target.id),
    "지운 알림은 목록에 남지 않는다",
  );
  // soft delete라 행은 남지만, 안 읽음 수에서는 빠져야 탭 배지가 줄어든다.
  assert.equal(after.data.unreadCount, before - 1);
});

test("이미 지운 알림을 다시 지우면 404", async () => {
  const { token, list } = await userWithNotification();
  const id = list.data.notifications[0].id;

  assert.equal(
    (await req("DELETE", `/notifications/${id}`, { token })).status,
    200,
  );
  assert.equal(
    (await req("DELETE", `/notifications/${id}`, { token })).status,
    404,
  );
});

test("남의 알림은 지울 수 없고, 존재 여부도 알려주지 않는다", async () => {
  const { token, list, otherToken } = await userWithNotification();
  const id = list.data.notifications[0].id;

  // 403이 아니라 404 — id가 실제로 있는지 없는지 구분되면 안 된다.
  const denied = await req("DELETE", `/notifications/${id}`, {
    token: otherToken,
  });
  assert.equal(denied.status, 404);
  const missing = await req("DELETE", `/notifications/${crypto.randomUUID()}`, {
    token: otherToken,
  });
  assert.equal(missing.status, 404);

  // 주인의 알림은 그대로 남아 있다.
  const mine = await req("GET", "/notifications", { token });
  assert.ok(mine.data.notifications.some((n) => n.id === id));
});

test("알림 삭제에는 인증이 필요하다", async () => {
  const res = await req("DELETE", `/notifications/${crypto.randomUUID()}`);
  assert.equal(res.status, 401);
});
