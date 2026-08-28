import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const outputDirectory = path.resolve(process.argv[2] ?? "dist");

function collectAssets(directory) {
  const assets = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) assets.push(...collectAssets(absolutePath));
    else if (/\.(?:hbc|js|map)$/.test(entry.name)) assets.push(absolutePath);
  }
  return assets;
}

function fail(message) {
  console.error(`Sentry update artifact validation failed: ${message}`);
  process.exit(1);
}

if (
  !fs.existsSync(outputDirectory) ||
  !fs.statSync(outputDirectory).isDirectory()
) {
  fail(`${outputDirectory} is not an export directory.`);
}

const assets = collectAssets(outputDirectory);
const groups = new Map();
for (const asset of assets) {
  const group = asset.endsWith(".map") ? asset.slice(0, -4) : asset;
  const members = groups.get(group) ?? [];
  members.push(asset);
  groups.set(group, members);
}

if (groups.size === 0) fail("no JavaScript/Hermes bundles were found.");

for (const [group, members] of groups) {
  const sourceMapPath = members.find((member) => member.endsWith(".map"));
  const bundlePath = members.find(
    (member) => member.endsWith(".js") || member.endsWith(".hbc"),
  );
  if (!bundlePath) fail(`source map has no matching bundle: ${group}`);
  if (!sourceMapPath) fail(`bundle has no matching source map: ${group}`);

  let sourceMap;
  try {
    sourceMap = JSON.parse(fs.readFileSync(sourceMapPath, "utf8"));
  } catch {
    fail(`source map is not valid JSON: ${sourceMapPath}`);
  }
  if (!sourceMap.debugId && !sourceMap.debug_id) {
    fail(`source map has no Sentry Debug ID: ${sourceMapPath}`);
  }
}

const upload = spawnSync(
  "pnpm",
  ["exec", "sentry-expo-upload-sourcemaps", outputDirectory],
  { stdio: "inherit", env: process.env },
);
if (upload.error) {
  console.error(upload.error.message);
  process.exit(1);
}
process.exit(upload.status ?? 1);
