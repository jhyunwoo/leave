// API 통합 테스트 러너.
// 격리된 로컬 상태(--persist-to)로 wrangler dev를 띄우고, 마이그레이션을 적용한 뒤
// node:test 기반 통합 테스트를 실행하고, 끝나면 서버를 정리한다.
// 별도 의존성 없이 Node 내장 테스트 러너만 사용한다.
import { startMailServer } from "../test/mail-server.mjs";
import { spawn, spawnSync } from "node:child_process";
import { rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(__dirname, "..");
const PORT = Number(process.env.TEST_PORT ?? 8799);
const STATE_DIR = path.join(apiDir, ".wrangler", "test-state");
const BASE = `http://localhost:${PORT}`;

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, {
    cwd: apiDir,
    stdio: "inherit",
    encoding: "utf8",
    ...opts,
  });
}

async function waitForHealth(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return true;
    } catch {
      // 아직 준비 안 됨
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let devProc;
let mailServer;
function shutdown() {
  mailServer?.close();
  if (devProc && devProc.pid && !devProc.killed) {
    try {
      // 프로세스 그룹 전체(-pid) 종료 — workerd 자식까지 정리
      process.kill(-devProc.pid, "SIGTERM");
    } catch {
      try {
        devProc.kill("SIGTERM");
      } catch {
        /* noop */
      }
    }
  }
}

async function main() {
  // 1. 격리된 테스트 상태를 깨끗이 초기화
  rmSync(STATE_DIR, { recursive: true, force: true });

  // 2. 마이그레이션 적용 (테스트 전용 상태 디렉터리)
  const migrate = run("npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "leave-db",
    "--local",
    "--persist-to",
    STATE_DIR,
  ]);
  if (migrate.status !== 0) {
    console.error("마이그레이션 실패");
    process.exit(1);
  }

  mailServer = await startMailServer(PORT + 1);

  // 3. dev 서버 기동 (프로세스 그룹으로 띄워 정리를 쉽게)
  devProc = spawn(
    "npx",
    [
      "wrangler",
      "dev",
      "--port",
      String(PORT),
      "--persist-to",
      STATE_DIR,
      "--local",
      "--var",
      "RESEND_API_KEY:test-resend-key",
      "--var",
      `RESEND_API_URL:http://127.0.0.1:${PORT + 1}`,
      // 스위트 전체가 한 IP에서 돈다. IP 버킷을 쓰는 가입·로그인만 상한을 풀어
      // 두고, 사용자별 버킷인 나머지는 실제 값 그대로 검증한다.
      "--var",
      'RATE_LIMITS:{"signup":100000,"login":100000}',
    ],
    { cwd: apiDir, detached: true, stdio: "ignore" },
  );

  const ready = await waitForHealth();
  if (!ready) {
    console.error("dev 서버가 시간 내에 준비되지 않았습니다");
    shutdown();
    process.exit(1);
  }

  // 4. node:test 실행 (test/ 하위의 *.test.mjs)
  const testFiles = readdirSync(path.join(apiDir, "test"))
    .filter(
      (f) =>
        f.endsWith(".test.mjs") &&
        (!process.env.TEST_FILES ||
          process.env.TEST_FILES.split(",").includes(f)),
    )
    .map((f) => path.join("test", f));

  // 모든 파일이 같은 격리 D1을 사용하므로 파일 간 병렬 실행은 상태 경합을 만든다.
  // 메일 테스트 서버가 응답해야 하므로 spawnSync로 이벤트 루프를 막지 않는다.
  const status = await new Promise((resolve, reject) => {
    const tests = spawn(
      "node",
      ["--test", "--test-concurrency=1", ...testFiles],
      {
        cwd: apiDir,
        stdio: "inherit",
        env: {
          ...process.env,
          API_URL: BASE,
          MAIL_URL: `http://127.0.0.1:${PORT + 1}`,
        },
      },
    );
    tests.on("error", reject);
    tests.on("exit", resolve);
  });

  shutdown();
  process.exit(status ?? 1);
}

process.on("SIGINT", () => {
  shutdown();
  process.exit(130);
});

main().catch((err) => {
  console.error(err);
  shutdown();
  process.exit(1);
});
