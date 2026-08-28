import { installFatalErrorHandler } from "../fatal-error";
import { initializeObservability } from "./index";

// This module is the first app-owned side-effect import in index.js. Sentry's
// ErrorUtils integration is disabled before the existing handler is installed,
// so later Router module evaluation is covered without changing handler owner.
try {
  initializeObservability();
} catch {
  // A monitoring bootstrap failure must never prevent registration of the app.
}

try {
  installFatalErrorHandler();
} catch {
  // Keep entrypoint evaluation fail-safe even on unusual RN runtimes.
}
