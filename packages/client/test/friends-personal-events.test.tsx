import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizeFriendIds } from "@leave/shared";
import { useBlockUser } from "../src/hooks/moderation";
import {
  useCreatePersonalEvent,
  useDeletePersonalEvent,
} from "../src/hooks/personal-events";
import { useCreateUnitEvent } from "../src/hooks/unit-events";
import { useRemoveFriend } from "../src/hooks/friends";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

describe("friend query keys", () => {
  it("normalizes selection order and duplicates", () => {
    const first = queryKeys.friendCalendar(
      normalizeFriendIds(["b", "a", "b"]),
      "2026-09",
    );
    const second = queryKeys.friendCalendar(
      normalizeFriendIds(["a", "b"]),
      "2026-09",
    );
    expect(first).toEqual(second);
  });

  it("removing a friend purges only schedules and comparisons containing that friend", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(
      queryKeys.friendSchedule("a", "2026-01-01", "2026-12-31"),
      { leaves: [] },
    );
    queryClient.setQueryData(queryKeys.friendCalendar(["a", "b"], "2026-09"), {
      leaves: [],
    });
    queryClient.setQueryData(queryKeys.friendCalendar(["b"], "2026-09"), {
      leaves: [1],
    });
    const client = {
      friends: { ":userId": { $delete: () => Promise.resolve({ ok: true }) } },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useRemoveFriend(), { wrapper });
    await act(() => result.current.mutateAsync("a"));
    expect(
      queryClient.getQueryData(
        queryKeys.friendSchedule("a", "2026-01-01", "2026-12-31"),
      ),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.friendCalendar(["a", "b"], "2026-09")),
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(queryKeys.friendCalendar(["b"], "2026-09")),
    ).toEqual({ leaves: [1] });
  });

  it("blocking a friend immediately removes cached friend calendar access", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.friendCalendar(["blocked"], "2026-09"), {
      leaves: [{ userId: "blocked" }],
    });
    const client = {
      moderation: { blocks: { $post: () => Promise.resolve({ ok: true }) } },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useBlockUser(), { wrapper });
    await act(() => result.current.mutateAsync({ userId: "blocked" }));
    expect(
      queryClient.getQueryData(
        queryKeys.friendCalendar(["blocked"], "2026-09"),
      ),
    ).toBeUndefined();
  });
});

describe("personal event invalidation", () => {
  it("create invalidates only months intersecting the event", async () => {
    const queryClient = testQueryClient();
    for (const month of ["2026-08", "2026-09", "2026-10", "2026-11"])
      queryClient.setQueryData(queryKeys.personalEventsMonth(month), {
        events: [],
      });
    const client = {
      "personal-events": {
        $post: () =>
          Promise.resolve({
            event: {
              id: "event-1",
              title: "일정",
              startDate: "2026-09-30",
              endDate: "2026-10-02",
              startTime: null,
              endTime: null,
              note: null,
              createdAt: "now",
              updatedAt: "now",
            },
          }),
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useCreatePersonalEvent(), { wrapper });
    await act(() =>
      result.current.mutateAsync({
        title: "일정",
        startDate: "2026-09-30",
        endDate: "2026-10-02",
      }),
    );
    const invalidated = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey.at(-1));
    expect(invalidated.sort()).toEqual(["2026-09", "2026-10"]);
  });

  it("delete removes the detail and invalidates its full multi-month range", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.personalEventsMonth("2026-09"), {
      events: [],
    });
    queryClient.setQueryData(queryKeys.personalEventsMonth("2026-10"), {
      events: [],
    });
    queryClient.setQueryData(queryKeys.personalEvent("event-1"), { event: {} });
    const client = {
      "personal-events": {
        ":id": { $delete: () => Promise.resolve({ ok: true }) },
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useDeletePersonalEvent(), { wrapper });
    const event = {
      id: "event-1",
      title: "일정",
      startDate: "2026-09-30",
      endDate: "2026-10-02",
      startTime: null,
      endTime: null,
      note: null,
      createdAt: "now",
      updatedAt: "now",
    };
    await act(() => result.current.mutateAsync(event));
    await waitFor(() =>
      expect(
        queryClient.getQueryData(queryKeys.personalEvent("event-1")),
      ).toBeUndefined(),
    );
    expect(
      queryClient.getQueryState(queryKeys.personalEventsMonth("2026-09"))
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(queryKeys.personalEventsMonth("2026-10"))
        ?.isInvalidated,
    ).toBe(true);
  });
});

describe("unit event invalidation", () => {
  it("같은 부대의 일정 기간과 겹치는 달력만 무효화한다", async () => {
    const queryClient = testQueryClient();
    for (const unitId of ["unit-1", "unit-2"])
      for (const month of ["2026-08", "2026-09", "2026-10"])
        queryClient.setQueryData(queryKeys.calendar(unitId, month), {
          month,
        });
    const client = {
      units: {
        ":id": {
          events: {
            $post: () =>
              Promise.resolve({
                event: {
                  id: "unit-event-1",
                  title: "부대 행사",
                  isHoliday: true,
                  startDate: "2026-09-30",
                  endDate: "2026-10-02",
                  startTime: null,
                  endTime: null,
                  details: null,
                  createdAt: "now",
                  updatedAt: "now",
                },
              }),
          },
        },
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useCreateUnitEvent("unit-1"), {
      wrapper,
    });
    await act(() =>
      result.current.mutateAsync({
        title: "부대 행사",
        isHoliday: true,
        startDate: "2026-09-30",
        endDate: "2026-10-02",
      }),
    );

    const invalidated = queryClient
      .getQueryCache()
      .getAll()
      .filter((query) => query.state.isInvalidated)
      .map((query) => query.queryKey.slice(1));
    expect(invalidated).toEqual([
      ["unit-1", "2026-09"],
      ["unit-1", "2026-10"],
    ]);
  });
});
