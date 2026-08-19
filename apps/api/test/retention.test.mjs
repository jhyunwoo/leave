// 접속 기록을 "언제 남기고 언제 지우는가"에 대한 테스트.
//
// 접속 기록은 요청당 한 행이 쌓이고, 푸시 로그와 만료 세션도 지우는 곳이 없었다.
// 보관 기간 정리에서 확인하는 것은 두 가지다 — 오래된 것이 실제로 지워지는가,
// 그리고 최근 것이 남는가. 후자가 빠지면 "정리가 돈다"는 사실만 알고 무엇을
// 지웠는지는 모른다. 마지막 테스트는 동의를 내린 사용자의 요청이 애초에 기록되지
// 않는지 본다 — 관리자 화면의 동의 토글이 표시용으로만 남으면 안 된다.
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { req, signup, uniq } from "./helpers.mjs";

const BASE = process.env.API_URL ?? "http://localhost:8799";
const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** run-tests.mjs가 만든 격리 D1 파일. 러너와 같은 상태를 직접 들여다본다. */
function openTestDb() {
  const dir = path.join(
    apiDir,
    ".wrangler",
    "test-state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  );
  const file = readdirSync(dir).find(
    (name) => name.endsWith(".sqlite") && name !== "metadata.sqlite",
  );
  assert.ok(file, `D1 파일을 찾지 못했다: ${dir}`);
  const db = new DatabaseSync(path.join(dir, file));
  // wrangler dev가 같은 파일을 쥐고 있다 — 잠깐 잠겨 있어도 기다린다.
  db.exec("PRAGMA busy_timeout = 20000");
  return db;
}

/** days일 전 시각의 ISO 문자열. */
function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/** cron 트리거를 로컬에서 실행시키는 wrangler dev의 진입점. */
async function runScheduled() {
  const res = await fetch(`${BASE}/cdn-cgi/handler/scheduled`);
  assert.equal(res.status, 200, "scheduled 핸들러 호출 실패");
  // waitUntil 안에서 도는 작업이라 응답 뒤에도 잠깐 이어진다.
  await new Promise((r) => setTimeout(r, 800));
}

test("보관 기간이 지난 접속 기록·푸시 로그와 만료 세션을 지운다", async () => {
  const { token, data } = await signup();
  const userId = data.user.id;

  const db = openTestDb();
  const tag = uniq("retention-");
  try {
    // 오래된 것과 최근 것을 짝으로 넣어 "무엇이 지워졌는가"를 구분할 수 있게 한다.
    for (const [suffix, createdAt] of [
      ["old", daysAgo(200)],
      ["new", daysAgo(1)],
    ]) {
      db.prepare(
        "insert into access_logs (id, user_id, method, path, status, duration_ms, created_at) values (?, ?, 'GET', '/retention-probe', 200, 1, ?)",
      ).run(`${tag}-log-${suffix}`, userId, createdAt);
      db.prepare(
        "insert into push_logs (id, user_id, direction, status, created_at) values (?, ?, 'send', 'ok', ?)",
      ).run(`${tag}-push-${suffix}`, userId, createdAt);
    }

    // 이 사용자의 세션(가입 때 발급된 것)을 만료 상태로 되돌린다.
    const expired = db
      .prepare("update sessions set expires_at = ? where user_id = ?")
      .run(daysAgo(1), userId);
    assert.ok(expired.changes >= 1, "만료시킬 세션이 없다");

    await runScheduled();

    const count = (table, id) =>
      db.prepare(`select count(*) as n from ${table} where id = ?`).get(id).n;

    assert.equal(
      count("access_logs", `${tag}-log-old`),
      0,
      "오래된 접속 기록이 남았다",
    );
    assert.equal(
      count("access_logs", `${tag}-log-new`),
      1,
      "최근 접속 기록이 지워졌다",
    );
    assert.equal(
      count("push_logs", `${tag}-push-old`),
      0,
      "오래된 푸시 로그가 남았다",
    );
    assert.equal(
      count("push_logs", `${tag}-push-new`),
      1,
      "최근 푸시 로그가 지워졌다",
    );

    const sessions = db
      .prepare("select count(*) as n from sessions where user_id = ?")
      .get(userId).n;
    assert.equal(sessions, 0, "만료된 세션이 남았다");
  } finally {
    db.close();
  }

  // 만료 세션을 지웠으니 그 토큰은 더 이상 통하지 않아야 한다.
  const me = await req("GET", "/auth/me", { token });
  assert.equal(me.status, 401);
});

test("동의를 내린 사용자의 요청은 접속 기록에 남지 않는다", async () => {
  const { token, data } = await signup();
  const userId = data.user.id;
  const db = openTestDb();
  try {
    // 관리자 화면이 동의를 내리는 것과 같은 상태를 만든다.
    const cleared = db
      .prepare("update users set consented_at = null where id = ?")
      .run(userId);
    assert.equal(cleared.changes, 1);

    const before = db
      .prepare("select count(*) as n from access_logs where user_id = ?")
      .get(userId).n;

    // 동의를 내린 뒤의 요청 — 성공은 하되 기록은 남지 않아야 한다.
    for (let i = 0; i < 3; i += 1) {
      const me = await req("GET", "/auth/me", { token });
      assert.equal(me.status, 200);
    }
    // 기록은 waitUntil로 나중에 쓰인다. 쓰였다면 이 사이에 들어온다.
    await new Promise((r) => setTimeout(r, 800));

    const after = db
      .prepare("select count(*) as n from access_logs where user_id = ?")
      .get(userId).n;
    assert.equal(after, before, "동의를 내렸는데도 접속 기록이 쌓였다");
  } finally {
    db.close();
  }
});
