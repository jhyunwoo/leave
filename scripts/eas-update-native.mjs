import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

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

// Sensitive EAS variables are intentionally not copied into the repository.
// Check their presence in the selected EAS environment before publishing, so
// an update cannot go live when its source maps are guaranteed to be orphaned.
const preflight = run("pnpm", [
  "exec",
  "eas",
  "env:exec",
  "--environment",
  target.environment,
  `node ../../scripts/verify-sentry-env.mjs ${target.appEnvironment}`,
]);
if (preflight !== 0) process.exit(preflight);

const update = run("pnpm", [
  "exec",
  "eas",
  "update",
  "--channel",
  target.channel,
  "--environment",
  target.environment,
]);
if (update !== 0) process.exit(update);

const upload = run("pnpm", [
  "exec",
  "eas",
  "env:exec",
  "--environment",
  target.environment,
  "node ../../scripts/upload-sentry-update-artifacts.mjs dist",
]);
if (upload !== 0) {
  console.error(
    "\nERROR: The OTA update is published, but its Sentry source-map upload failed. " +
      "Treat this release as unsymbolicated and retry the upload before continuing.",
  );
  process.exit(upload);
}
