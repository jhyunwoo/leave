import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useMyLeaves } from "../src/hooks/leaves";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

describe("query cancellation", () => {
  it("passes TanStack's signal to Hono and aborts after the last observer unmounts", async () => {
    let requestSignal: AbortSignal | undefined;
    const client = {
      leaves: {
        mine: {
          $get: (
            _args: undefined,
            options?: { init?: { signal?: AbortSignal } },
          ) =>
            new Promise((_resolve, reject) => {
              requestSignal = options?.init?.signal;
              requestSignal?.addEventListener("abort", () => {
                reject(new DOMException("Aborted", "AbortError"));
              });
            }),
        },
      },
    };
    const queryClient = testQueryClient();
    const wrapper = wrapperFor(
      queryClient,
      testAdapter({ client, useRequestAbortSignal: true }),
    );
    const view = renderHook(() => useMyLeaves(), { wrapper });

    await waitFor(() => expect(requestSignal).toBeDefined());
    expect(requestSignal?.aborted).toBe(false);

    view.unmount();

    expect(requestSignal?.aborted).toBe(true);
  });

  it.each([undefined, false])(
    "does not change request lifetime when adapter capability is %s",
    async (useRequestAbortSignal) => {
      let requestOptions: { init?: { signal?: AbortSignal } } | undefined;
      let finishRequest: ((value: { leaves: never[] }) => void) | undefined;
      const client = {
        leaves: {
          mine: {
            $get: (
              _args: undefined,
              options?: { init?: { signal?: AbortSignal } },
            ) => {
              requestOptions = options;
              return new Promise<{ leaves: never[] }>((resolve) => {
                finishRequest = resolve;
              });
            },
          },
        },
      };
      const queryClient = testQueryClient();
      const wrapper = wrapperFor(
        queryClient,
        testAdapter({ client, useRequestAbortSignal }),
      );
      const view = renderHook(() => useMyLeaves(), { wrapper });

      await waitFor(() => expect(finishRequest).toBeDefined());
      view.unmount();

      expect(requestOptions).toBeUndefined();
      finishRequest?.({ leaves: [] });
      await waitFor(() =>
        expect(queryClient.getQueryData(["myLeaves"])).toEqual({ leaves: [] }),
      );
    },
  );
});
