import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const baseUrl = "http://[::1]:5174";
const email = "admin.test@leave.local";
const temporaryPassword = "LeaveAdmin!2026";
const finalPassword = "LeaveAdmin!2026Changed";
let cookie = "";

const server = spawn("node", ["scripts/test-server.mjs"], {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverOutput = "";
server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

async function waitForServer() {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`테스트 서버가 종료되었습니다.\n${serverOutput}`);
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      // 서버가 준비될 때까지 재시도한다.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`테스트 서버 준비 시간이 초과됐습니다.\n${serverOutput}`);
}

async function request(pathname, init = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (!["GET", "HEAD"].includes(init.method ?? "GET")) {
    headers.set("X-Admin-Request", "1");
  }
  if (cookie) headers.set("Cookie", cookie);
  const response = await fetch(`${baseUrl}/api${pathname}`, {
    ...init,
    headers,
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) cookie = setCookie.split(";", 1)[0];
  const contentType = response.headers.get("content-type") ?? "";
  const body = contentType.includes("application/json")
    ? await response.json()
    : await response.text();
  return { response, body };
}

async function run() {
  await waitForServer();

  const health = await request("/health");
  assert.equal(health.response.status, 200);
  assert.equal(health.body.status, "ok");

  const anonymous = await request("/auth/me");
  assert.equal(anonymous.response.status, 401);

  const missingCsrf = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: temporaryPassword }),
  });
  assert.equal(missingCsrf.status, 403);

  const login = await request("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password: temporaryPassword }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.admin.mustChangePassword, true);
  assert.ok(cookie.startsWith("leave_admin_session="));

  const blockedOverview = await request("/overview");
  assert.equal(blockedOverview.response.status, 403);
  assert.equal(blockedOverview.body.code, "PASSWORD_CHANGE_REQUIRED");

  const changed = await request("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({
      currentPassword: temporaryPassword,
      newPassword: finalPassword,
    }),
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.admin.mustChangePassword, false);

  const overview = await request("/overview");
  assert.equal(overview.response.status, 200);
  assert.equal(typeof overview.body.summary.totalUsers, "number");

  const unique = Date.now();
  const created = await request("/users", {
    method: "POST",
    body: JSON.stringify({
      email: `admin-e2e-${unique}@leave.local`,
      password: "UserTemporary!2026",
      name: "관리자 테스트 사용자",
      branch: "army",
      enlistedAt: "2026-01-01",
      dischargeAt: "2027-06-30",
      signupRank: "private",
      unitId: null,
      dataConsent: true,
    }),
  });
  assert.equal(created.response.status, 201);
  const userId = created.body.item.id;
  assert.ok(userId);

  const updated = await request(`/users/${userId}`, {
    method: "PATCH",
    body: JSON.stringify({ name: "수정된 테스트 사용자" }),
  });
  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.item.name, "수정된 테스트 사용자");

  const listed = await request(
    `/users?q=${encodeURIComponent(String(unique))}`,
  );
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.items.length, 1);

  // 알림은 사용자를 지우기 전에 확인한다(대상 사용자가 있어야 발송된다).
  // 목록 라우트 네 개는 각각 다른 모듈에 있다. 하나라도 마운트에서 빠지면
  // 화면에서는 빈 표로만 보이고 조용히 넘어가므로 여기서 함께 짚는다.
  const notificationCreated = await request("/notifications", {
    method: "POST",
    body: JSON.stringify({
      userId,
      title: "관리자 테스트 알림",
      body: "통합 테스트에서 만든 알림입니다",
      sendPush: false,
    }),
  });
  assert.equal(notificationCreated.response.status, 201);
  const notificationId = notificationCreated.body.item.id;

  const notificationRemoved = await request(
    `/notifications/${notificationId}`,
    {
      method: "DELETE",
    },
  );
  assert.equal(notificationRemoved.response.status, 200);

  for (const resource of [
    "/leaves",
    "/notifications",
    "/unit-invites",
    "/content-reports",
  ]) {
    const list = await request(resource);
    assert.equal(
      list.response.status,
      200,
      `${resource} 목록이 200이어야 한다`,
    );
    assert.ok(
      Array.isArray(list.body.items),
      `${resource} items가 배열이어야 한다`,
    );
    assert.equal(typeof list.body.meta.total, "number");
  }

  const removed = await request(`/users/${userId}`, { method: "DELETE" });
  assert.equal(removed.response.status, 200);

  const audits = await request(`/audit-logs?entityId=${userId}&pageSize=20`);
  assert.equal(audits.response.status, 200);
  assert.deepEqual(
    new Set(audits.body.items.map((item) => item.action)),
    new Set(["create", "update", "delete"]),
  );

  const logout = await request("/auth/logout", { method: "POST" });
  assert.equal(logout.response.status, 200);

  process.stdout.write(
    "관리자 API 통합 테스트 통과: 인증, 비밀번호 변경, CRUD, 알림, 목록 라우트, 감사 로그, 로그아웃\n",
  );
}

try {
  await run();
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
  );
  process.stderr.write(serverOutput);
  process.exitCode = 1;
} finally {
  server.kill("SIGTERM");
}
