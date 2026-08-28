export type ObservabilityDiagnostic =
  | "handled_js"
  | "react_render"
  | "unhandled_js"
  | "unhandled_promise"
  | "network"
  | "native_crash";

type DiagnosticActions = {
  captureHandled(): void;
  captureNetwork(): void;
  nativeCrash(): void;
};

let renderTrigger: (() => void) | null = null;

export function registerDiagnosticRenderTrigger(
  trigger: (() => void) | null,
): void {
  renderTrigger = trigger;
}

export function installObservabilityDiagnostics(
  enabled: boolean,
  actions: DiagnosticActions,
): void {
  if (!enabled) return;

  try {
    Object.assign(globalThis, {
      __leaveObservabilityDiagnostics: (kind: ObservabilityDiagnostic) => {
        switch (kind) {
          case "handled_js":
            actions.captureHandled();
            return;
          case "react_render":
            renderTrigger?.();
            return;
          case "unhandled_js":
            setTimeout(() => {
              throw new Error("Leave observability diagnostic: unhandled JS");
            }, 0);
            return;
          case "unhandled_promise":
            void Promise.reject(
              new Error("Leave observability diagnostic: unhandled promise"),
            );
            return;
          case "network":
            actions.captureNetwork();
            return;
          case "native_crash":
            actions.nativeCrash();
        }
      },
    });
  } catch {
    // Diagnostics are optional and must follow the same fail-safe invariant.
  }
}
