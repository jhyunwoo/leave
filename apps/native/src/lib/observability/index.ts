import * as Sentry from "@sentry/react-native";
import type {
  Breadcrumb,
  ErrorEvent,
  SeverityLevel,
} from "@sentry/react-native";
import * as Updates from "expo-updates";
import { AppState, Platform } from "react-native";
import { ObservabilityCore } from "./core";
import { installObservabilityDiagnostics } from "./diagnostics";
import { collectObservabilityMetadata } from "./metadata";
import {
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeUnknown,
} from "./sanitize";
import type {
  BackendCaptureDetails,
  ErrorCaptureDetails,
  MessageCaptureDetails,
  ObservabilityBackend,
  ObservabilityBreadcrumb,
  PrimitiveTag,
} from "./types";

const core = new ObservabilityCore();
let initializationAttempted = false;

function cleanTags(
  tags: BackendCaptureDetails["tags"],
): Record<string, PrimitiveTag> {
  const output: Record<string, PrimitiveTag> = {};
  for (const [name, value] of Object.entries(tags ?? {})) {
    if (value !== null && value !== undefined) output[name] = value;
  }
  return output;
}

function applyCaptureDetails(
  scope: Sentry.Scope,
  details: BackendCaptureDetails,
): void {
  scope.setLevel((details.level ?? "error") as SeverityLevel);
  scope.setTags({
    "error.source": details.source,
    "error.handled": details.handled !== false,
    "error.fatal": details.level === "fatal",
    ...(details.route ? { "app.route": details.route } : {}),
    ...(!details.route ? { "app.lifecycle_phase": "startup" } : {}),
    ...cleanTags(details.tags),
  });
  if (details.componentStack) {
    scope.setContext("react", {
      component_stack: details.componentStack,
    });
  }
  for (const [name, value] of Object.entries(details.extra ?? {})) {
    scope.setExtra(name, sanitizeUnknown(value));
  }
}

const sentryBackend: ObservabilityBackend = {
  captureException(error, details) {
    Sentry.withScope((scope) => {
      applyCaptureDetails(scope, details);
      Sentry.captureException(error);
    });
  },
  captureMessage(message, details) {
    Sentry.withScope((scope) => {
      applyCaptureDetails(scope, details);
      Sentry.captureMessage(message);
    });
  },
  setUser(user) {
    Sentry.setUser(user);
  },
  addBreadcrumb(breadcrumb) {
    Sentry.addBreadcrumb(breadcrumb);
  },
  setTag(name, value) {
    Sentry.setTag(name, value);
  },
  setContext(name, value) {
    Sentry.setContext(name, value);
  },
};

function beforeSend(event: ErrorEvent): ErrorEvent | null {
  try {
    const isUnhandledPromise = event.exception?.values?.some(
      (value) => value.mechanism?.type === "onunhandledrejection",
    );
    if (isUnhandledPromise) {
      event.tags = {
        ...event.tags,
        "error.source": "unhandled_promise_rejection",
        "error.handled": false,
      };
    }
    return sanitizeSentryEvent(event);
  } catch {
    // Privacy filtering is fail-closed: never send an unsanitized fallback.
    return null;
  }
}

function beforeBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  try {
    return sanitizeSentryBreadcrumb(breadcrumb);
  } catch {
    return null;
  }
}

