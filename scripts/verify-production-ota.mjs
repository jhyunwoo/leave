const platforms = ["ios", "android"];

// EAS build completion does not prove that a binary is available in the store.
// Operators pin the builds actually released to users, not the latest upload.
export function verifyProductionOta({
  env,
  projectId,
  readJson,
  log = console.log,
}) {
  const ids = platforms.map((platform) =>
    env[`EAS_PRODUCTION_${platform.toUpperCase()}_BUILD_ID`]?.trim(),
  );
  if (ids.some((id) => !id)) {
    return {
      compatible: false,
      reason:
        "Set EAS_PRODUCTION_IOS_BUILD_ID and EAS_PRODUCTION_ANDROID_BUILD_ID to the current store builds.",
    };
  }

  const mismatches = [];
  for (const [index, platform] of platforms.entries()) {
    const build = readJson(["build:view", ids[index], "--json"]);
    if (
      build.id !== ids[index] ||
      build.project?.id !== projectId ||
      build.platform !== platform.toUpperCase() ||
      build.status !== "FINISHED" ||
      build.distribution !== "STORE" ||
      build.buildProfile !== "production" ||
      build.channel !== "production" ||
      typeof build.runtimeVersion !== "string" ||
      !build.runtimeVersion.trim()
    ) {
      throw new Error(
        `Invalid production store build for ${platform}: ${ids[index]}`,
      );
    }
    const fingerprint = readJson([
      "fingerprint:generate",
      "--platform",
      platform,
      "--environment",
      "production",
      "--json",
      "--non-interactive",
    ]);
    if (typeof fingerprint.hash !== "string" || !fingerprint.hash.trim()) {
      throw new Error(`Missing ${platform} fingerprint hash.`);
    }
    log(
      `${platform}: local=${fingerprint.hash}, store=${build.runtimeVersion} (${build.id})`,
    );
    if (fingerprint.hash !== build.runtimeVersion) mismatches.push(platform);
  }
  return mismatches.length
    ? {
        compatible: false,
        reason: `Native runtime changed (${mismatches.join(", ")}); a new store build is required. No app will be published.`,
      }
    : { compatible: true };
}
