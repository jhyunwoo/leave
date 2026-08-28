import { ErrorDeduper } from "./dedupe";
import type {
  ErrorCaptureDetails,
  MessageCaptureDetails,
  ObservabilityBackend,
  ObservabilityBreadcrumb,
  PrimitiveTag,
} from "./types";

/**
 * Fail-safe stateful facade around the transport. Every public operation is
 * synchronous and swallows backend failures by design.
 */
export class ObservabilityCore {
  private backend: ObservabilityBackend | null = null;
  private route: string | null = null;
  private readonly deduper: ErrorDeduper;

  constructor(deduper = new ErrorDeduper()) {
    this.deduper = deduper;
  }

  activate(backend: ObservabilityBackend): void {
    this.backend = backend;
  }

  captureException(error: unknown, details: ErrorCaptureDetails): void {
    try {
      if (!this.backend || !this.deduper.shouldCapture(error)) return;
      this.backend.captureException(error, { ...details, route: this.route });
    } catch {
      // Observability is never allowed to join the application's error path.
    }
  }

  captureMessage(message: string, details: MessageCaptureDetails): void {
    try {
      this.backend?.captureMessage(message, {
        ...details,
        route: this.route,
      });
    } catch {
      // Fail closed without affecting the caller.
    }
  }

  setUserId(id: string): void {
    try {
      this.backend?.setUser({ id });
    } catch {
      // User context is optional diagnostic state.
    }
  }

  clearUser(): void {
    try {
      this.backend?.setUser(null);
      this.backend?.setContext("session", null);
    } catch {
      // Logout must never depend on telemetry cleanup succeeding.
    }
  }

  addBreadcrumb(breadcrumb: ObservabilityBreadcrumb): void {
    try {
      this.backend?.addBreadcrumb(breadcrumb);
    } catch {
      // Breadcrumbs are best effort.
    }
  }

  setTag(name: string, value: PrimitiveTag): void {
    try {
      this.backend?.setTag(name, value);
    } catch {
      // Tags are best effort.
    }
  }

  setContext(name: string, value: Record<string, unknown> | null): void {
    try {
      this.backend?.setContext(name, value);
    } catch {
      // Context is best effort.
    }
  }

  setRoute(route: string | null): void {
    if (route === this.route) return;
    const previous = this.route;
    this.route = route;
    if (route) {
      this.setTag("app.route", route);
      this.addBreadcrumb({
        category: "app.navigation",
        message: `navigation -> ${route}`,
        level: "info",
        data: previous ? { from: previous, to: route } : { to: route },
      });
    }
  }
}
