import { ErrorDeduper } from "./dedupe";
import type {
  ErrorCaptureDetails,
  MessageCaptureDetails,
  ObservabilityBackend,
  ObservabilityBreadcrumb,
  PrimitiveTag,
} from "./types";

/**
 * Error가 아닌 값을 Error로 옮긴다.
 *
 * Sentry는 Error가 아닌 값을 받으면 "Object captured as exception with keys: …"
 * 하나로 묶는다 — 서로 다른 실패가 한 이슈에 쌓이고 메시지는 제목에서 사라져 무엇이
 * 터졌는지 이슈 목록에서 알 수 없다. 타입은 Error라고 말하면서 실제로는 평범한 객체인
 * 값이 있다(expo-updates의 `checkError`가 그랬다 — Sentry LEAVE-NATIVE-7).
 *
 * 스택은 비운다. 여기서 만들어지는 스택은 어느 실패든 관측 코드의 같은 자리라, 그대로
 * 두면 Sentry가 그 스택으로 다시 한 덩어리로 묶는다. 스택이 없으면 이름·메시지로
 * 묶여 실패마다 제 이슈를 갖는다.
 */
export function reportableError(value: unknown): unknown {
  if (value instanceof Error) return value;
  if (typeof value !== "object" || value === null) return value;
  const { message, name } = value as { message?: unknown; name?: unknown };
  if (typeof message !== "string" || message.length === 0) return value;
  const error = new Error(message);
  if (typeof name === "string" && name.length > 0) error.name = name;
  error.stack = "";
  return error;
}

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
      // 중복 판정은 **원래 값**으로 한다 — 아래에서 감싼 새 Error로 판정하면 같은
      // 객체를 두 번 잡아도 매번 다른 인스턴스가 되어 경계·전역 핸들러가 각자 올린다.
      this.backend.captureException(reportableError(error), {
        ...details,
        route: this.route,
      });
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
