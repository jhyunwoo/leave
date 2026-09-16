import assert from "node:assert/strict";
import { test } from "node:test";
import {
  mkdirSync,
  mkdtempSync,
  writeFileSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { verifyProductionOta } from "../verify-production-ota.mjs";

function verify({
  mismatch,
  invalid = {},
  missing = false,
  fail = false,
} = {}) {
  return verifyProductionOta({
    env: missing
      ? {}
      : {
          EAS_PRODUCTION_IOS_BUILD_ID: "ios-id",
          EAS_PRODUCTION_ANDROID_BUILD_ID: "android-id",
        },
    projectId: "project",
    log() {},
    readJson(args) {
      if (fail) throw new Error("EAS unavailable");
      if (args[0] === "build:view") {
        const platform = args[1].split("-")[0];
        return {
          id: args[1],
          project: { id: "project" },
          platform: platform.toUpperCase(),
          status: "FINISHED",
          distribution: "STORE",
          buildProfile: "production",
          channel: "production",
          runtimeVersion: platform,
          ...invalid,
        };
      }
      assert.ok(args.includes("--environment"));
      assert.ok(args.includes("production"));
      return { hash: args[2] === mismatch ? "changed" : args[2] };
    },
  });
}

test("OTA requires matching runtimes on both platforms", () => {
  assert.equal(verify().compatible, true);
  for (const mismatch of ["ios", "android"]) {
    assert.equal(verify({ mismatch }).compatible, false);
  }
  assert.equal(verify({ missing: true }).compatible, false);
});

test("untrusted build metadata and EAS errors fail closed", () => {
  for (const invalid of [
    { project: { id: "other" } },
    { platform: "ANDROID" },
    { status: "ERRORED" },
    { distribution: "INTERNAL" },
    { buildProfile: "preview" },
    { channel: "preview" },
    { runtimeVersion: null },
    { runtimeVersion: "" },
    { id: "wrong" },
  ])
    assert.throws(() => verify({ invalid }), /Invalid production store build/);
  assert.throws(() => verify({ fail: true }), /EAS unavailable/);
});

function runDeployment(t, failure, status) {
  const directory = mkdtempSync(path.join(tmpdir(), "leave-deploy-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const log = path.join(directory, "commands.jsonl");
  writeFileSync(
    path.join(directory, "pnpm"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
fs.appendFileSync(process.env.DEPLOY_TEST_LOG, JSON.stringify(args) + "\\n");
if (args.includes(process.env.DEPLOY_TEST_FAILURE)) process.exit(Number(process.env.DEPLOY_TEST_STATUS));
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    process.execPath,
    [new URL("../deploy-production.mjs", import.meta.url).pathname],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        DEPLOY_TEST_LOG: log,
        DEPLOY_TEST_FAILURE: failure,
        DEPLOY_TEST_STATUS: String(status),
      },
    },
  );
  return {
    ...result,
    commands: readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line)),
  };
}

test("combined command deploys web/admin and production OTA after the quality gate", (t) => {
  const result = runDeployment(t, "unused", 0);
  assert.equal(result.status, 0);
  assert.deepEqual(result.commands, [
    ["quality"],
    ["--filter", "@leave/web", "run", "deploy"],
    ["--filter", "@leave/admin", "run", "deploy"],
    ["native:eas:update:production"],
  ]);
});

test("intentional native skip preserves successful web/admin deployment", (t) => {
  const result = runDeployment(t, "native:eas:update:production", 2);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /native OTA skipped/);
});

for (const [failure, count] of [
  ["quality", 1],
  ["@leave/web", 2],
  ["@leave/admin", 3],
  ["native:eas:update:production", 4],
]) {
  test(`failure at ${failure} stops remaining steps and returns nonzero`, (t) => {
    const result = runDeployment(t, failure, 1);
    assert.equal(result.status, 1);
    assert.equal(result.commands.length, count);
  });
}

