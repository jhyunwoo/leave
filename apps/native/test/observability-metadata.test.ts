import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildObservabilityMetadata,
  resolveObservabilityEnvironment,
} from "../src/lib/observability/metadata";

vi.mock("expo-application", () => ({
  applicationId: null,
  nativeApplicationVersion: null,
  nativeBuildVersion: null,
}));
vi.mock("expo-constants", () => ({ default: { expoConfig: null } }));
vi.mock("expo-updates", () => ({
  channel: null,
  createdAt: null,
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  isEnabled: false,
  manifest: {},
  runtimeVersion: null,
  updateId: null,
}));
vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
    constants: { reactNativeVersion: { major: 0, minor: 86, patch: 2 } },
  },
}));

describe("observability metadata", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps configured build environments without mixing production", () => {
    expect(resolveObservabilityEnvironment("preview", false)).toBe("preview");
    expect(resolveObservabilityEnvironment("closed-test", false)).toBe(
      "closed-test",
    );
    expect(resolveObservabilityEnvironment(undefined, true)).toBe(
      "development",
    );
    expect(resolveObservabilityEnvironment(undefined, false)).toBe(
      "production",
    );
  });

  it("creates searchable native build and OTA tags", () => {
    const metadata = buildObservabilityMetadata({
      configuredEnvironment: "preview",
      isDevelopment: false,
      appId: "app.leave.mobile",
      appVersion: "1.0.0",
      buildNumber: "42",
      expoSdkVersion: "57.0.0",
      platform: "ios",
      reactNativeVersion: "0.86.2",
      runtimeVersion: "fingerprint-hash",
      updateChannel: "preview",
      updateId: "update-id",
      updateGroupId: "group-id",
      updateCreatedAt: "2026-08-28T00:00:00.000Z",
      updatesEnabled: true,
      isEmbeddedUpdate: false,
      isEmergencyLaunch: false,
      locale: "ko-KR",
    });

    expect(metadata.environment).toBe("preview");
    expect(metadata.tags).toMatchObject({
      "app.environment": "preview",
      "app.identifier": "app.leave.mobile",
      "app.version": "1.0.0",
      "app.build": "42",
      "expo.runtime_version": "fingerprint-hash",
      "expo.update_id": "update-id",
      "expo.update_group_id": "group-id",
      "expo.is_embedded_update": false,
    });
    expect(metadata.contexts.expo_update).toMatchObject({
      update_id: "update-id",
      group_id: "group-id",
      embedded: false,
    });
  });
});
