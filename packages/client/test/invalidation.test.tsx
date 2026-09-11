/**
 * 뮤테이션 뒤에 어떤 캐시가 낡는가.
 *
 * 이 계층에서 가장 조용히 틀리는 부분이다 — 무효화를 빠뜨려도 화면은 멀쩡히
 * 뜨고, 며칠 지난 잔여일수를 그대로 보여준다. 그래서 "성공 후 이 키들이 비어야
 * 한다"를 키 이름이 아니라 실제 캐시 상태로 확인한다.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { QueryObserver, type QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  useCreateLeave,
  useCreateLeaveGrant,
  useDeleteLeave,
  useUpdateLeave,
  useUpdateLeaveStatus,
} from "../src/hooks/leaves";
import { useUpdateProfile } from "../src/hooks/auth";
import { useCreateBlackout } from "../src/hooks/blackouts";
import { useLeaveUnit } from "../src/hooks/units";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

/** 무효화 여부는 "다시 받아야 하는 상태인가"로 본다(제거가 아니라 stale 표시다). */
function staleKeys(queryClient: QueryClient): string[] {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => JSON.stringify(query.queryKey));
}

const SEEDED = [
  queryKeys.me,
  queryKeys.myLeaves,
  queryKeys.leaveBalances,
  queryKeys.leaveGrants,
  queryKeys.notifications,
  queryKeys.notificationSummary,
  queryKeys.calendar("unit-1", "2026-09"),
  queryKeys.calendar("unit-1", "2026-10"),
  queryKeys.calendar("unit-1", "2026-11"),
  queryKeys.blackouts("unit-1"),
  queryKeys.unitMembers("unit-1"),
];

function setup(client: unknown) {
  const queryClient = testQueryClient();
  for (const key of SEEDED) queryClient.setQueryData(key, { seeded: true });
  const adapter = testAdapter({
    client,
  });
  return { queryClient, wrapper: wrapperFor(queryClient, adapter) };
}

function staleCalendarMonths(queryClient: QueryClient): string[] {
  return queryClient
    .getQueryCache()
    .findAll({ queryKey: queryKeys.calendars })
    .filter((query) => query.state.isInvalidated)
    .map((query) => String(query.queryKey[2]))
    .sort();
}

describe("휴가 등록", () => {
  it("초과일이 없으면 달력·내 휴가·잔여·적립분만 비운다", async () => {
    const client = {
      leaves: {
        $post: () =>
          Promise.resolve({
            leave: { startDate: "2026-09-01", endDate: "2026-09-02" },
            exceededDates: [],
          }),
      },
    };
    const { queryClient, wrapper } = setup(client);
    const { result } = renderHook(() => useCreateLeave(), { wrapper });

    result.current.mutate({
      title: "연가",
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-02" },
      ],
    } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(new Set(staleKeys(queryClient))).toEqual(
        new Set(
          [
            queryKeys.calendar("unit-1", "2026-09"),
            queryKeys.myLeaves,
            queryKeys.leaveBalances,
            queryKeys.leaveGrants,
          ].map((key) => JSON.stringify(key)),
        ),
      ),
    );
  });

  it("초과일이 생겼을 때만 알림함도 비운다", async () => {
    const client = {
      leaves: {
        $post: () =>
          Promise.resolve({
            leave: { startDate: "2026-09-01", endDate: "2026-09-02" },
            exceededDates: ["2026-09-01"],
          }),
      },
    };
    const { queryClient, wrapper } = setup(client);
    const { result } = renderHook(() => useCreateLeave(), { wrapper });

    result.current.mutate({
      title: "연가",
      segments: [
        { category: "annual", startDate: "2026-09-01", endDate: "2026-09-02" },
      ],
    } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleKeys(queryClient)).toContain(
      JSON.stringify(queryKeys.notifications),
    );
    expect(staleKeys(queryClient)).toContain(
      JSON.stringify(queryKeys.notificationSummary),
    );
  });

  it("활성 달력 중 응답 기간과 겹치는 달만 다시 요청한다", async () => {
    const queryClient = testQueryClient();
    const calendarGets = new Map<string, ReturnType<typeof vi.fn>>();
    const activeMonths = [
      "2026-04",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
    ];
    const unsubscribe = activeMonths.map((month) => {
      const get = vi.fn(() => Promise.resolve({ month }));
      calendarGets.set(month, get);
      const observer = new QueryObserver(queryClient, {
        queryKey: queryKeys.calendar("unit-1", month),
        queryFn: get,
        staleTime: Infinity,
      });
      return observer.subscribe(() => undefined);
    });
    await waitFor(() =>
      expect(
        [...calendarGets.values()].reduce(
          (sum, get) => sum + get.mock.calls.length,
          0,
        ),
      ).toBe(11),
    );

    const client = {
      leaves: {
        $post: () =>
          Promise.resolve({
            leave: { startDate: "2026-09-10", endDate: "2026-09-12" },
            exceededDates: [],
          }),
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useCreateLeave(), { wrapper });

    result.current.mutate({} as never);

    await waitFor(() =>
      expect(calendarGets.get("2026-09")).toHaveBeenCalledTimes(2),
    );
    for (const month of activeMonths) {
      expect(calendarGets.get(month)).toHaveBeenCalledTimes(
        month === "2026-09" ? 2 : 1,
      );
    }
    unsubscribe.forEach((stop) => stop());
  });
});

