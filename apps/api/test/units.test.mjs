import assert from "node:assert/strict";
import { test } from "node:test";
import { createUnit, req, signup, uniq } from "./helpers.mjs";

/** 서울 기준 이번 달에서 delta개월 떨어진 "YYYY-MM". */
function monthFromNow(delta) {
  const seoul = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const total = seoul.getUTCFullYear() * 12 + seoul.getUTCMonth() + delta;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function joinCreatedUnit(token, created) {
  return req("POST", "/units/join", {
    token,
    body: { code: created.data.invite.code },
  });
}

test("그룹 생성 → 생성자는 자동 가입·관리자이고 초대코드는 한 번 반환된다", async () => {
  const { token } = await signup();
  const created = await createUnit(token, {
    name: uniq("비식별그룹-"),
    referenceMemberTotal: 60,
    maxLeaveCount: 12,
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.unit.memberCount, 1);
  assert.equal(created.data.unit.referenceMemberTotal, 60);
  assert.ok(created.data.unit.lastTotalUpdatedAt);
  // Crockford Base32 6자. 사람이 받아 적을 수 있는 길이라야 초대 링크 없이도 쓴다.
  assert.match(created.data.invite.code, /^[0-9A-HJKMNP-TV-Z]{6}$/);

  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  assert.equal(me.data.unit.adminId, me.data.user.id);
  assert.equal(me.data.joinRequest, null);
});

test("초대코드 가입은 즉시 부대원 편입되고 멤버 목록에 반영된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const member = await signup();
  const joined = await joinCreatedUnit(member.token, created);
  assert.equal(joined.status, 200);
  assert.equal(joined.data.joined, true);
  assert.equal(joined.data.unit.id, created.data.unit.id);

  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  const members = await req("GET", `/units/${created.data.unit.id}/members`, {
    token: owner.token,
  });
  assert.equal(members.status, 200);
  assert.equal(members.data.members.length, 2);
});

test("받아 적은 초대코드는 대소문자·공백·혼동 글자를 흡수해 같은 그룹으로 간다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const code = created.data.invite.code;

  // 사람이 옮겨 적으면 이렇게 온다: 소문자, 가운데 공백, 0을 O로.
  const typed = `${code.slice(0, 3).toLowerCase()} ${code
    .slice(3)
    .toLowerCase()
    .replaceAll("0", "o")
    .replaceAll("1", "l")}`;

  const member = await signup();
  const joined = await req("POST", "/units/join", {
    token: member.token,
    body: { code: typed },
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.unit.id, created.data.unit.id);
});

test("여섯 자가 아닌 값은 옛 32자 코드 형식일 때만 서버까지 간다", async () => {
  const user = await signup();
  // 다섯 자 — 형식 검증에서 걸린다.
  const short = await req("POST", "/units/join", {
    token: user.token,
    body: { code: "A2C4D" },
  });
  assert.equal(short.status, 400);

  // 옛 형식 길이지만 존재하지 않는 코드 — 형식은 통과하고 조회에서 걸린다.
  const legacyShaped = await req("POST", "/units/join", {
    token: user.token,
    body: { code: "a".repeat(32) },
  });
  assert.equal(legacyShaped.status, 400);
});

test("관리자가 계정을 지우면 남은 부대원에게 관리자 권한이 이관된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const deleted = await req("DELETE", "/auth/account", { token: owner.token });
  assert.equal(deleted.status, 200);
  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit.id, created.data.unit.id);
  assert.equal(me.data.unit.adminId, member.data.user.id);

  const patch = await req("PATCH", `/units/${created.data.unit.id}`, {
    token: member.token,
    body: { description: "승계된 관리자" },
  });
  assert.equal(patch.status, 200);
});

test("그룹 정보 수정은 현재 관리자만 가능하고 기준 인원 갱신 시각을 관리한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, {
    referenceMemberTotal: 50,
    maxLeaveCount: 10,
  });
  const unitId = created.data.unit.id;
  const outsider = await signup();
  const forbidden = await req("PATCH", `/units/${unitId}`, {
    token: outsider.token,
    body: { name: uniq("탈취-") },
  });
  assert.equal(forbidden.status, 403);

  const beforeUpdatedAt = created.data.unit.lastTotalUpdatedAt;
  const patched = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { referenceMemberTotal: 55, maxLeaveCount: 2 },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.unit.referenceMemberTotal, 55);
  assert.equal(patched.data.unit.maxLeaveCount, 2);
  assert.ok(patched.data.unit.lastTotalUpdatedAt >= beforeUpdatedAt);

  const zero = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { maxLeaveCount: 0 },
  });
  assert.equal(zero.status, 200);
  assert.equal(zero.data.unit.maxLeaveCount, 0);
  const nulled = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { maxLeaveCount: null },
  });
  assert.equal(nulled.status, 400);
});

