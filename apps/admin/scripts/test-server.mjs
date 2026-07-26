import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

export const TEST_EMAIL = "admin.test@leave.local";
export const TEST_PASSWORD = "LeaveAdmin!2026";

const root = path.resolve(import.meta.dirname, "..");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} 실행에 실패했습니다.`);
  }
}

run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "migrations",
  "apply",
  "leave-db",
  "--local",
]);
run("pnpm", [
  "exec",
  "wrangler",
  "d1",
  "execute",
  "leave-db",
  "--local",
  "--command",
  "DELETE FROM users WHERE email LIKE '%@leave.local';",
]);
run("node", ["scripts/bootstrap-admin.mjs", "--local"], {
  env: {
    ...process.env,
    ADMIN_EMAIL: TEST_EMAIL,
    ADMIN_NAME: "테스트 관리자",
    ADMIN_PASSWORD: TEST_PASSWORD,
  },
});

const server = spawn(
  "pnpm",
  ["exec", "vite", "--host", "::1", "--port", "5174", "--strictPort"],
  {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    stdio: "inherit",
  },
);

const stop = (signal = "SIGTERM") => {
  if (!server.killed) server.kill(signal);
};

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
server.once("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
