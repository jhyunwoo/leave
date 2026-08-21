import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCalendar } from "../src/hooks/calendar";
import { useMyLeaves } from "../src/hooks/leaves";
import { queryKeys } from "../src/query-keys";
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

  it("keeps a grouped calendar fetch alive when only one month is canceled", async () => {
    let requestSignal: AbortSignal | undefined;
    let finishRequest:
      ((value: { calendars: Array<{ month: string }> }) => void) | undefined;
    const client = {
      units: {
        ":id": {
          calendar: { $get: () => Promise.reject(new Error("unexpected")) },
          calendars: {
            $get: (
              _args: unknown,
              options?: { init?: { signal?: AbortSignal } },
            ) =>
              new Promise<{ calendars: Array<{ month: string }> }>(
                (resolve, reject) => {
                  requestSignal = options?.init?.signal;
                  finishRequest = resolve;
                  requestSignal?.addEventListener("abort", () => {
                    reject(new DOMException("Aborted", "AbortError"));
                  });
                },
              ),
          },
        },
      },
    };
    const queryClient = testQueryClient();
    const wrapper = wrapperFor(
      queryClient,
      testAdapter({
        client,
        useRequestAbortSignal: true,
        batchCalendarRequests: true,
      }),
    );
    const initialProps: {
      firstUnit: string | null;
      secondUnit: string | null;
    } = { firstUnit: "unit-1", secondUnit: "unit-1" };
    const view = renderHook(
      (props: { firstUnit: string | null; secondUnit: string | null }) => [
        useCalendar(props.firstUnit, "2026-08"),
        useCalendar(props.secondUnit, "2026-09"),
      ],
      { wrapper, initialProps },
    );

    await waitFor(() => expect(requestSignal).toBeDefined());
    view.rerender({ firstUnit: null, secondUnit: "unit-1" });
    expect(requestSignal?.aborted).toBe(false);

    finishRequest?.({
      calendars: [{ month: "2026-08" }, { month: "2026-09" }],
    });
    await waitFor(() => expect(view.result.current[1]?.isSuccess).toBe(true));
    expect(
      queryClient.getQueryData(queryKeys.calendar("unit-1", "2026-08")),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.calendar("unit-1", "2026-09")),
    ).toEqual({ month: "2026-09" });
  });

  it("aborts a grouped calendar fetch after every month is canceled", async () => {
    let requestSignal: AbortSignal | undefined;
    const client = {
      units: {
        ":id": {
          calendar: { $get: () => Promise.reject(new Error("unexpected")) },
          calendars: {
            $get: (
              _args: unknown,
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
      },
    };
    const queryClient = testQueryClient();
    const wrapper = wrapperFor(
      queryClient,
      testAdapter({
        client,
        useRequestAbortSignal: true,
        batchCalendarRequests: true,
      }),
    );
    const initialProps: { unitId: string | null } = { unitId: "unit-1" };
    const view = renderHook(
      (props: { unitId: string | null }) => [
        useCalendar(props.unitId, "2026-08"),
        useCalendar(props.unitId, "2026-09"),
      ],
      { wrapper, initialProps },
    );

    await waitFor(() => expect(requestSignal).toBeDefined());
    view.rerender({ unitId: null });
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));
    expect(
      queryClient.getQueryData(queryKeys.calendar("unit-1", "2026-08")),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.calendar("unit-1", "2026-09")),
    ).toBeUndefined();
  });
});
