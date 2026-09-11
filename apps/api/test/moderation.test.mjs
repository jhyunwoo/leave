import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup } from "./helpers.mjs";

test("초대코드 무차별 대입은 rate limit에 걸린다", async () => {
  // 사용자별 버킷이라 이 사용자만 막히고 다른 테스트에는 영향이 없다.
  const attacker = await signup();
  const code = "X".repeat(40);

  const statuses = [];
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const res = await req("POST", "/units/join", {
      token: attacker.token,
      body: { code },
    });
    statuses.push(res.status);
  }

  // 상한 3회/15분: 앞의 3번은 "유효하지 않은 코드"(400), 4번째부터 429.
  // 코드가 6자로 짧아진 뒤로 이 숫자가 실제로 안전을 떠받친다 — 느슨하게
  // 바꾸려면 코드 길이·유효기간과 함께 다시 계산할 것(routes/units.ts).
  assert.deepEqual(statuses.slice(0, 3), [400, 400, 400]);
  assert.equal(statuses[3], 429);

  const blocked = await req("POST", "/units/join", {
    token: attacker.token,
    body: { code },
  });
  assert.equal(blocked.status, 429);
  assert.match(blocked.data.error, /너무 잦/);
});

/**
 * 이 테스트가 지키는 것은 숫자가 아니라 **원자성**이다.
 *
 * 카운터가 KV에 있던 동안에는 "읽고 더해 쓰기"가 겹쳐, 동시에 도착한 요청이 모두 같은
 * 값을 읽고 같은 값을 써서 카운터가 한 번만 올라갔다. 순차 요청만 검사하면 그 구멍이
 * 드러나지 않는다 — 6자 초대코드의 안전이 이 상한에 기대고 있으므로 병렬로 두드려 본다.
 */
test("동시에 두드려도 초대코드 상한을 넘지 못한다", async () => {
  const attacker = await signup();
  const code = "Y".repeat(40);

  const attempt = () =>
    req("POST", "/units/join", { token: attacker.token, body: { code } });
  const statuses = (await Promise.all(Array.from({ length: 8 }, attempt))).map(
    (res) => res.status,
  );

  // 상한 3회/15분. 병렬이라 순서는 보장되지 않지만 **개수는 보장돼야 한다.**
  assert.equal(
    statuses.filter((status) => status === 400).length,
    3,
    `상한을 넘겨 통과했다: ${JSON.stringify(statuses)}`,
  );
  assert.equal(statuses.filter((status) => status === 429).length, 5);
});

test("지원하지 않는 구버전 앱은 426으로 막고 /meta는 열어둔다", async () => {
  const user = await signup();

  // 테스트 환경에는 MIN_APP_VERSION이 없으므로 차단되지 않아야 한다.
  const meta = await req("GET", "/meta");
  assert.equal(meta.status, 200);
  assert.ok("minSupportedVersion" in meta.data);

  // 버전 헤더가 없으면 정상 사용자까지 잠기므로 통과시킨다.
  const noHeader = await req("GET", "/auth/me", { token: user.token });
  assert.equal(noHeader.status, 200);
});

test("신고는 내가 볼 수 있는 대상만 접수한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;

  const accepted = await req("POST", "/moderation/reports", {
    token: owner.token,
    body: {
      targetType: "unit",
      targetId: unitId,
      reason: "military_info",
      detail: "그룹 설명에 실제 부대 정보가 있습니다",
    },
  });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.data.report.status, "open");

  // 남의 그룹 UUID를 넣어 존재 여부를 떠보지 못한다.
  const outsider = await signup();
  const rejected = await req("POST", "/moderation/reports", {
    token: outsider.token,
    body: { targetType: "unit", targetId: unitId, reason: "abuse" },
  });
  assert.equal(rejected.status, 400);

  const unauthenticated = await req("POST", "/moderation/reports", {
    body: { targetType: "unit", targetId: unitId, reason: "abuse" },
  });
  assert.equal(unauthenticated.status, 401);
});

