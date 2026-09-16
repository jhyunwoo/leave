import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFileSync, rmSync } from "node:fs";
import { verifyProductionOta } from "./verify-production-ota.mjs";

const TARGETS = {
  closed: {
    channel: "closed-test",
    environment: "closed-test",
    appEnvironment: "closed-test",
  },
  preview: {
    channel: "preview",
    environment: "preview",
    appEnvironment: "preview",
  },
  production: {
    channel: "production",
    environment: "production",
    appEnvironment: "production",
  },
};

const targetName = process.argv[2];
const target = TARGETS[targetName];

if (!target) {
  console.error(
    `Usage: node scripts/eas-update-native.mjs ${Object.keys(TARGETS).join("|")}`,
  );
  process.exit(2);
}

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const nativeRoot = path.join(repositoryRoot, "apps", "native");

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: nativeRoot,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }
  return result.status ?? 1;
}

// Production must fail closed before either platform is published.
if (targetName === "production") {
  try {
    const status = spawnSync("git", ["status", "--porcelain"], {
      cwd: repositoryRoot,
      encoding: "utf8",
    });
    if (status.error || status.status !== 0)
      throw new Error("Could not inspect the working tree.");
    if (status.stdout.trim()) {
      console.error(
        "Native OTA skipped: commit or stash working-tree changes before publishing.",
      );
      process.exit(2);
    }
    const app = JSON.parse(
      readFileSync(path.join(nativeRoot, "app.json"), "utf8"),
    );
    if (app.expo.runtimeVersion?.policy !== "fingerprint") {
      throw new Error(
        "Production OTA verification requires the fingerprint runtime policy.",
      );
    }
    const result = verifyProductionOta({
      env: process.env,
      projectId: app.expo.extra.eas.projectId,
      readJson(args) {
        const result = spawnSync("pnpm", ["exec", "eas", ...args], {
          cwd: nativeRoot,
          env: process.env,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "inherit"],
          maxBuffer: 20 * 1024 * 1024,
        });
        if (result.error || result.status !== 0) {
          throw new Error(`OTA verification failed: eas ${args[0]}`);
        }
        // `--json` still prints a banner naming the loaded EAS environment,
        // so parse from the first line that opens the document.
        const start = result.stdout.search(/^[[{]/m);
        if (start < 0) {
          throw new Error(`OTA verification found no JSON: eas ${args[0]}`);
        }
        return JSON.parse(result.stdout.slice(start));
      },
    });
    if (!result.compatible) {
      console.error(`Native OTA skipped: ${result.reason}`);
      process.exit(2);
    }
  } catch (error) {
    console.error(`Native OTA skipped: ${error.message}`);
    process.exit(1);
  }
}

// Sensitive EAS variables are intentionally not copied into the repository.
// Check their presence in the selected EAS environment before publishing, so
// an update cannot go live when its source maps are guaranteed to be orphaned.
// `env:exec`는 환경을 **위치 인자**로 받는다(`eas env:exec <environment> <command>`).
// `--environment`로 주면 "Nonexistent flag"로 죽는다 — `eas update` 쪽은 같은 값을
// 플래그로 받으므로 둘을 같은 모양으로 적고 싶어지지만, 그러면 발행이 시작도 못 한다.
const preflight = run("pnpm", [
  "exec",
  "eas",
  "env:exec",
  target.environment,
  `node ../../scripts/verify-sentry-env.mjs ${target.appEnvironment}`,
]);
if (preflight !== 0) process.exit(1);

// 비대화형 셸(에이전트·CI)에서 `eas update`는 메시지를 스스로 물어볼 수 없어
// `--message` 없이는 시작도 하지 않는다. `--auto`는 메시지를 만들어 주지만 **EAS
// 브랜치까지 현재 git 브랜치 이름으로 잡는다** — production 채널에 묶인 브랜치가
// 따로 있으므로 그 길로 가면 엉뚱한 브랜치에 발행된다. 그래서 커밋 제목만 넘긴다.
const message = spawnSync("git", ["log", "-1", "--pretty=%s"], {
  cwd: repositoryRoot,
  encoding: "utf8",
}).stdout?.trim();

// Metro exports one platform at a time to fit the deployment host's memory.
// Upload each platform's maps before the next export replaces dist.
for (const platform of ["ios", "android"]) {
  rmSync(path.join(nativeRoot, "dist"), { recursive: true, force: true });
  const update = run("pnpm", [
    "exec",
    "eas",
    "update",
    "--channel",
    target.channel,
    "--environment",
    target.environment,
    "--platform",
    platform,
    "--non-interactive",
    "--message",
    message || `${targetName} OTA update`,
  ]);
  if (update !== 0) process.exit(1);

  const upload = run("pnpm", [
    "exec",
    "eas",
    "env:exec",
    target.environment,
    "node ../../scripts/upload-sentry-update-artifacts.mjs dist",
  ]);
  if (upload !== 0) {
    console.error(
      `\nERROR: The ${platform} OTA update is published, but its Sentry source-map upload failed. ` +
        "Treat this release as unsymbolicated and retry the upload before continuing.",
    );
    process.exit(1);
  }
}
