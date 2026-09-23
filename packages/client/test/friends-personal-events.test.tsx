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
import { useNotificationLeaveDetails } from "../src/hooks/notification-leave";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

describe("friend leave notification details", () => {
  const target = {
    userId: "friend",
    leaveId: "leave-1",
    startDate: "2026-11-02",
    endDate: "2026-11-04",
  };

  function renderDetails(leaveScheduleShared: boolean) {
    const schedule = {
      people: [
        {
          userId: "friend",
          name: "친구",
          username: null,
          isViewer: false,
          leaveScheduleShared,
        },
      ],
      leaves: [],
    };
    const client = {
      friends: {
        ":userId": { schedule: { $get: () => Promise.resolve(schedule) } },
      },
      leaves: { mine: { $get: () => Promise.resolve({ leaves: [] }) } },
    };
    const wrapper = wrapperFor(testQueryClient(), testAdapter({ client }));
    return renderHook(() => useNotificationLeaveDetails(target), { wrapper });
  }

  it("tells a friend who stopped sharing apart from a deleted leave", async () => {
    const hidden = renderDetails(false);
    const deleted = renderDetails(true);
    await waitFor(() => expect(hidden.result.current.loading).toBe(false));
    await waitFor(() => expect(deleted.result.current.loading).toBe(false));

    // 둘 다 휴가가 비어 있다. 공유를 끈 친구를 "삭제됨"으로 말하면 틀린 정보다.
    expect(hidden.result.current.message).toMatch(/공유하지 않아요/);
    expect(deleted.result.current.message).toMatch(/삭제/);
  });
});

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