test("관리자 이관 후 새 관리자만 수정할 수 있다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);
  const outsider = await signup();

  const badTransfer = await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: outsider.data.user.id },
  });
  assert.equal(badTransfer.status, 400);
  const transferred = await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: member.data.user.id },
  });
  assert.equal(transferred.status, 200);
  assert.equal(transferred.data.unit.adminId, member.data.user.id);

  const oldForbidden = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { description: "이전 관리자" },
  });
  assert.equal(oldForbidden.status, 403);
  const updated = await req("PATCH", `/units/${unitId}`, {
    token: member.token,
    body: { description: "새 관리자" },
  });
  assert.equal(updated.status, 200);
});

test("관리자는 멤버를 제거할 수 있지만 자신은 제거할 수 없다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const self = await req(
    "POST",
    `/units/${unitId}/members/${owner.data.user.id}/remove`,
    { token: owner.token },
  );
  assert.equal(self.status, 400);
  const removed = await req(
    "POST",
    `/units/${unitId}/members/${member.data.user.id}/remove`,
    { token: owner.token },
  );
  assert.equal(removed.status, 200);
  const me = await req("GET", "/auth/me", { token: member.token });
  assert.equal(me.data.unit, null);
});

test("관리자는 이관 전 탈퇴할 수 없고 이관 후에는 탈퇴할 수 있다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const blocked = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(blocked.status, 409);
  await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: member.data.user.id },
  });
  const left = await req("POST", "/units/leave", { token: owner.token });
  assert.equal(left.status, 200);
  const me = await req("GET", "/auth/me", { token: owner.token });
  assert.equal(me.data.unit, null);
});

test("상세·멤버·달력은 현재 멤버십을 서버에서 검증한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const outsider = await signup();

  const detail = await req("GET", `/units/${unitId}`, {
    token: outsider.token,
  });
  const members = await req("GET", `/units/${unitId}/members`, {
    token: outsider.token,
  });
  const calendar = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: outsider.token,
  });
  const calendars = await req(
    "GET",
    `/units/${unitId}/calendars?months=2026-08,2026-09`,
    { token: outsider.token },
  );
  assert.equal(detail.status, 403);
  assert.equal(members.status, 403);
  assert.equal(calendar.status, 403);
  assert.equal(calendars.status, 403);
});