function isDevelopmentBuild(): boolean {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function diagnosticsEnabled(environment: string): boolean {
  return (
    environment !== "production" &&
    process.env.EXPO_PUBLIC_OBSERVABILITY_DIAGNOSTICS === "true"
  );
}

/** Initialize before Router evaluation. Missing/invalid monitoring config is a no-op. */
export function initializeObservability(): void {
  if (initializationAttempted) return;
  initializationAttempted = true;

  const development = isDevelopmentBuild();
  const metadata = collectObservabilityMetadata(development);
  const allowDevelopment = process.env.EXPO_PUBLIC_SENTRY_ENABLE_DEV === "true";
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN?.trim();

  installObservabilityDiagnostics(diagnosticsEnabled(metadata.environment), {
    captureHandled: () =>
      captureHandledError(
        new Error("Leave observability diagnostic: handled JS"),
        { source: "handled_exception" },
      ),
    captureNetwork: () =>
      captureHandledError(
        new Error("Leave observability diagnostic: network failure"),
        { source: "network_failure" },
      ),
    nativeCrash: () => {
      try {
        Sentry.nativeCrash();
      } catch {
        // A missing native SDK must not turn diagnostics into a JS crash.
      }
    },
  });

  if (!dsn || Platform.OS === "web" || (development && !allowDevelopment)) {
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: metadata.environment,
      sendDefaultPii: false,
      maxBreadcrumbs: 50,
      normalizeDepth: 5,
      attachScreenshot: false,
      attachViewHierarchy: false,
      enableCaptureFailedRequests: false,
      enableNativeCrashHandling: true,
      enableNdk: true,
      enableNativeNagger: false,
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30_000,
      enableAutoPerformanceTracing: false,
      enableNativeFramesTracking: false,
      enableAppHangTracking: false,
      // sentry-cocoa AppHangsV2 — the RN option types don't declare this key,
      // but SentryOptionsInternal.initWithDict reads the whole options dict.
      // V2 reports fatal app hangs with stack traces, which the stack-less
      // WatchdogTermination events can't explain on their own.
      ...{ enableAppHangTrackingV2: true },
      enableWatchdogTerminationTracking: true,
      patchGlobalPromise: true,
      beforeSend,
      beforeBreadcrumb,
      integrations(defaultIntegrations) {
        return defaultIntegrations.map((integration) =>
          integration.name === "ReactNativeErrorHandlers"
            ? Sentry.reactNativeErrorHandlersIntegration({
                // fatal-error.ts remains the sole owner of ErrorUtils. Sentry
                // still owns Hermes/JSC unhandled-rejection tracking.
                onerror: false,
                onunhandledrejection: true,
                patchGlobalPromise: true,
              })
            : integration,
        );
      },
    });

    core.activate(sentryBackend);
    for (const [name, value] of Object.entries(metadata.tags)) {
      core.setTag(name, value);
    }
    for (const [name, value] of Object.entries(metadata.contexts)) {
      core.setContext(name, value);
    }
    core.setTag("app.state", AppState.currentState);
    core.addBreadcrumb({
      category: "app.lifecycle",
      message: "application started",
      level: "info",
    });

    try {
      AppState.addEventListener("change", (state) => {
        core.setTag("app.state", state);
        core.addBreadcrumb({
          category: "app.lifecycle",
          message: `application state -> ${state}`,
          level: "info",
        });
      });
    } catch {
      // AppState enrichment is optional.
    }

    if (Updates.isEmergencyLaunch) {
      core.captureException(
        new Error(
          Updates.emergencyLaunchReason ?? "Expo Update emergency launch",
        ),
        {
          source: "ota_update",
          level: "error",
          handled: true,
          tags: { "ota.phase": "emergency_launch" },
        },
      );
    }
  } catch {
    // Sentry configuration/native initialization can never block app startup.
  }
}

export function captureException(
  error: unknown,
  details: ErrorCaptureDetails,
): void {
  core.captureException(error, details);
}

export function captureHandledError(
  error: unknown,
  details: Omit<ErrorCaptureDetails, "handled"> = {
    source: "handled_exception",
  },
): void {
  core.captureException(error, { ...details, handled: true });
}

export function captureMessage(
  message: string,
  details: MessageCaptureDetails,
): void {
  core.captureMessage(message, details);
}

export function setObservabilityUser(id: string): void {
  core.setUserId(id);
}

export function clearObservabilityUser(): void {
  core.clearUser();
}

export function addObservabilityBreadcrumb(
  breadcrumb: ObservabilityBreadcrumb,
): void {
  core.addBreadcrumb(breadcrumb);
}

export function setObservabilityTag(name: string, value: PrimitiveTag): void {
  core.setTag(name, value);
}

export function setObservabilityContext(
  name: string,
  value: Record<string, unknown> | null,
): void {
  core.setContext(name, value);
}

export function setCurrentRoute(route: string | null): void {
  core.setRoute(route);
}
