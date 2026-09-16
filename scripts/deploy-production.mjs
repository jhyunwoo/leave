import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../", import.meta.url));
for (const args of [
  ["quality"],
  ["--filter", "@leave/web", "run", "deploy"],
  ["--filter", "@leave/admin", "run", "deploy"],
  ["native:eas:update:production"],
]) {
  console.log(`\n> pnpm ${args.join(" ")}`);
  const result = spawnSync("pnpm", args, {
    cwd,
    stdio: "inherit",
    env: process.env,
  });
  if (result.error) console.error(result.error.message);
  const status = result.status ?? 1;
  if (args[0] === "native:eas:update:production" && status === 2) {
    console.log(
      "\nProduction: web/admin deployed; native OTA skipped (see reason above).",
    );
    process.exit(0);
  }
  if (status !== 0) {
    console.error(
      `\nProduction deployment stopped at: pnpm ${args.join(" ")}. Earlier deployments are not rolled back.`,
    );
    process.exit(status);
  }
}
console.log(
  "\nProduction: web/admin deployed; iOS/Android OTA published with source maps.",
);
