// 보안 강화 회귀 테스트.
//
// 여기 모인 것들은 기능이 아니라 **약속**이다. 화면 어디에도 드러나지 않아서
// 조용히 되돌아가기 쉽고, 되돌아가면 그때는 사고로만 알게 된다.
//
//  1. 로그인은 계정이 있든 없든 같은 양의 일을 한다 (사용자 존재 여부 노출 방지)
//  2. 지나치게 긴 비밀번호는 PBKDF2에 닿기 전에 거절한다
//  3. 접속 기록에 남는 요청자 제어 문자열은 상한이 있다
//  4. 푸시 토큰은 기기 하나에 계정 하나로만 묶인다
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { req, signup, uniq } from "./helpers.mjs";
import { verifyPasswordOrDecoy, hashPassword } from "../src/lib/crypto.ts";

const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** run-tests.mjs가 만든 격리 D1 파일. retention.test.mjs와 같은 방식. */
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
  db.exec("PRAGMA busy_timeout = 20000");
  return db;
}

/** fn을 samples번 돌린 소요 시간의 중앙값(ms). 한 번 재면 노이즈에 휘둘린다. */
async function medianMs(fn, samples) {
  const times = [];
  for (let i = 0; i < samples; i += 1) {
    const started = performance.now();
    await fn();
    times.push(performance.now() - started);
  }
  return times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
}

/*
 * 계정이 없을 때 곧장 실패로 빠지면, 응답 시간이 "이 주소로 가입했는가"를 알려준다.
 * 이 서비스는 그 질문을 열어 두지 않기로 이미 정했다 — 친구 찾기를 이메일에서
 * 공개 사용자 이름으로 옮긴 것이 같은 이유였다(docs/architecture.md).
 *
 * 시간을 재는 테스트는 흔들리기 쉬우므로 HTTP가 아니라 함수를 직접 부른다.
 * 로그인 라우트에는 IP당 10회/10분 제한이 걸려 있어 표본을 쌓을 수도 없다.
 * 여기서 지키려는 것은 절대 시간이 아니라 **두 갈래가 같은 일을 하는가**이다.
 */
test("비밀번호 검증은 계정이 없어도 같은 비용을 치른다", async () => {
  const { hash, salt } = await hashPassword("password123");
  // 예열 — 첫 호출은 키 임포트 비용이 섞인다.
  await verifyPasswordOrDecoy("password123", { hash, salt });

  const present = await medianMs(
    () => verifyPasswordOrDecoy("wrong-password", { hash, salt }),
    7,
  );
  const absent = await medianMs(
    () => verifyPasswordOrDecoy("wrong-password", null),
    7,
  );

  assert.equal(
    await verifyPasswordOrDecoy("password123", { hash, salt }),
    true,
  );
  assert.equal(
    await verifyPasswordOrDecoy("wrong-password", { hash, salt }),
    false,
  );
  // 계정이 없으면 어떤 비밀번호로도 통과하지 못한다.
  assert.equal(await verifyPasswordOrDecoy("password123", null), false);
  assert.equal(await verifyPasswordOrDecoy("", null), false);

  // 고치기 전에는 계정 없는 쪽이 PBKDF2를 통째로 건너뛰어 10~50배 빨랐다.
  // 상한이 아니라 하한을 본다 — 느려지는 것은 문제가 아니고, 빨라지는 것이 문제다.
  const ratio = absent / present;
  assert.ok(
    ratio > 0.5,
    `계정 없는 쪽이 지나치게 빠르다: ${absent.toFixed(1)}ms vs ${present.toFixed(1)}ms (비율 ${ratio.toFixed(2)})`,
  );
});

test("로그인 실패 응답은 계정 유무를 구분하지 않는다", async () => {
  const { email } = await signup();

  const wrongPassword = await req("POST", "/auth/login", {
    body: { email, password: "definitely-not-the-password" },
  });
  const noSuchAccount = await req("POST", "/auth/login", {
    body: {
      email: `${uniq("ghost")}@test.com`,
      password: "definitely-not-the-password",
    },
  });

  assert.equal(wrongPassword.status, 401);
  assert.equal(noSuchAccount.status, 401);
  assert.deepEqual(noSuchAccount.data, wrongPassword.data);
});