function runOta(t, scenario) {
  const directory = mkdtempSync(path.join(tmpdir(), "leave-ota-test-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  // Run a copy in a fixture repo: successful tests must not remove the real dist.
  const scripts = path.join(directory, "scripts");
  const native = path.join(directory, "apps", "native");
  mkdirSync(scripts, { recursive: true });
  mkdirSync(native, { recursive: true });
  for (const name of ["eas-update-native.mjs", "verify-production-ota.mjs"]) {
    writeFileSync(
      path.join(scripts, name),
      readFileSync(new URL(`../${name}`, import.meta.url)),
    );
  }
  writeFileSync(
    path.join(native, "app.json"),
    JSON.stringify({
      expo: {
        runtimeVersion: { policy: "fingerprint" },
        extra: { eas: { projectId: "project" } },
      },
    }),
  );
  writeFileSync(
    path.join(directory, "git"),
    `#!/usr/bin/env node
if (process.argv[2] === "status" && process.env.OTA_TEST_SCENARIO === "dirty") console.log(" M file");
if (process.argv[2] === "log") console.log("release");
`,
    { mode: 0o755 },
  );
  const log = path.join(directory, "commands.jsonl");
  writeFileSync(log, "");
  writeFileSync(
    path.join(directory, "pnpm"),
    `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(4);
fs.appendFileSync(process.env.OTA_TEST_LOG, JSON.stringify(args) + "\\n");
const scenario = process.env.OTA_TEST_SCENARIO;
if (args[0] === "build:view") {
  const platform = args[1].split("-")[0];
  console.log(JSON.stringify({ id: args[1], project: { id: "project" }, platform: platform.toUpperCase(),
    status: "FINISHED", distribution: "STORE", buildProfile: "production", channel: "production", runtimeVersion: platform }));
}
if (args[0] === "fingerprint:generate") console.log(JSON.stringify({ hash: scenario === "mismatch" && args[2] === "android" ? "changed" : args[2] }));
if (args[0] === "env:exec" && args[2].includes("verify-sentry") && scenario === "sentry-error") process.exit(2);
if (args[0] === "update" && scenario === "publish-error") process.exit(2);
`,
    { mode: 0o755 },
  );
  const result = spawnSync(
    process.execPath,
    [path.join(scripts, "eas-update-native.mjs"), "production"],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        OTA_TEST_SCENARIO: scenario,
        OTA_TEST_LOG: log,
        EAS_PRODUCTION_IOS_BUILD_ID: "ios-id",
        EAS_PRODUCTION_ANDROID_BUILD_ID: "android-id",
      },
    },
  );
  return {
    ...result,
    commands: readFileSync(log, "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line)),
  };
}

for (const scenario of ["dirty", "mismatch", "sentry-error"]) {
  test(`${scenario} prevents publishing either platform`, (t) => {
    const result = runOta(t, scenario);
    assert.equal(
      result.status,
      scenario === "sentry-error" ? 1 : 2,
      result.stderr,
    );
    assert.equal(
      result.commands.some((args) => args[0] === "update"),
      false,
    );
  });
}

test("production checks both platforms before publishing and uploads each platform's maps", (t) => {
  const result = runOta(t, "success");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(
    result.commands.map((args) => args[0]),
    [
      "build:view",
      "fingerprint:generate",
      "build:view",
      "fingerprint:generate",
      "env:exec",
      "update",
      "env:exec",
      "update",
      "env:exec",
    ],
  );
  const updates = result.commands.filter((args) => args[0] === "update");
  assert.deepEqual(
    updates.map((args) => args[args.indexOf("--platform") + 1]),
    ["ios", "android"],
  );
});

test("CLI exit 2 during publication is failure, not an intentional skip", (t) => {
  const result = runOta(t, "publish-error");
  assert.equal(result.status, 1);
  assert.equal(
    result.commands.filter((args) => args[0] === "update").length,
    1,
  );
});
