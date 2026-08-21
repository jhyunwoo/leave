import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useMe } from "../src/hooks/auth";
import {
  useCreateLeave,
  useCreateLeaveGrant,
  useDeleteLeaveGrant,
  useLeaveBalances,
  useLeaveGrants,
  useUpdateLeaveBalances,
  useUpdateRegularOvernight,
} from "../src/hooks/leaves";
import {
  useNotificationPrefs,
  useNotificationSummary,
  useNotifications,
  useUpdateNotificationPrefs,
} from "../src/hooks/notifications";
import { useRotateUnitInvite } from "../src/hooks/units";
import { useBlockUser } from "../src/hooks/moderation";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

function setup(client: unknown) {
  const queryClient = testQueryClient();
  return {
    queryClient,
    wrapper: wrapperFor(queryClient, testAdapter({ client })),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("authoritative mutation responses", () => {
  it("writes a returned grants page without a second grants GET", async () => {
    const initial = { funds: [{ key: "annual", grants: [] }] };
    const updated = { funds: [{ key: "annual", grants: [{ id: "grant-1" }] }] };
    const get = vi.fn(() => Promise.resolve(initial));
    const client = {
      leaves: {
        grants: {
          $get: get,
          $post: () => Promise.resolve(updated),
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    const view = renderHook(
      () => ({ page: useLeaveGrants(), create: useCreateLeaveGrant() }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.page.isSuccess).toBe(true));

    await act(() =>
      view.result.current.create.mutateAsync({
        balanceKey: "annual",
        days: 3,
      } as never),
    );

    expect(get).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.leaveGrants)).toEqual(updated);
  });

  it("does not let an older in-flight grants GET overwrite a mutation response", async () => {
    const initial = { funds: [{ key: "annual", grants: [] }] };
    const updated = { funds: [{ key: "annual", grants: [{ id: "grant-1" }] }] };
    const pendingGet = deferred<typeof initial>();
    const get = vi.fn(() => pendingGet.promise);
    const client = {
      leaves: {
        grants: {
          $get: get,
          $post: () => Promise.resolve(updated),
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    const view = renderHook(
      () => ({ page: useLeaveGrants(), create: useCreateLeaveGrant() }),
      { wrapper },
    );
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));

    await act(() =>
      view.result.current.create.mutateAsync({
        balanceKey: "annual",
        days: 3,
      } as never),
    );
    expect(queryClient.getQueryData(queryKeys.leaveGrants)).toEqual(updated);

    await act(async () => {
      pendingGet.resolve(initial);
      await pendingGet.promise;
      await Promise.resolve();
    });
    expect(queryClient.getQueryData(queryKeys.leaveGrants)).toEqual(updated);
  });

  it("serializes full grants-page writes so a late older response cannot resurrect data", async () => {
    const firstResponse = deferred<{ funds: { grants: { id: string }[] }[] }>();
    const secondResponse = deferred<{
      funds: { grants: { id: string }[] }[];
    }>();
    const remove = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    const client = {
      leaves: { grants: { ":id": { $delete: remove } } },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.leaveGrants, {
      funds: [{ grants: [{ id: "grant-1" }, { id: "grant-2" }] }],
    });
    const { result } = renderHook(() => useDeleteLeaveGrant(), { wrapper });
    let firstMutation!: Promise<unknown>;
    let secondMutation!: Promise<unknown>;

    act(() => {
      firstMutation = result.current.mutateAsync("grant-1");
      secondMutation = result.current.mutateAsync("grant-2");
    });

    await waitFor(() => expect(remove).toHaveBeenCalledTimes(1));
    expect(remove.mock.calls[0]?.[0]).toEqual({ param: { id: "grant-1" } });

    await act(async () => {
      firstResponse.resolve({ funds: [{ grants: [{ id: "grant-2" }] }] });
      await firstMutation;
    });
    await waitFor(() => expect(remove).toHaveBeenCalledTimes(2));
    expect(remove.mock.calls[1]?.[0]).toEqual({ param: { id: "grant-2" } });

    await act(async () => {
      secondResponse.resolve({ funds: [{ grants: [] }] });
      await secondMutation;
    });
    expect(queryClient.getQueryData(queryKeys.leaveGrants)).toEqual({
      funds: [{ grants: [] }],
    });
  });

  it.each([
    ["balance totals", false],
    ["regular overnight", true],
  ] as const)(
    "writes returned %s without a second balances GET",
    async (_label, regularOvernight) => {
      const initial = { balances: [{ key: "annual", totalDays: 1 }] };
      const updated = { balances: [{ key: "annual", totalDays: 4 }] };
      const get = vi.fn(() => Promise.resolve(initial));
      const client = {
        leaves: {
          balances: {
            $get: get,
            $put: () => Promise.resolve(updated),
          },
          "regular-overnight": {
            $put: () => Promise.resolve(updated),
          },
        },
      };
      const { queryClient, wrapper } = setup(client);
      const view = renderHook(
        () => ({
          balances: useLeaveBalances(),
          updateBalances: useUpdateLeaveBalances(),
          updateRegular: useUpdateRegularOvernight(),
        }),
        { wrapper },
      );
      await waitFor(() =>
        expect(view.result.current.balances.isSuccess).toBe(true),
      );

      await act(() =>
        regularOvernight
          ? view.result.current.updateRegular.mutateAsync({ enabled: false })
          : view.result.current.updateBalances.mutateAsync({
              totals: [],
            } as never),
      );

      expect(get).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(queryKeys.leaveBalances)).toEqual(
        updated,
      );
    },
  );

  it("writes returned notification preferences without a second GET", async () => {
    const initial = {
      preferences: { overage: true, blackout: true, unitNotice: true },
    };
    const updated = {
      preferences: { overage: false, blackout: true, unitNotice: true },
    };
    const get = vi.fn(() => Promise.resolve(initial));
    const client = {
      notifications: {
        preferences: {
          $get: get,
          $patch: () => Promise.resolve(updated),
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    const view = renderHook(
      () => ({
        prefs: useNotificationPrefs(),
        update: useUpdateNotificationPrefs(),
      }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.prefs.isSuccess).toBe(true));

    await act(() => view.result.current.update.mutateAsync({ overage: false }));

    expect(get).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.notificationPrefs)).toEqual(
      updated,
    );
  });

  it("serializes concurrent preference PATCHes so full responses preserve submission order", async () => {
    const firstResponse = deferred<{
      preferences: { overage: boolean; blackout: boolean; unitNotice: boolean };
    }>();
    const secondResponse = deferred<{
      preferences: { overage: boolean; blackout: boolean; unitNotice: boolean };
    }>();
    const patch = vi
      .fn()
      .mockImplementationOnce(() => firstResponse.promise)
      .mockImplementationOnce(() => secondResponse.promise);
    const client = {
      notifications: { preferences: { $patch: patch } },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.notificationPrefs, {
      preferences: { overage: true, blackout: true, unitNotice: true },
    });
    const { result } = renderHook(() => useUpdateNotificationPrefs(), {
      wrapper,
    });
    let firstMutation!: Promise<unknown>;
    let secondMutation!: Promise<unknown>;

    act(() => {
      firstMutation = result.current.mutateAsync({ overage: false });
      secondMutation = result.current.mutateAsync({ blackout: false });
    });

    await waitFor(() => expect(patch).toHaveBeenCalledTimes(1));
    expect(patch.mock.calls[0]?.[0]).toEqual({ json: { overage: false } });

    await act(async () => {
      firstResponse.resolve({
        preferences: { overage: false, blackout: true, unitNotice: true },
      });
      await firstMutation;
    });
    await waitFor(() => expect(patch).toHaveBeenCalledTimes(2));
    expect(patch.mock.calls[1]?.[0]).toEqual({ json: { blackout: false } });

    await act(async () => {
      secondResponse.resolve({
        preferences: { overage: false, blackout: false, unitNotice: true },
      });
      await secondMutation;
    });
    expect(queryClient.getQueryData(queryKeys.notificationPrefs)).toEqual({
      preferences: { overage: false, blackout: false, unitNotice: true },
    });
  });

  it("does not refetch me after rotating an invite", async () => {
    const me = { user: { id: "user-1" }, unit: { id: "unit-1" } };
    const getMe = vi.fn(() => Promise.resolve(me));
    const client = {
      auth: { me: { $get: getMe } },
      units: {
        ":id": {
          invite: {
            $post: () =>
              Promise.resolve({
                invite: {
                  code: "new-code",
                  expiresAt: "2026-09-01T00:00:00.000Z",
                  maxUses: 1,
                  usedCount: 0,
                },
              }),
          },
        },
      },
    };
    const { wrapper } = setup(client);
    const view = renderHook(
      () => ({ me: useMe(), rotate: useRotateUnitInvite("unit-1") }),
      { wrapper },
    );
    await waitFor(() => expect(view.result.current.me.isSuccess).toBe(true));

    await act(() => view.result.current.rotate.mutateAsync({}));

    expect(getMe).toHaveBeenCalledTimes(1);
  });
});

describe("block visibility cache update", () => {
  it("removes the user from members and every cached attendee list without refetching", async () => {
    const block = vi.fn(() => Promise.resolve({ ok: true }));
    const { queryClient, wrapper } = setup({
      moderation: { blocks: { $post: block } },
    });
    const memberKey = queryKeys.unitMembers("unit-1");
    const calendarKeys = [
      queryKeys.calendar("unit-1", "2026-09"),
      queryKeys.calendar("unit-1", "2026-10"),
    ];
    const members = {
      members: [{ id: "me" }, { id: "blocked" }, { id: "other" }],
    };
    const calendars = calendarKeys.map((key) => ({
      key,
      value: {
        month: String(key[2]),
        days: [{ date: "2026-09-01", count: 3 }],
        attendees: [
          { userId: "me", name: "나" },
          { userId: "blocked", name: "차단 대상" },
          { userId: "other", name: "다른 사람" },
        ],
      },
    }));
    queryClient.setQueryData(memberKey, members);
    for (const calendar of calendars) {
      queryClient.setQueryData(calendar.key, calendar.value);
    }

    // These stale observers model GETs that started before POST /blocks. Their
    // late responses contain the now-hidden user and must never restore it.
    const memberResponse = deferred<typeof members>();
    const memberGet = vi.fn(() => memberResponse.promise);
    const calendarResponses = calendars.map(() =>
      deferred<(typeof calendars)[number]["value"]>(),
    );
    const calendarGets = calendarResponses.map((response) =>
      vi.fn(() => response.promise),
    );
    const observers = [
      new QueryObserver(queryClient, {
        queryKey: memberKey,
        queryFn: memberGet,
        staleTime: 0,
      }),
      ...calendars.map(
        (calendar, index) =>
          new QueryObserver(queryClient, {
            queryKey: calendar.key,
            queryFn: calendarGets[index]!,
            staleTime: 0,
          }),
      ),
    ];
    const unsubscribe = observers.map((observer) =>
      observer.subscribe(() => undefined),
    );
    await waitFor(() => expect(memberGet).toHaveBeenCalledTimes(1));
    for (const get of calendarGets) expect(get).toHaveBeenCalledTimes(1);

    const view = renderHook(() => useBlockUser(), { wrapper });
    await act(() => view.result.current.mutateAsync({ userId: "blocked" }));

    expect(
      queryClient
        .getQueryData<typeof members>(memberKey)
        ?.members.map((member) => member.id),
    ).toEqual(["me", "other"]);
    for (const calendar of calendars) {
      expect(
        queryClient
          .getQueryData<typeof calendar.value>(calendar.key)
          ?.attendees.map((attendee) => attendee.userId),
      ).toEqual(["me", "other"]);
      expect(
        queryClient.getQueryData<typeof calendar.value>(calendar.key)?.days,
      ).toEqual(calendar.value.days);
    }

    await act(async () => {
      memberResponse.resolve(members);
      calendarResponses.forEach((response, index) =>
        response.resolve(calendars[index]!.value),
      );
      await Promise.all([
        memberResponse.promise,
        ...calendarResponses.map((response) => response.promise),
      ]);
      await Promise.resolve();
    });
    expect(
      queryClient
        .getQueryData<typeof members>(memberKey)
        ?.members.some((member) => member.id === "blocked"),
    ).toBe(false);
    for (const get of calendarGets) expect(get).toHaveBeenCalledTimes(1);
    expect(memberGet).toHaveBeenCalledTimes(1);
    unsubscribe.forEach((stop) => stop());
  });
});

describe("conditional notification invalidation", () => {
  it("adds no notification GET for an ordinary leave, but one when exceeded", async () => {
    const notificationsGet = vi.fn(() =>
      Promise.resolve({ notifications: [], unreadCount: 0 }),
    );
    let exceededDates: string[] = [];
    const client = {
      notifications: { $get: notificationsGet },
      leaves: {
        $post: () =>
          Promise.resolve({
            leave: { startDate: "2026-09-01", endDate: "2026-09-02" },
            exceededDates: [...exceededDates],
          }),
      },
    };
    const { wrapper } = setup(client);
    const view = renderHook(
      () => ({ notifications: useNotifications(), create: useCreateLeave() }),
      { wrapper },
    );
    await waitFor(() =>
      expect(view.result.current.notifications.isSuccess).toBe(true),
    );

    await act(() => view.result.current.create.mutateAsync({} as never));
    expect(notificationsGet).toHaveBeenCalledTimes(1);

    exceededDates = ["2026-09-01"];
    await act(() => view.result.current.create.mutateAsync({} as never));
    await waitFor(() => expect(notificationsGet).toHaveBeenCalledTimes(2));
  });
});

describe("notification summary polling", () => {
  it("fetches only the unread count endpoint for a badge observer", async () => {
    const fullGet = vi.fn(() =>
      Promise.resolve({ notifications: [], unreadCount: 7 }),
    );
    const summaryGet = vi.fn(() => Promise.resolve({ unreadCount: 7 }));
    const { wrapper } = setup({
      notifications: {
        $get: fullGet,
        summary: { $get: summaryGet },
      },
    });
    const view = renderHook(() => useNotificationSummary(), { wrapper });
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data).toEqual({ unreadCount: 7 });
    expect(summaryGet).toHaveBeenCalledTimes(1);
    expect(fullGet).not.toHaveBeenCalled();
  });

  it("does not fetch while the full inbox page owns freshness", async () => {
    const summaryGet = vi.fn(() => Promise.resolve({ unreadCount: 7 }));
    const fullGet = vi.fn(() =>
      Promise.resolve({ notifications: [], unreadCount: 7 }),
    );
    const { wrapper } = setup({
      notifications: {
        $get: fullGet,
        summary: { $get: summaryGet },
      },
    });
    const view = renderHook(
      () => ({
        summary: useNotificationSummary({ enabled: false }),
        inboxCache: useNotifications({ enabled: false }),
      }),
      { wrapper },
    );
    await act(async () => Promise.resolve());
    expect(view.result.current.summary.fetchStatus).toBe("idle");
    expect(view.result.current.inboxCache.fetchStatus).toBe("idle");
    expect(summaryGet).not.toHaveBeenCalled();
    expect(fullGet).not.toHaveBeenCalled();
  });
});
