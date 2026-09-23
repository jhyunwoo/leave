import assert from "node:assert/strict";
import { test } from "node:test";
import { req, uniq, openTestDb, runScheduled } from "./helpers.mjs";

test("신규 계정은 인증 전 서비스 API와 온보딩 변경을 사용할 수 없다", async () => {
  const created = await req("POST", "/auth/signup", {
    body: {
      email: `${uniq("verify")}@test.com`,
      password: "password123",
      dataConsent: true,
    },
  });
  assert.equal(created.status, 201);
  const token = created.data.token;
  const status = await req("GET", "/auth/onboarding", { token });
  assert.equal(status.data.emailVerified, false);
  for (const [method, path] of [
    ["GET", "/leaves/mine"],
    ["GET", "/auth/me"],
    ["POST", "/auth/onboarding/complete"],
    ["GET", "/auth/passkeys"],
  ]) {
    const blocked = await req(method, path, { token });
    assert.equal(blocked.status, 403, path);
    assert.equal(blocked.data.code, "email_verification_required");
  }
  const bootstrap = await req("GET", "/auth/bootstrap", { token });
  assert.equal(bootstrap.data.me, null);
  assert.equal(bootstrap.data.onboarding.emailVerified, false);
});

async function pending(prefix = "verify") {
  const email = `${uniq(prefix)}@test.com`;
  const created = await req("POST", "/auth/signup", {
    body: { email, password: "password123", dataConsent: true },
  });
  assert.equal(created.status, 201);
  return { email, token: created.data.token };
}
async function send(account) {
  return req("POST", "/auth/email-verification/send", { token: account.token });
}
async function codeFor(account) {
  const messages = await fetch(
    `${process.env.MAIL_URL}?email=${encodeURIComponent(account.email)}`,
  ).then((r) => r.json());
  return messages.at(-1)?.text.match(/\b[0-9]{6}\b/)?.[0];
}
async function verify(account, code) {
  return req("POST", "/auth/email-verification/verify", {
    token: account.token,
    body: { code },
  });
}
function mutateChallenge(account, expression) {
  const db = openTestDb();
  try {
    db.prepare(
      `UPDATE email_verifications SET ${expression} WHERE user_id = (SELECT id FROM users WHERE email = ?)`,
    ).run(account.email);
  } finally {
    db.close();
  }
}

test("Resend 메일의 코드로 인증, 해시 저장, 재사용 방지, 재로그인 상태 유지", async () => {
  const account = await pending();
  assert.equal((await send(account)).status, 200);
  const code = await codeFor(account);
  assert.match(code, /^[0-9]{6}$/);
  const [mail] = await fetch(
    `${process.env.MAIL_URL}?email=${encodeURIComponent(account.email)}`,
  ).then((r) => r.json());
  assert.ok(mail.html.includes(`>${code}</div>`));
  const db = openTestDb();
  try {
    const row = db
      .prepare(
        "SELECT * FROM email_verifications WHERE user_id = (SELECT id FROM users WHERE email = ?)",
      )
      .get(account.email);
    assert.match(row.code_hash, /^[a-f0-9]{64}$/);
    assert.notEqual(row.code_hash, code);
  } finally {
    db.close();
  }
  assert.equal((await verify(account, code)).status, 200);
  assert.equal((await verify(account, code)).status, 400);
  const login = await req("POST", "/auth/login", {
    body: { email: account.email, password: "password123" },
  });
  const status = await req("GET", "/auth/onboarding", {
    token: login.data.token,
  });
  assert.equal(status.data.emailVerified, true);
  assert.equal(
    (await req("GET", "/auth/me", { token: login.data.token })).status,
    428,
  );
});

test("동시 발송 제한과 재발송 시 이전 코드 무효화", async () => {
  const account = await pending();
  const results = await Promise.all([send(account), send(account)]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 429]);
  const previous = await codeFor(account);
  mutateChallenge(account, "created_at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await send(account)).status, 200);
  const current = await codeFor(account);
  // 극히 드물게 같은 숫자가 다시 나올 수 있어, 이전 코드 판정은 서로 다를 때 확인한다.
  if (previous !== current)
    assert.equal((await verify(account, previous)).status, 400);
  assert.equal((await verify(account, current)).status, 200);
});