describe("휴가 수정", () => {
  it("이전 기간과 새 기간의 합집합만 달력에서 비운다", async () => {
    const client = {
      leaves: {
        ":id": {
          $patch: () =>
            Promise.resolve({
              leave: { startDate: "2026-11-02", endDate: "2026-11-04" },
              exceededDates: [],
            }),
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, {
      leaves: [
        { id: "leave-1", startDate: "2026-09-28", endDate: "2026-09-30" },
      ],
    });
    const { result } = renderHook(() => useUpdateLeave(), { wrapper });

    result.current.mutate({ id: "leave-1", input: {} as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleCalendarMonths(queryClient)).toEqual(["2026-09", "2026-11"]);
  });

  it("이전 휴가가 캐시에 없으면 전체 달력 무효화로 되돌아간다", async () => {
    const client = {
      leaves: {
        ":id": {
          $patch: () =>
            Promise.resolve({
              leave: { startDate: "2026-11-02", endDate: "2026-11-04" },
              exceededDates: [],
            }),
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, { leaves: [] });
    const { result } = renderHook(() => useUpdateLeave(), { wrapper });

    result.current.mutate({ id: "missing", input: {} as never });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleCalendarMonths(queryClient)).toEqual([
      "2026-09",
      "2026-10",
      "2026-11",
    ]);
  });
});

describe("휴가 상태 빠른 변경", () => {
  it("상태만 보내고 즉시 반영한 뒤 관련 캐시를 비운다", async () => {
    let finish!: (value: unknown) => void;
    const patch = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const client = {
      leaves: { ":id": { status: { $patch: patch } } },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, {
      leaves: [
        {
          id: "leave-1",
          status: "shared",
          startDate: "2026-10-01",
          endDate: "2026-10-03",
        },
      ],
    });
    const { result } = renderHook(() => useUpdateLeaveStatus(), { wrapper });

    result.current.mutate({ id: "leave-1", status: "requested" });

    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ leaves: Array<{ status: string }> }>(
          queryKeys.myLeaves,
        )?.leaves[0]?.status,
      ).toBe("requested"),
    );
    expect(patch).toHaveBeenCalledWith({
      param: { id: "leave-1" },
      json: { status: "requested" },
    });

    finish({
      leave: {
        id: "leave-1",
        status: "requested",
        startDate: "2026-10-01",
        endDate: "2026-10-03",
      },
      exceededDates: [],
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleCalendarMonths(queryClient)).toEqual(["2026-10"]);
    expect(staleKeys(queryClient)).toEqual(
      expect.arrayContaining(
        [
          queryKeys.myLeaves,
          queryKeys.leaveBalances,
          queryKeys.leaveGrants,
        ].map((key) => JSON.stringify(key)),
      ),
    );
  });

  it("요청이 실패하면 낙관적으로 바꾼 상태를 되돌린다", async () => {
    let fail!: (error: Error) => void;
    const client = {
      leaves: {
        ":id": {
          status: {
            $patch: () =>
              new Promise((_resolve, reject) => {
                fail = reject;
              }),
          },
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, {
      leaves: [
        {
          id: "leave-1",
          status: "shared",
          startDate: "2026-10-01",
          endDate: "2026-10-03",
        },
        {
          id: "leave-2",
          status: "shared",
          startDate: "2026-11-01",
          endDate: "2026-11-02",
        },
      ],
    });
    const { result } = renderHook(() => useUpdateLeaveStatus(), { wrapper });

    result.current.mutate({ id: "leave-1", status: "approved" });
    await waitFor(() =>
      expect(
        queryClient.getQueryData<{ leaves: Array<{ status: string }> }>(
          queryKeys.myLeaves,
        )?.leaves[0]?.status,
      ).toBe("approved"),
    );

    queryClient.setQueryData<{
      leaves: Array<{
        id: string;
        status: string;
        startDate: string;
        endDate: string;
      }>;
    }>(queryKeys.myLeaves, (current) => ({
      leaves: (current?.leaves ?? []).map((leave) =>
        leave.id === "leave-2" ? { ...leave, status: "requested" } : leave,
      ),
    }));

    fail(new Error("network"));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(
      queryClient.getQueryData<{ leaves: Array<{ status: string }> }>(
        queryKeys.myLeaves,
      )?.leaves[0]?.status,
    ).toBe("shared");
    expect(
      queryClient
        .getQueryData<{ leaves: Array<{ id: string; status: string }> }>(
          queryKeys.myLeaves,
        )
        ?.leaves.find((leave) => leave.id === "leave-2")?.status,
    ).toBe("requested");
  });
});

describe("휴가 삭제", () => {
  it("서버가 과거 알림을 지우지 않으므로 알림함은 비우지 않는다", async () => {
    const client = {
      leaves: {
        ":id": { $delete: () => Promise.resolve({ ok: true }) },
      },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, { leaves: [] });
    const { result } = renderHook(() => useDeleteLeave(), { wrapper });

    result.current.mutate("leave-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleKeys(queryClient)).not.toContain(
      JSON.stringify(queryKeys.notifications),
    );
  });

  it("삭제 전 휴가 기간과 겹치는 달만 달력에서 비운다", async () => {
    const client = {
      leaves: {
        ":id": { $delete: () => Promise.resolve({ ok: true }) },
      },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, {
      leaves: [
        { id: "leave-1", startDate: "2026-10-01", endDate: "2026-10-03" },
      ],
    });
    const { result } = renderHook(() => useDeleteLeave(), { wrapper });

    result.current.mutate("leave-1");

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(staleCalendarMonths(queryClient)).toEqual(["2026-10"]);
  });
});

describe("적립분 추가", () => {
  it("응답으로 적립분 캐시를 갱신하고 재원 잔여만 비운다", async () => {
    const updated = { funds: [{ key: "annual" }] };
    const client = {
      leaves: { grants: { $post: () => Promise.resolve(updated) } },
    };
    const { queryClient, wrapper } = setup(client);
    const { result } = renderHook(() => useCreateLeaveGrant(), { wrapper });

    result.current.mutate({ balanceKey: "annual", days: 3 } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryData(queryKeys.leaveGrants)).toEqual(updated);
    expect(new Set(staleKeys(queryClient))).toEqual(
      new Set([queryKeys.leaveBalances].map((key) => JSON.stringify(key))),
    );
  });
});

describe("제한 기간 등록", () => {
  it("제한 기간과 달력을 함께 비운다 — 달력의 blocked 표시가 달라진다", async () => {
    const client = {
      units: {
        ":id": {
          blackouts: { $post: () => Promise.resolve({ blackout: {} }) },
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    const { result } = renderHook(() => useCreateBlackout("unit-1"), {
      wrapper,
    });

    result.current.mutate({
      startDate: "2026-09-01",
      endDate: "2026-09-03",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(new Set(staleKeys(queryClient))).toEqual(
        new Set(
          [
            queryKeys.blackouts("unit-1"),
            queryKeys.calendar("unit-1", "2026-09"),
            queryKeys.calendar("unit-1", "2026-10"),
            queryKeys.calendar("unit-1", "2026-11"),
          ].map((key) => JSON.stringify(key)),
        ),
      ),
    );
  });
});

/*
 * 그룹에서 나가는 것은 "낡았다"가 아니라 "볼 근거가 사라졌다"이다.
 *
 * 무효화만 하면 본문은 캐시에 그대로 남는다. 앱은 `calendar`를 오프라인용으로
 * 디스크에 최대 24시간 남기므로(apps/native/src/lib/query-persistence.ts),
 * 나간 뒤에도 옛 동료의 이름과 휴가 날짜가 기기에 하루 더 머물게 된다.
 * 친구를 끊을 때와 같은 판단(hooks/friends.ts의 purgeFriendCalendarAccess)을 따른다.
 */
describe("그룹 탈퇴", () => {
  it("그룹에 딸린 캐시는 무효화가 아니라 본문째 지운다", async () => {
    const { queryClient, wrapper } = setup({
      units: { leave: { $post: () => Promise.resolve({ ok: true }) } },
    });
    const { result } = renderHook(() => useLeaveUnit(), { wrapper });

    // 나가기 전에는 본문이 실제로 들어 있다.
    expect(
      queryClient.getQueryData(queryKeys.calendar("unit-1", "2026-09")),
    ).toEqual({ seeded: true });

    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    await waitFor(() => {
      for (const key of [
        queryKeys.calendar("unit-1", "2026-09"),
        queryKeys.calendar("unit-1", "2026-10"),
        queryKeys.calendar("unit-1", "2026-11"),
        queryKeys.unitMembers("unit-1"),
        queryKeys.blackouts("unit-1"),
      ]) {
        expect(
          queryClient.getQueryData(key),
          `${JSON.stringify(key)}의 본문이 남아 있다`,
        ).toBeUndefined();
      }
    });

    // 그룹과 무관한 캐시까지 날리지는 않는다 — 다시 받게만 한다.
    expect(queryClient.getQueryData(queryKeys.myLeaves)).toEqual({
      seeded: true,
    });
    expect(staleKeys(queryClient)).toContain(JSON.stringify(queryKeys.me));
  });
});

/**
 * 입대일·전역일·군종은 주기 목록과 "앞으로 받을 몫"의 입력이다
 * (`lib/leave-grants.ts`). 잔여·적립분을 빠뜨려 두는 동안 전역일을 고쳐도 보유 휴가
 * 화면이 옛 주기를 계속 그렸다. 온보딩 응답에도 같은 필드의 사본이 실린다.
 */
describe("내 정보 수정", () => {
  it("복무 정보에 딸린 캐시를 모두 비운다", async () => {
    const client = {
      auth: {
        me: { $patch: () => Promise.resolve({ user: { id: "me" } }) },
      },
    };
    const { queryClient, wrapper } = setup(client);
    // SEEDED에 넣지 않는다 — 그 목록은 다른 테스트의 "정확히 이 집합" 단정에 쓰인다.
    for (const key of [queryKeys.onboarding, queryKeys.dutyDays]) {
      queryClient.setQueryData(key, { seeded: true });
    }
    const { result } = renderHook(() => useUpdateProfile(), { wrapper });

    result.current.mutate({ dischargeAt: "2027-09-30" });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() => {
      const stale = new Set(staleKeys(queryClient));
      for (const key of [
        queryKeys.me,
        queryKeys.dutyDays,
        queryKeys.leaveBalances,
        queryKeys.leaveGrants,
        queryKeys.onboarding,
        queryKeys.calendar("unit-1", "2026-09"),
        queryKeys.unitMembers("unit-1"),
      ]) {
        expect(stale).toContain(JSON.stringify(key));
      }
    });
    // 관계 없는 캐시는 건드리지 않는다.
    expect(staleKeys(queryClient)).not.toContain(
      JSON.stringify(queryKeys.notifications),
    );
  });
});

/**
 * 낙관적 상태는 서버 확인으로 닫혀야 한다. `onSettled`는 자기 자신이 아직 pending으로
 * 세어지는 시점에 돌기 때문에, 개수로 "내가 마지막인가"를 판단하면 같은 틱에 둘이
 * 끝날 때 양쪽이 2를 읽고 아무도 다시 받지 않았다.
 */
describe("휴가 상태를 연달아 바꿀 때", () => {
  it("마지막 요청이 끝나면 내 휴가를 반드시 다시 받는다", async () => {
    const client = {
      leaves: {
        ":id": {
          status: {
            $patch: ({ param }: { param: { id: string } }) =>
              Promise.resolve({
                leave: {
                  id: param.id,
                  startDate: "2026-09-01",
                  endDate: "2026-09-02",
                  status: "approved",
                },
                exceededDates: [],
              }),
          },
        },
      },
    };
    const { queryClient, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, {
      leaves: [
        {
          id: "a",
          startDate: "2026-09-01",
          endDate: "2026-09-02",
          status: "shared",
        },
        {
          id: "b",
          startDate: "2026-09-03",
          endDate: "2026-09-04",
          status: "shared",
        },
      ],
    });
    const { result } = renderHook(() => useUpdateLeaveStatus(), { wrapper });

    // 같은 틱에 둘을 보낸다 — 예전에는 이 조합에서 재조회가 영영 돌지 않았다.
    await Promise.all([
      result.current.mutateAsync({ id: "a", status: "approved" } as never),
      result.current.mutateAsync({ id: "b", status: "approved" } as never),
    ]);

    await waitFor(() =>
      expect(staleKeys(queryClient)).toContain(
        JSON.stringify(queryKeys.myLeaves),
      ),
    );
  });
});
