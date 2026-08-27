import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { csvCell } from "../worker/csv.ts";

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

/**
 * CSV 본문을 셀 값으로 푼다. 따옴표 안의 `,`와 `""`를 구분해야 하므로
 * 줄 단위로 자르는 것으로는 부족하다 — 감사 로그 칸에는 JSON이 통째로 들어간다.
 */
function csvCells(csv) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const ch = csv[i];
    if (quoted) {
      if (ch === '"') {
        if (csv[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === "," || ch === "\r" || ch === "\n") {
      if (cell !== "") cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  if (cell !== "") cells.push(cell);
  return cells;
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

  /*
   * 부대 수정: 바꿀 값이 하나도 없는 본문.
   *
   * 드리즐의 `set({})`은 "No values to set"으로 던진다. 관리자 화면은 바뀐 필드만
   * 보내므로, 아무것도 고치지 않고 저장을 누르면 그대로 500이 됐다.
   */
  const unitCreated = await request("/units", {
    method: "POST",
    body: JSON.stringify({
      name: `관리자 테스트 부대 ${unique}`,
      description: "빈 PATCH 회귀 테스트",
      maxLeaveCount: 3,
      creatorId: userId,
      adminId: userId,
    }),
  });
  assert.equal(unitCreated.response.status, 201);
  const unitId = unitCreated.body.item.id;

  const emptyPatch = await request(`/units/${unitId}`, {
    method: "PATCH",
    body: JSON.stringify({}),
  });
  assert.equal(
    emptyPatch.response.status,
    200,
    `빈 본문 PATCH가 ${emptyPatch.response.status}였다`,
  );
  assert.equal(emptyPatch.body.item.id, unitId);
  assert.equal(emptyPatch.body.item.name, `관리자 테스트 부대 ${unique}`);

  /*
   * CSV 내보내기의 수식 주입.
   *
   * 감사 로그는 요청의 User-Agent를 그대로 한 칸에 담아 내보낸다. 아래 왕복은
   * "요청자가 정한 문자열이 CSV 한 칸이 되고, 그 칸이 escape된다"까지를 잡는다.
   *
   * 선행 공백을 건너뛰는 쪽은 HTTP로 재현되지 않는다 — 헤더 값은 전송 과정에서
   * 앞의 공백이 잘리고 본문 문자열은 스키마가 `trim()`으로 다듬기 때문이다.
   * 그래서 그 갈래는 순수 함수를 직접 부른다(아래 csvCell 단위 검사).
   */
  const hostileUserAgent = "\t=cmd|'/c calc'!A1";
  const flagged = await request(`/units/${unitId}`, {
    method: "PATCH",
    body: JSON.stringify({ description: "CSV 수식 주입 회귀 테스트" }),
    headers: { "User-Agent": hostileUserAgent },
  });
  assert.equal(flagged.response.status, 200);

  const auditCsv = await request("/audit-logs/export");
  assert.equal(auditCsv.response.status, 200);
  assert.equal(typeof auditCsv.body, "string");
  const hostileCells = csvCells(auditCsv.body).filter((cell) =>
    cell.includes("=cmd|"),
  );
  assert.ok(hostileCells.length > 0, "감사 로그 CSV에서 대상 값을 찾지 못했다");
  for (const cell of hostileCells) {
    assert.equal(
      cell[0],
      "'",
      `수식으로 읽히는 셀이 그대로 남았다: ${JSON.stringify(cell)}`,
    );
  }

  /*
   * `trim()`은 공백과 줄바꿈만 걷어낸다. `\u0001` 같은 C0 제어문자는 표시명
   * (`users.name`)에 남은 채로 CSV 한 칸에 실릴 수 있다. 앞글자만 보는 검사는
   * 그 한 글자에 그대로 뚫린다.
   */
  for (const lead of ["", "\t", " ", "\u0001", "\u001f", "\r\n"]) {
    for (const trigger of ["=", "+", "-", "@"]) {
      const cell = csvCell(`${lead}${trigger}cmd|'/c calc'!A1`);
      assert.equal(
        cell.slice(0, 2),
        `"'`,
        `수식으로 읽히는 셀이 escape되지 않았다: ${JSON.stringify(cell)}`,
      );
    }
  }
  // 평범한 값에는 따옴표를 덧붙이지 않는다 — 붙이면 내보낸 표가 못 쓰게 된다.
  assert.equal(
    csvCell("2026-08-26T00:00:00.000Z"),
    '"2026-08-26T00:00:00.000Z"',
  );
  assert.equal(csvCell("관리자 테스트 사용자"), '"관리자 테스트 사용자"');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');

  const unitRemoved = await request(`/units/${unitId}`, { method: "DELETE" });
  assert.equal(unitRemoved.response.status, 200);

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
    "관리자 API 통합 테스트 통과: 인증, 비밀번호 변경, CRUD, 알림, 목록 라우트, 빈 본문 PATCH, CSV 수식 주입, 감사 로그, 로그아웃\n",
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
