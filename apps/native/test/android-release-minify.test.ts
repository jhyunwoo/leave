import { describe, expect, it } from "vitest";
import app from "../app.json";

type PluginEntry = string | [string, Record<string, unknown>];

/** app.json의 느슨한 플러그인 배열에서 설정 객체만 좁혀서 꺼낸다. */
const pluginProps = (name: string): Record<string, unknown> => {
  const entry = (app.expo.plugins as unknown as PluginEntry[]).find(
    (plugin): plugin is [string, Record<string, unknown>] =>
      Array.isArray(plugin) && plugin[0] === name,
  );
  if (!entry) throw new Error(`${name} 플러그인 설정을 찾지 못했다`);
  return entry[1];
};

describe("Android release build", () => {
  it("enables R8 so the release bundle carries a deobfuscation mapping", () => {
    const android = pluginProps("expo-build-properties").android as Record<
      string,
      unknown
    >;
    expect(android.enableMinifyInReleaseBuilds).toBe(true);
  });

  it("ships that mapping to Sentry so Android stack traces stay readable", () => {
    const sentry = pluginProps("@sentry/react-native/expo")
      .experimental_android as Record<string, unknown>;
    expect(sentry.autoUploadProguardMapping).toBe(true);
  });
});
