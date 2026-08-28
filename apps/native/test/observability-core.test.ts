import { describe, expect, it, vi } from "vitest";
import { ObservabilityCore } from "../src/lib/observability/core";
import type { ObservabilityBackend } from "../src/lib/observability/types";

function backend(): ObservabilityBackend {
  return {
    captureException: vi.fn(),
    captureMessage: vi.fn(),
    setUser: vi.fn(),
    addBreadcrumb: vi.fn(),
    setTag: vi.fn(),
    setContext: vi.fn(),
  };
}

describe("ObservabilityCore", () => {
  it("deduplicates the same underlying Error object", () => {
    const transport = backend();
    const core = new ObservabilityCore();
    core.activate(transport);
    const error = new Error("same exception");

    core.captureException(error, { source: "router_error_boundary" });
    core.captureException(error, { source: "root_error_boundary" });

    expect(transport.captureException).toHaveBeenCalledTimes(1);
  });

  it("clears both user and sensitive session context", () => {
    const transport = backend();
    const core = new ObservabilityCore();
    core.activate(transport);

    core.setUserId("internal-id");
    core.clearUser();

    expect(transport.setUser).toHaveBeenNthCalledWith(1, { id: "internal-id" });
    expect(transport.setUser).toHaveBeenNthCalledWith(2, null);
    expect(transport.setContext).toHaveBeenCalledWith("session", null);
  });

  it("never throws when every monitoring backend method fails", () => {
    const fail = () => {
      throw new Error("monitoring unavailable");
    };
    const core = new ObservabilityCore();
    core.activate({
      captureException: fail,
      captureMessage: fail,
      setUser: fail,
      addBreadcrumb: fail,
      setTag: fail,
      setContext: fail,
    });

    expect(() => {
      core.captureException(new Error("application error"), {
        source: "handled_exception",
      });
      core.captureMessage("message", { source: "startup" });
      core.setUserId("id");
      core.clearUser();
      core.addBreadcrumb({ category: "test", message: "test" });
      core.setTag("tag", "value");
      core.setContext("context", { ok: true });
      core.setRoute("/leave/[leaveId]");
    }).not.toThrow();
  });
});