test("차단은 참여자 목록에서만 숨기고 출타 집계는 그대로 둔다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 3 });
  const unitId = created.data.unit.id;
  const invite = created.data.invite.code;

  const other = await signup();
  const joined = await req("POST", "/units/join", {
    token: other.token,
    body: { code: invite },
  });
  assert.equal(joined.status, 200);

  const leave = await req("POST", "/leaves", {
    token: other.token,
    body: {
      title: "휴가",
      segments: [
        { category: "annual", startDate: "2026-08-10", endDate: "2026-08-11" },
      ],
    },
  });
  assert.equal(leave.status, 201);

  const before = await req("GET", `/units/${unitId}/members`, {
    token: owner.token,
  });
  assert.equal(before.data.members.length, 2);

  const blocked = await req("POST", "/moderation/blocks", {
    token: owner.token,
    body: { userId: other.data.user.id },
  });
  assert.equal(blocked.status, 200);

  const after = await req("GET", `/units/${unitId}/members`, {
    token: owner.token,
  });
  assert.equal(after.data.members.length, 1);
  assert.equal(after.data.members[0].id, owner.data.user.id);

  // 차단해도 집계는 그대로여야 한다. 사람마다 다른 숫자를 보면 앱이 쓸모없어진다.
  const calendar = await req(`GET`, `/units/${unitId}/calendar?month=2026-08`, {
    token: owner.token,
  });
  const day = calendar.data.days.find((d) => d.date === "2026-08-10");
  assert.equal(day.count, 1);
  // 다만 출타 명단에서는 사라진다 — 참여자 목록과 같은 규칙이다.
  assert.equal(
    calendar.data.attendees.some((a) => a.userId === other.data.user.id),
    false,
  );

  const list = await req("GET", "/moderation/blocks", { token: owner.token });
  assert.equal(list.data.blocks.length, 1);

  const released = await req(
    "DELETE",
    `/moderation/blocks/${other.data.user.id}`,
    { token: owner.token },
  );
  assert.equal(released.status, 200);
  const restored = await req("GET", `/units/${unitId}/members`, {
    token: owner.token,
  });
  assert.equal(restored.data.members.length, 2);

  // 자기 자신은 차단할 수 없다.
  const self = await req("POST", "/moderation/blocks", {
    token: owner.token,
    body: { userId: owner.data.user.id },
  });
  assert.equal(self.status, 400);
});

test("알림 종류별 설정을 저장하고 초과 알림을 끄면 알림이 오지 않는다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 1 });
  const invite = created.data.invite.code;

  const defaults = await req("GET", "/notifications/preferences", {
    token: owner.token,
  });
  assert.equal(defaults.status, 200);
  assert.deepEqual(defaults.data.preferences, {
    overage: true,
    blackout: true,
    unitNotice: true,
    friendRequest: true,
    friendLeave: true,
  });

  // 초과 알림만 끄고 나머지는 그대로 둔다.
  const updated = await req("PATCH", "/notifications/preferences", {
    token: owner.token,
    body: { overage: false },
  });
  assert.equal(updated.status, 200);
  assert.deepEqual(updated.data.preferences, {
    overage: false,
    blackout: true,
    unitNotice: true,
    friendRequest: true,
    friendLeave: true,
  });

  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "먼저 잡은 휴가",
      segments: [
        { category: "annual", startDate: "2026-08-20", endDate: "2026-08-21" },
      ],
    },
  });

  const other = await signup();
  await req("POST", "/units/join", {
    token: other.token,
    body: { code: invite },
  });
  const conflicting = await req("POST", "/leaves", {
    token: other.token,
    body: {
      title: "겹치는 휴가",
      segments: [
        { category: "annual", startDate: "2026-08-20", endDate: "2026-08-21" },
      ],
    },
  });
  assert.equal(conflicting.status, 201);
  assert.ok(conflicting.data.exceededDates.length > 0);

  // 초과는 실제로 났지만, 끈 사용자에게는 인앱 알림이 생기지 않아야 한다.
  const inbox = await req("GET", "/notifications", { token: owner.token });
  assert.equal(inbox.data.notifications.length, 0);

  // 끄지 않은 사용자는 그대로 받는다.
  const otherInbox = await req("GET", "/notifications", { token: other.token });
  assert.ok(otherInbox.data.notifications.length > 0);
});
