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

  /**
   * Error가 아닌 값을 그대로 보내면 Sentry가 "Object captured as exception with
   * keys: …" 하나로 묶어, 서로 다른 실패가 한 이슈에 쌓이고 메시지가 제목에서
   * 사라진다(expo-updates의 checkError가 그랬다).
   */
  it("wraps a non-Error object so the message survives grouping", () => {
    const transport = backend();
    const core = new ObservabilityCore();
    core.activate(transport);

    core.captureException(
      {
        message:
          "Unknown error: The Internet connection appears to be offline.",
      },
      { source: "ota_update" },
    );

    const [captured] = vi.mocked(transport.captureException).mock.calls[0]!;
    expect(captured).toBeInstanceOf(Error);
    expect((captured as Error).message).toBe(
      "Unknown error: The Internet connection appears to be offline.",
    );
    // 관측 코드 자리의 스택으로 다시 한 덩어리가 되지 않도록 스택은 비운다.
    expect((captured as Error).stack).toBe("");
  });

  it("keeps deduplicating by the original value it was handed", () => {
    const transport = backend();
    const core = new ObservabilityCore();
    core.activate(transport);
    const plain = { message: "same plain failure" };

    core.captureException(plain, { source: "router_error_boundary" });
    core.captureException(plain, { source: "root_error_boundary" });

    expect(transport.captureException).toHaveBeenCalledTimes(1);
  });

  it("leaves real Errors untouched", () => {
    const transport = backend();
    const core = new ObservabilityCore();
    core.activate(transport);
    const error = new Error("application error");

    core.captureException(error, { source: "handled_exception" });

    expect(vi.mocked(transport.captureException).mock.calls[0]?.[0]).toBe(
      error,
    );
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