test("만료·다른 계정 코드·시도 횟수 초과는 인증하지 않는다", async () => {
  const account = await pending();
  const other = await pending();
  assert.equal((await send(account)).status, 200);
  const code = await codeFor(account);
  assert.equal((await verify(other, code)).status, 400);
  mutateChallenge(account, "expires_at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await verify(account, code)).status, 400);
  mutateChallenge(account, "created_at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await send(account)).status, 200);
  const current = await codeFor(account);
  const wrong = current === "000000" ? "111111" : "000000";
  for (let i = 0; i < 5; i++)
    assert.equal((await verify(account, wrong)).status, 400);
  assert.equal((await verify(account, current)).status, 400);
  assert.equal(
    (await req("GET", "/auth/onboarding", { token: account.token })).data
      .emailVerified,
    false,
  );
});

test("동시 코드 소비는 한 번만 성공한다", async () => {
  const account = await pending();
  await send(account);
  const code = await codeFor(account);
  const results = await Promise.all([
    verify(account, code),
    verify(account, code),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
});

test("메일 발송 실패는 인증되지 않고 제공자 오류를 노출하지 않는다", async () => {
  const account = await pending("mail-failure");
  const sent = await send(account);
  assert.equal(sent.status, 503);
  assert.ok(!JSON.stringify(sent.data).includes("Private provider"));
  assert.equal(
    (await req("GET", "/auth/onboarding", { token: account.token })).data
      .emailVerified,
    false,
  );
  assert.equal(
    (await req("POST", "/auth/email-verification/send")).status,
    401,
  );
  assert.equal((await verify(account, "12345")).status, 400);
});

test("마이그레이션 이전 계정만 인증 완료로 전환하고 신규 계정은 미인증으로 남긴다", async () => {
  const { DatabaseSync } = await import("node:sqlite");
  const { readFileSync, readdirSync } = await import("node:fs");
  const directory = new URL("../migrations/", import.meta.url);
  const db = new DatabaseSync(":memory:");
  try {
    for (const file of readdirSync(directory)
      .filter((f) => f.endsWith(".sql") && f < "0034")
      .sort()) {
      db.exec(readFileSync(new URL(file, directory), "utf8"));
    }
    const insert = db.prepare(
      "INSERT INTO users (id, email, password_hash, password_salt, name, branch, enlisted_at, discharge_at, signup_rank, created_at) VALUES (?, ?, 'hash', 'salt', 'old user', 'army', '2026-01-01', '2027-01-01', 'private', '2026-01-01T00:00:00.000Z')",
    );
    insert.run("existing", "existing@test.com");
    db.exec(
      readFileSync(new URL("0034_email_verification.sql", directory), "utf8"),
    );
    insert.run("new", "new@test.com");
    assert.ok(
      db
        .prepare("SELECT email_verified_at FROM users WHERE id = 'existing'")
        .get().email_verified_at,
    );
    assert.equal(
      db.prepare("SELECT email_verified_at FROM users WHERE id = 'new'").get()
        .email_verified_at,
      null,
    );
  } finally {
    db.close();
  }
});

test("미인증 계정도 로그아웃·삭제할 수 있고 인증 레코드를 남기지 않는다", async () => {
  const account = await pending();
  await send(account);
  assert.equal(
    (await req("POST", "/auth/logout", { token: account.token })).status,
    200,
  );
  assert.equal((await verify(account, "123456")).status, 401);
  const login = await req("POST", "/auth/login", {
    body: { email: account.email, password: "password123" },
  });
  assert.equal(
    (await req("DELETE", "/auth/account", { token: login.data.token })).status,
    200,
  );
  const db = openTestDb();
  try {
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM email_verifications WHERE user_id NOT IN (SELECT id FROM users)",
        )
        .get().n,
      0,
    );
  } finally {
    db.close();
  }
});

test("발송은 계정별 시간당 상한을 지키고 만료된 코드는 정리한다", async () => {
  const account = await pending();
  for (let i = 0; i < 5; i++) {
    assert.equal((await send(account)).status, 200);
    mutateChallenge(account, "created_at = '2000-01-01T00:00:00.000Z'");
  }
  assert.equal((await send(account)).status, 429);
  mutateChallenge(account, "expires_at = '2000-01-01T00:00:00.000Z'");
  await runScheduled();
  const db = openTestDb();
  try {
    assert.equal(
      db
        .prepare(
          "SELECT count(*) AS n FROM email_verifications WHERE user_id = (SELECT id FROM users WHERE email = ?)",
        )
        .get(account.email).n,
      0,
    );
  } finally {
    db.close();
  }
});

async function linkFor(account) {
  const messages = await fetch(
    `${process.env.MAIL_URL}?email=${encodeURIComponent(account.email)}`,
  ).then((r) => r.json());
  const link = messages.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  assert.ok(link, "메일에 인증 링크가 있다");
  assert.equal(new URL(link).origin, new URL(process.env.API_URL).origin);
  assert.ok(messages.at(-1).html.includes(link.replaceAll("&", "&amp;")));
  return new URL(link);
}
function submitLink(fields) {
  return fetch(`${process.env.API_URL}/auth/verify-email`, {
    method: "POST",
    body: new URLSearchParams(fields),
  });
}
async function emailVerified(account) {
  return (await req("GET", "/auth/onboarding", { token: account.token })).data
    .emailVerified;
}

test("메일 버튼 링크는 열기만 해서는 인증하지 않고, 확인 POST로 인증한다", async () => {
  const account = await pending("link");
  assert.equal((await send(account)).status, 200);
  const link = await linkFor(account);
  assert.equal(link.pathname, "/auth/verify-email");

  const page = await fetch(
    `${process.env.API_URL}${link.pathname}${link.search}`,
  );
  assert.equal(page.status, 200);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(await page.text(), /<form method="post"/);
  assert.equal(await emailVerified(account), false);

  const fields = Object.fromEntries(link.searchParams);
  const done = await submitLink(fields);
  assert.equal(done.status, 200);
  assert.match(await done.text(), /이메일 인증을 마쳤어요/);
  assert.equal(await emailVerified(account), true);
  // 스캐너가 먼저 열었거나 두 번 누른 경우에도 성공 화면을 보인다.
  assert.equal((await submitLink(fields)).status, 200);
});

test("서명이 다르거나 만료되거나 이전 메일의 링크면 인증하지 않는다", async () => {
  const account = await pending("link-bad");
  const other = await pending("link-other");
  await send(account);
  await send(other);
  const fields = Object.fromEntries((await linkFor(account)).searchParams);
  const otherFields = Object.fromEntries((await linkFor(other)).searchParams);

  const tampered = {
    ...fields,
    s: fields.s.replace(/.$/, (d) => (d === "0" ? "1" : "0")),
  };
  assert.equal((await submitLink(tampered)).status, 400);
  // 다른 계정의 서명을 가져와도 쓸 수 없다.
  assert.equal((await submitLink({ ...fields, s: otherFields.s })).status, 400);
  assert.equal((await submitLink({ u: "x", c: "y", s: "z" })).status, 400);
  const malformed = await fetch(
    `${process.env.API_URL}/auth/verify-email?u=%3Cscript%3E`,
  );
  assert.equal(malformed.status, 400);
  assert.ok(!(await malformed.text()).includes("<script>alert"));

  mutateChallenge(account, "expires_at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await submitLink(fields)).status, 400);
  // 재발송하면 이전 메일의 링크는 쓸 수 없다.
  mutateChallenge(account, "created_at = '2000-01-01T00:00:00.000Z'");
  assert.equal((await send(account)).status, 200);
  assert.equal((await submitLink(fields)).status, 400);
  assert.equal(await emailVerified(account), false);

  const current = Object.fromEntries((await linkFor(account)).searchParams);
  assert.equal((await submitLink(current)).status, 200);
  assert.equal(await emailVerified(account), true);
});
