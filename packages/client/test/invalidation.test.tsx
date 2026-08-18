/**
 * 뮤테이션 뒤에 어떤 캐시가 낡는가.
 *
 * 이 계층에서 가장 조용히 틀리는 부분이다 — 무효화를 빠뜨려도 화면은 멀쩡히
 * 뜨고, 며칠 지난 잔여일수를 그대로 보여준다. 그래서 "성공 후 이 키들이 비어야
 * 한다"를 키 이름이 아니라 실제 캐시 상태로 확인한다.
 */
import { renderHook, waitFor } from "@testing-library/react";
import type { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { useCreateLeave, useCreateLeaveGrant } from "../src/hooks/leaves";
import { useCreateBlackout } from "../src/hooks/blackouts";
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
  queryKeys.calendar("unit-1", "2026-09"),
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

describe("휴가 등록", () => {
  it("달력·내 휴가·알림·잔여·적립분을 함께 비운다", async () => {
    const client = {
      leaves: {
        $post: () => Promise.resolve({ leave: {}, exceededDates: [] }),
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
            queryKeys.notifications,
            queryKeys.leaveBalances,
            queryKeys.leaveGrants,
          ].map((key) => JSON.stringify(key)),
        ),
      ),
    );
  });
});

describe("적립분 추가", () => {
  it("적립분과 재원 잔여만 비운다 — 달력은 그대로다", async () => {
    const client = { leaves: { grants: { $post: () => Promise.resolve({}) } } };
    const { queryClient, wrapper } = setup(client);
    const { result } = renderHook(() => useCreateLeaveGrant(), { wrapper });

    result.current.mutate({ balanceKey: "annual", days: 3 } as never);

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    await waitFor(() =>
      expect(new Set(staleKeys(queryClient))).toEqual(
        new Set(
          [queryKeys.leaveGrants, queryKeys.leaveBalances].map((key) =>
            JSON.stringify(key),
          ),
        ),
      ),
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
          ].map((key) => JSON.stringify(key)),
        ),
      ),
    );
  });
});
