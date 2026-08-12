import { spawnSync } from "node:child_process";

function runAgentBrowser(args) {
  return spawnSync("agent-browser", args, { stdio: "inherit" });
}

const diagnosis = runAgentBrowser(["doctor", "--offline", "--quick"]);

if (diagnosis.status === 0) {
  console.log("agent-browser and Chromium are ready.");
  process.exit(0);
}

if (process.platform === "linux" && process.arch === "arm64") {
  console.error(`
Chrome for Testing is not published for Linux ARM64.
Install a system Chromium package, then rerun this command.

Debian/Ubuntu:
  sudo apt-get update
  sudo apt-get install -y chromium

The installed browser is discovered automatically from /usr/bin/chromium.
`);
  process.exit(1);
}

const installation = runAgentBrowser(["install"]);

if (installation.error) {
  console.error(installation.error.message);
  process.exit(1);
}

if (installation.status !== 0) {
  process.exit(installation.status ?? 1);
}

const verification = runAgentBrowser(["doctor", "--offline", "--quick"]);
process.exit(verification.status ?? 1);
