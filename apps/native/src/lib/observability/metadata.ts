import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";
import { Platform } from "react-native";
import type { PrimitiveTag } from "./types";

export type ObservabilityEnvironment =
  "closed-test" | "development" | "preview" | "production";

export type MetadataInput = {
  configuredEnvironment?: string | null;
  isDevelopment: boolean;
  appId?: string | null;
  appVersion?: string | null;
  buildNumber?: string | null;
  expoSdkVersion?: string | null;
  platform: string;
  reactNativeVersion?: string | null;
  runtimeVersion?: string | null;
  updateChannel?: string | null;
  updateId?: string | null;
  updateGroupId?: string | null;
  updateCreatedAt?: string | null;
  updatesEnabled: boolean;
  isEmbeddedUpdate: boolean;
  isEmergencyLaunch: boolean;
  locale?: string | null;
};

export type ObservabilityMetadata = {
  environment: ObservabilityEnvironment;
  tags: Record<string, PrimitiveTag>;
  contexts: Record<string, Record<string, unknown>>;
};

export function resolveObservabilityEnvironment(
  value: string | null | undefined,
  isDevelopment: boolean,
): ObservabilityEnvironment {
  if (
    value === "preview" ||
    value === "closed-test" ||
    value === "production"
  ) {
    return value;
  }
  return isDevelopment ? "development" : "production";
}

export function buildObservabilityMetadata(
  input: MetadataInput,
): ObservabilityMetadata {
  const environment = resolveObservabilityEnvironment(
    input.configuredEnvironment,
    input.isDevelopment,
  );
  const tags: Record<string, PrimitiveTag> = {
    "app.environment": environment,
    "app.platform": input.platform,
    "expo.is_embedded_update": input.isEmbeddedUpdate,
    "expo.updates_enabled": input.updatesEnabled,
    "expo.is_emergency_launch": input.isEmergencyLaunch,
  };

  const optionalTags: Record<string, string | null | undefined> = {
    "app.identifier": input.appId,
    "app.version": input.appVersion,
    "app.build": input.buildNumber,
    "expo.sdk_version": input.expoSdkVersion,
    "expo.runtime_version": input.runtimeVersion,
    "expo.update_channel": input.updateChannel,
    "expo.update_id": input.updateId,
    "expo.update_group_id": input.updateGroupId,
    "react_native.version": input.reactNativeVersion,
  };
  for (const [name, value] of Object.entries(optionalTags)) {
    if (value) tags[name] = value;
  }

  return {
    environment,
    tags,
    contexts: {
      app_runtime: {
        application_id: input.appId ?? "unknown",
        application_version: input.appVersion ?? "unknown",
        build_number: input.buildNumber ?? "unknown",
        expo_sdk_version: input.expoSdkVersion ?? "unknown",
        locale: input.locale ?? "unknown",
        react_native_version: input.reactNativeVersion ?? "unknown",
      },
      expo_update: {
        channel: input.updateChannel ?? "none",
        created_at: input.updateCreatedAt ?? "unknown",
        embedded: input.isEmbeddedUpdate,
        enabled: input.updatesEnabled,
        emergency_launch: input.isEmergencyLaunch,
        group_id: input.updateGroupId ?? "unknown",
        runtime_version: input.runtimeVersion ?? "unknown",
        update_id: input.updateId ?? "unknown",
      },
    },
  };
}

function updateGroupId(): string | null {
  try {
    const manifest = Updates.manifest;
    if (!manifest || typeof manifest !== "object") return null;
    const metadata = "metadata" in manifest ? manifest.metadata : null;
    if (!metadata || typeof metadata !== "object") return null;
    const group =
      "updateGroup" in metadata
        ? (metadata as { updateGroup?: unknown }).updateGroup
        : null;
    return typeof group === "string" ? group : null;
  } catch {
    return null;
  }
}

function reactNativeVersion(): string | null {
  try {
    const version = Platform.constants.reactNativeVersion;
    return `${version.major}.${version.minor}.${version.patch}`;
  } catch {
    return null;
  }
}

export function collectObservabilityMetadata(
  isDevelopment: boolean,
): ObservabilityMetadata {
  let locale: string | null = null;
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    // Locale is optional diagnostic context.
  }

  return buildObservabilityMetadata({
    configuredEnvironment: process.env.EXPO_PUBLIC_APP_ENV,
    isDevelopment,
    appId: Application.applicationId,
    appVersion: Application.nativeApplicationVersion,
    buildNumber: Application.nativeBuildVersion,
    expoSdkVersion: Constants.expoConfig?.sdkVersion,
    platform: Platform.OS,
    reactNativeVersion: reactNativeVersion(),
    runtimeVersion: Updates.runtimeVersion,
    updateChannel: Updates.channel,
    updateId: Updates.updateId,
    updateGroupId: updateGroupId(),
    updateCreatedAt: Updates.createdAt?.toISOString(),
    updatesEnabled: Updates.isEnabled,
    isEmbeddedUpdate: Updates.isEmbeddedLaunch,
    isEmergencyLaunch: Updates.isEmergencyLaunch,
    locale,
  });
}
