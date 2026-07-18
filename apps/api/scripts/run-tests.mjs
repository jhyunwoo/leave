// API 통합 테스트 러너.
// 격리된 로컬 상태(--persist-to)로 wrangler dev를 띄우고, 마이그레이션을 적용한 뒤
// node:test 기반 통합 테스트를 실행하고, 끝나면 서버를 정리한다.
// 별도 의존성 없이 Node 내장 테스트 러너만 사용한다.
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
function shutdown() {
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
    .filter((f) => f.endsWith(".test.mjs"))
    .map((f) => path.join("test", f));

  const result = run("node", ["--test", ...testFiles], {
    env: { ...process.env, API_URL: BASE },
  });

  shutdown();
  process.exit(result.status ?? 1);
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