/*
 * 검증은 PBKDF2 100,000회로 이뤄진다. 길이 제한이 없으면 인증 없이 요청 하나로
 * 임의 길이의 입력을 그 해시 함수에 밀어 넣을 수 있다. 스키마에서 잘라야 한다 —
 * 라우트에 닿은 뒤에는 이미 늦다.
 */
test("지나치게 긴 비밀번호는 해시 전에 거절한다", async () => {
  const { email } = await signup();
  const res = await req("POST", "/auth/login", {
    body: { email, password: "a".repeat(5000) },
  });
  assert.equal(res.status, 400, `400이 아니라 ${res.status}`);
});

/*
 * 접속 기록은 요청당 한 행이 쌓인다. 경로와 클라이언트 힌트 헤더는 전부 요청자가
 * 정하는 값이라, 상한이 없으면 인증 없이도 요청 하나에 원하는 만큼의 바이트를
 * D1에 눌러 담을 수 있다. 보관 기간은 90일이다.
 */
test("접속 기록에 남는 요청자 제어 문자열에는 상한이 있다", async () => {
  const marker = uniq("longpath-");
  const longPath = `/${marker}${"a".repeat(4000)}`;
  const longHint = "b".repeat(500);

  await req("GET", longPath, {
    headers: { "X-Client-Platform": longHint, "X-Client-Version": longHint },
  });
  // 기록은 waitUntil 안에서 쓰인다.
  await new Promise((r) => setTimeout(r, 800));

  const db = openTestDb();
  try {
    const row = db
      .prepare(
        "SELECT path, platform, app_version FROM access_logs WHERE path LIKE ? ORDER BY created_at DESC LIMIT 1",
      )
      .get(`/${marker}%`);
    assert.ok(row, "접속 기록이 남지 않았다");
    assert.ok(
      row.path.length <= 512,
      `path가 잘리지 않았다: ${row.path.length}자`,
    );
    assert.ok(
      row.path.startsWith(`/${marker}`),
      "path 앞부분이 보존되지 않았다",
    );
    assert.ok(
      row.platform.length <= 32,
      `platform이 잘리지 않았다: ${row.platform.length}자`,
    );
    assert.ok(
      row.app_version.length <= 32,
      `app_version이 잘리지 않았다: ${row.app_version.length}자`,
    );
  } finally {
    db.close();
  }
});

/*
 * 푸시 토큰은 사람이 아니라 기기를 가리킨다. 한 기기를 두 계정이 쓰면(중고 거래,
 * 기기 대여) 예전 주인의 알림이 새 주인의 잠금화면에 계속 뜬다. 마지막으로 등록한
 * 계정 하나만 그 토큰을 쥐어야 한다.
 */
test("푸시 토큰은 마지막에 등록한 계정 하나에만 묶인다", async () => {
  const first = await signup();
  const second = await signup();
  const deviceToken = `ExponentPushToken[${uniq("dev")}]`;

  const a = await req("PUT", "/push/token", {
    token: first.token,
    body: { token: deviceToken },
  });
  assert.equal(a.status, 200, `첫 등록 실패: ${JSON.stringify(a.data)}`);

  const b = await req("PUT", "/push/token", {
    token: second.token,
    body: { token: deviceToken },
  });
  assert.equal(b.status, 200, `두 번째 등록 실패: ${JSON.stringify(b.data)}`);

  const db = openTestDb();
  try {
    const holders = db
      .prepare("SELECT id FROM users WHERE expo_push_token = ?")
      .all(deviceToken)
      .map((row) => row.id);
    assert.deepEqual(
      holders,
      [second.data.user.id],
      "토큰을 쥔 계정이 마지막 등록자 하나가 아니다",
    );
  } finally {
    db.close();
  }
});