test("달력은 출타 명단을 이름과 함께 주되 자유 입력값은 감추고 먼 달은 막는다", async () => {
  const owner = await signup({ name: "김출타" });
  const created = await createUnit(owner.token, { maxLeaveCount: 1 });
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);
  const date = "2026-08-15";

  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "관리자 비밀 일정",
      reason: "외부에 노출되면 안 됨",
      segments: [{ category: "annual", startDate: date, endDate: date }],
    },
  });
  await req("POST", "/leaves", {
    token: member.token,
    body: {
      title: "내 일정",
      reason: "내 사유",
      segments: [{ category: "annual", startDate: date, endDate: date }],
    },
  });

  const calendar = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
    token: member.token,
  });
  assert.equal(calendar.status, 200);
  const day = calendar.data.days.find((item) => item.date === date);
  assert.equal(day.count, 2);
  assert.equal(day.exceeded, true);
  assert.ok(!Object.hasOwn(day, "userIds"));
  assert.equal(calendar.data.leaves.length, 1);
  assert.equal(calendar.data.leaves[0].title, "내 일정");
  assert.equal(calendar.data.leaves[0].reason, "내 사유");
  for (const key of [
    "userId",
    "userName",
    "userRankLabel",
    "userProfileImageKey",
  ]) {
    assert.ok(!Object.hasOwn(calendar.data.leaves[0], key));
  }
  assert.doesNotMatch(
    JSON.stringify(calendar.data),
    /관리자 비밀 일정|외부에 노출/,
  );

  // 명단은 이름·계급과 함께 둘 다 보여준다. 제목·사유는 여기에도 담기지 않는다.
  assert.equal(calendar.data.attendees.length, 2);
  const ownerEntry = calendar.data.attendees.find(
    (a) => a.userId === owner.data.user.id,
  );
  assert.equal(ownerEntry.name, "김출타");
  assert.ok(ownerEntry.rankLabel.length > 0);
  assert.equal(ownerEntry.startDate, date);
  assert.ok(!Object.hasOwn(ownerEntry, "title"));
  assert.ok(!Object.hasOwn(ownerEntry, "reason"));

  // 초안은 본인 것이라도 명단에 들어가지 않는다.
  const draftDate = "2026-08-16";
  await req("POST", "/leaves", {
    token: member.token,
    body: {
      title: "초안",
      status: "draft",
      segments: [
        { category: "annual", startDate: draftDate, endDate: draftDate },
      ],
    },
  });
  const withDraft = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-08`,
    { token: member.token },
  );
  assert.equal(
    withDraft.data.attendees.some((a) => a.startDate === draftDate),
    false,
  );
  assert.equal(
    withDraft.data.leaves.some((l) => l.startDate === draftDate),
    true,
  );

  const batch = await req(
    "GET",
    `/units/${unitId}/calendars?months=2026-08,2026-09`,
    { token: member.token },
  );
  assert.equal(batch.status, 200);
  assert.deepEqual(
    batch.data.calendars.map((item) => item.month),
    ["2026-08", "2026-09"],
  );
  // 단일 월 계약과 배치 안의 같은 월은 필드·개인정보 필터가 완전히 같다.
  assert.deepEqual(batch.data.calendars[0], withDraft.data);

  const duplicateBatch = await req(
    "GET",
    `/units/${unitId}/calendars?months=2026-08,2026-08`,
    { token: member.token },
  );
  assert.equal(duplicateBatch.status, 400);

  const far = await req(
    "GET",
    `/units/${unitId}/calendar?month=${monthFromNow(120)}`,
    { token: member.token },
  );
  assert.equal(far.status, 400);
});

test("달력은 복무 기간 전체를 계획할 만큼 앞뒤로 열려 있다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;

  // 전역까지 남은 달을 훑으며 휴가를 계획한다. 이 범위가 막히면 그 달의
  // 달력·추천·시뮬레이션이 통째로 비어 휴가를 등록할 수 없다.
  for (const delta of [-12, -4, 0, 4, 12, 24]) {
    const month = monthFromNow(delta);
    const res = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
      token: owner.token,
    });
    assert.equal(res.status, 200, `${month}(${delta}개월)을 열지 못했다`);
    assert.equal(res.data.month, month);
  }

  // 범위 밖은 여전히 막는다 — 캐시 키가 무한정 늘어나지 않게 한다.
  for (const delta of [-13, 25]) {
    const res = await req(
      "GET",
      `/units/${unitId}/calendar?month=${monthFromNow(delta)}`,
      { token: owner.token },
    );
    assert.equal(res.status, 400, `${delta}개월은 막혀야 한다`);
  }
});

test("휴가 등록 뒤 달력 집계와 본인 상세에 즉시 반영된다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const month = "2026-09";
  const before = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token: owner.token,
  });
  assert.equal(before.status, 200);
  assert.equal(before.data.leaves.length, 0);

  const added = await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "9월 휴가",
      segments: [
        { category: "annual", startDate: "2026-09-10", endDate: "2026-09-12" },
      ],
    },
  });
  assert.equal(added.status, 201);
  const after = await req("GET", `/units/${unitId}/calendar?month=${month}`, {
    token: owner.token,
  });
  assert.equal(after.status, 200);
  assert.equal(after.data.leaves.length, 1);
  assert.equal(after.data.leaves[0].title, "9월 휴가");
});

test("부대 관리자는 공유 일정을 등록·수정·삭제하고 부대원은 달력에서 본다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const member = await signup();
  await joinCreatedUnit(member.token, created);

  const forbiddenCreate = await req("POST", `/units/${unitId}/events`, {
    token: member.token,
    body: {
      title: "권한 없는 일정",
      isHoliday: false,
      startDate: "2026-09-01",
      endDate: "2026-09-01",
    },
  });
  assert.equal(forbiddenCreate.status, 403);

  const invalid = await req("POST", `/units/${unitId}/events`, {
    token: owner.token,
    body: {
      title: "잘못된 기간",
      isHoliday: true,
      startDate: "2026-09-02",
      endDate: "2026-09-01",
    },
  });
  assert.equal(invalid.status, 400);

  const createdEvent = await req("POST", `/units/${unitId}/events`, {
    token: owner.token,
    body: {
      title: "부대 창설 기념일",
      isHoliday: true,
      startDate: "2026-08-31",
      endDate: "2026-09-01",
      startTime: "09:00",
      endTime: "18:00",
      details: "전 부대원이 함께 보는 상세 안내",
    },
  });
  assert.equal(createdEvent.status, 201);
  assert.equal(createdEvent.data.event.isHoliday, true);
  assert.equal(
    createdEvent.data.event.details,
    "전 부대원이 함께 보는 상세 안내",
  );

  const memberCalendar = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: member.token },
  );
  assert.equal(memberCalendar.status, 200);
  assert.deepEqual(memberCalendar.data.events, [createdEvent.data.event]);

  const forbiddenUpdate = await req(
    "PATCH",
    `/units/${unitId}/events/${createdEvent.data.event.id}`,
    {
      token: member.token,
      body: { title: "가로챈 일정" },
    },
  );
  assert.equal(forbiddenUpdate.status, 403);

  const updated = await req(
    "PATCH",
    `/units/${unitId}/events/${createdEvent.data.event.id}`,
    {
      token: owner.token,
      body: {
        title: "전투 휴무일",
        isHoliday: false,
        startDate: "2026-09-02",
        endDate: "2026-09-02",
        startTime: null,
        endTime: null,
      },
    },
  );
  assert.equal(updated.status, 200);
  assert.equal(updated.data.event.title, "전투 휴무일");
  assert.equal(updated.data.event.isHoliday, false);
  assert.equal(updated.data.event.details, "전 부대원이 함께 보는 상세 안내");

  const forbiddenDelete = await req(
    "DELETE",
    `/units/${unitId}/events/${createdEvent.data.event.id}`,
    { token: member.token },
  );
  assert.equal(forbiddenDelete.status, 403);

  const removed = await req(
    "DELETE",
    `/units/${unitId}/events/${createdEvent.data.event.id}`,
    { token: owner.token },
  );
  assert.equal(removed.status, 200);
  const afterDelete = await req(
    "GET",
    `/units/${unitId}/calendar?month=2026-09`,
    { token: member.token },
  );
  assert.deepEqual(afterDelete.data.events, []);
});

test("부대가 외출을 출타율에서 빼면 달력 숫자는 줄고 명단은 그대로다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { maxLeaveCount: 1 });
  const unitId = created.data.unit.id;
  // 기본값은 기존 동작이다 — 마이그레이션이 돌아간 부대의 숫자가 달라지면 안 된다.
  assert.equal(created.data.unit.outingCounts, true);

  const member = await signup();
  await joinCreatedUnit(member.token, created);
  const date = "2026-08-15";

  await req("POST", "/leaves", {
    token: owner.token,
    body: {
      title: "연가",
      segments: [{ category: "annual", startDate: date, endDate: date }],
    },
  });
  await req("POST", "/leaves", {
    token: member.token,
    body: {
      title: "평일 외출",
      segments: [
        {
          category: "outing",
          outingKind: "weekday",
          startDate: date,
          endDate: date,
        },
      ],
    },
  });

  const dayOf = async (token) => {
    const res = await req("GET", `/units/${unitId}/calendar?month=2026-08`, {
      token,
    });
    assert.equal(res.status, 200);
    return {
      day: res.data.days.find((item) => item.date === date),
      attendees: res.data.attendees,
      unit: res.data.unit,
    };
  };

  const before = await dayOf(member.token);
  assert.equal(before.day.count, 2);
  assert.equal(before.day.exceeded, true);

  const patched = await req("PATCH", `/units/${unitId}`, {
    token: owner.token,
    body: { outingCounts: false },
  });
  assert.equal(patched.status, 200);
  assert.equal(patched.data.unit.outingCounts, false);

  const after = await dayOf(member.token);
  assert.equal(after.unit.outingCounts, false);
  assert.equal(after.day.count, 1, "외출한 사람은 출타 인원에서 빠진다");
  assert.equal(after.day.exceeded, false);
  // 그날 부대 밖에 있는 것은 사실이므로 명단에는 그대로 남는다.
  assert.equal(after.attendees.length, 2);
  assert.ok(
    after.attendees.some((entry) =>
      entry.segments.some((segment) => segment.category === "outing"),
    ),
  );
});
