import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { createUnit, req, signup, sleep, uniq } from "./helpers.mjs";

function queryDb(sql) {
  const result = spawnSync(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "leave-db",
      "--local",
      "--persist-to",
      ".wrangler/test-state",
      "--command",
      sql,
      "--json",
    ],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout)[0].results;
}

test("그룹 이름 검색·전체 열거와 UUID 직접 가입을 차단한다", async () => {
  const owner = await signup();
  const name = uniq("무의미한모임-");
  const created = await createUnit(owner.token, { name });
  assert.equal(created.status, 201);
  const unitId = created.data.unit.id;

  const outsider = await signup();
  const search = await req("GET", `/units?q=${encodeURIComponent(name)}`, {
    token: outsider.token,
  });
  assert.equal(search.status, 404);
  const list = await req("GET", "/units", { token: outsider.token });
  assert.equal(list.status, 404);

  const directJoin = await req("POST", `/units/${unitId}/join`, {
    token: outsider.token,
  });
  assert.equal(directJoin.status, 404);

  const detail = await req("GET", `/units/${unitId}`, {
    token: outsider.token,
  });
  assert.equal(detail.status, 403);
  const unknownDetail = await req("GET", `/units/${crypto.randomUUID()}`, {
    token: outsider.token,
  });
  assert.equal(unknownDetail.status, detail.status);
});

test("그룹 표시명은 중복 가능하고 기준 인원 갱신 시각을 보존한다", async () => {
  const name = uniq("중복가능-");
  const lastTotalUpdatedAt = "2026-08-04T12:34:56.000Z";
  const firstOwner = await signup();
  const secondOwner = await signup();

  const first = await createUnit(firstOwner.token, {
    name,
    referenceMemberTotal: 60,
    maxLeaveCount: 12,
    lastTotalUpdatedAt,
  });
  const second = await createUnit(secondOwner.token, {
    name,
    referenceMemberTotal: 50,
    maxLeaveCount: 10,
    lastTotalUpdatedAt,
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);
  assert.notEqual(first.data.unit.id, second.data.unit.id);
  assert.equal(first.data.unit.referenceMemberTotal, 60);
  assert.equal(first.data.unit.lastTotalUpdatedAt, lastTotalUpdatedAt);
});

test("고엔트로피 초대코드만 즉시 가입시키고 원문은 저장하지 않는다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { inviteMaxUses: 2 });
  assert.equal(created.status, 201);
  const { unit, invite } = created.data;
  assert.match(invite.code, /^[A-Za-z0-9_-]{32,}$/);
  assert.equal(invite.usedCount, 0);
  assert.equal(invite.maxUses, 2);

  const joiner = await signup();
  const joined = await req("POST", "/units/join", {
    token: joiner.token,
    body: { code: invite.code },
  });
  assert.equal(joined.status, 200);
  assert.equal(joined.data.joined, true);
  assert.equal(joined.data.unit.id, unit.id);

  const duplicate = await req("POST", "/units/join", {
    token: joiner.token,
    body: { code: invite.code },
  });
  assert.equal(duplicate.status, 409);

  const rows = queryDb(
    `SELECT code_hash AS codeHash, max_uses AS maxUses, used_count AS usedCount FROM unit_invites WHERE unit_id = '${unit.id}'`,
  );
  assert.equal(rows.length, 1);
  assert.match(rows[0].codeHash, /^[a-f0-9]{64}$/);
  assert.notEqual(rows[0].codeHash, invite.code);
  assert.equal(rows[0].maxUses, 2);
  assert.equal(rows[0].usedCount, 1);
});

test("잘못되거나 만료되거나 사용량이 소진된 초대코드를 거부한다", async () => {
  const invalidUser = await signup();
  const invalid = await req("POST", "/units/join", {
    token: invalidUser.token,
    body: { code: crypto.randomUUID() },
  });
  assert.equal(invalid.status, 400);

  const expiringOwner = await signup();
  const expiring = await createUnit(expiringOwner.token, {
    inviteExpiresAt: new Date(Date.now() + 2000).toISOString(),
  });
  await sleep(2200);
  const lateUser = await signup();
  const expired = await req("POST", "/units/join", {
    token: lateUser.token,
    body: { code: expiring.data.invite.code },
  });
  assert.equal(expired.status, 400);

  const limitedOwner = await signup();
  const limited = await createUnit(limitedOwner.token, { inviteMaxUses: 1 });
  const firstUser = await signup();
  const first = await req("POST", "/units/join", {
    token: firstUser.token,
    body: { code: limited.data.invite.code },
  });
  assert.equal(first.status, 200);
  const secondUser = await signup();
  const exhausted = await req("POST", "/units/join", {
    token: secondUser.token,
    body: { code: limited.data.invite.code },
  });
  assert.equal(exhausted.status, 400);
});

test("초대코드 회전은 현재 그룹 관리자만 가능하고 이전 코드를 폐기한다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token);
  const unitId = created.data.unit.id;
  const oldCode = created.data.invite.code;
  const outsider = await signup();

  const forbidden = await req("POST", `/units/${unitId}/invite`, {
    token: outsider.token,
    body: { maxUses: 3 },
  });
  assert.equal(forbidden.status, 403);

  const rotated = await req("POST", `/units/${unitId}/invite`, {
    token: owner.token,
    body: { maxUses: 3 },
  });
  assert.equal(rotated.status, 201);
  assert.notEqual(rotated.data.invite.code, oldCode);

  const oldJoiner = await signup();
  const oldAttempt = await req("POST", "/units/join", {
    token: oldJoiner.token,
    body: { code: oldCode },
  });
  assert.equal(oldAttempt.status, 400);

  const newJoiner = await signup();
  const newAttempt = await req("POST", "/units/join", {
    token: newJoiner.token,
    body: { code: rotated.data.invite.code },
  });
  assert.equal(newAttempt.status, 200);

  const rows = queryDb(
    `SELECT revoked_at AS revokedAt FROM unit_invites WHERE unit_id = '${unitId}'`,
  );
  assert.equal(rows.length, 2);
  assert.equal(rows.filter((row) => row.revokedAt !== null).length, 1);
  assert.equal(rows.filter((row) => row.revokedAt === null).length, 1);
});

test("민감 로그 컬럼과 레거시 가입신청 테이블을 물리적으로 제거한다", () => {
  const accessColumns = queryDb("PRAGMA table_info(access_logs)").map(
    (column) => column.name,
  );
  assert.ok(!accessColumns.includes("ip"));
  assert.ok(!accessColumns.includes("country"));
  assert.ok(!accessColumns.includes("user_agent"));

  const pushColumns = queryDb("PRAGMA table_info(push_logs)").map(
    (column) => column.name,
  );
  assert.ok(!pushColumns.includes("title"));
  assert.ok(!pushColumns.includes("body"));
  assert.ok(!pushColumns.includes("data_json"));
  assert.ok(!pushColumns.includes("detail"));

  const [inviteStorage] = queryDb(
    "SELECT group_concat(name) AS columns, (SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'unit_join_requests') AS legacyJoinTableCount FROM pragma_table_info('unit_invites')",
  );
  const inviteColumns = inviteStorage.columns.split(",");
  assert.ok(!inviteColumns.includes("code"));
  for (const column of [
    "code_hash",
    "expires_at",
    "max_uses",
    "used_count",
    "revoked_at",
  ]) {
    assert.ok(inviteColumns.includes(column));
  }
  assert.equal(inviteStorage.legacyJoinTableCount, 0);
});
