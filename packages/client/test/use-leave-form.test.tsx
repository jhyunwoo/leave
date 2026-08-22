/**
 * 휴가 폼 상태 기계 — 웹과 네이티브가 공유하는 유일한 폼 로직.
 *
 * 여기서 지키려는 것은 "무엇을 막고 무엇을 보내는가"다.
 *  - 기간을 바꾸면 구간이 항상 기간 전체를 덮는다(빈틈이 있으면 서버가 400을 준다).
 *  - 잔여가 모자라면 저장을 막고 이유를 사람 말로 알려준다.
 *  - 저장할 때 서버로 가는 입력이 화면 상태와 정확히 일치한다.
 *
 * 이 규칙이 깨지면 두 앱이 동시에 깨지고, 화면을 열어보기 전까지 드러나지 않는다.
 */
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLeaveForm } from "../src/forms/use-leave-form";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

type BalanceFixture = {
  key: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  remainingAsOfTodayDays: number;
};

type SetupContext = {
  dischargeAt?: string;
  leaves?: unknown[];
  regularOvernight?: {
    enabled: boolean;
    startDate: string;
    intervalDays: number;
    daysPerGrant: number;
  } | null;
};

/** 연가 5일만 남은 사용자. 그룹은 없어 달력 조회가 일어나지 않는다. */
function setup(
  createLeave = vi.fn((_args: { json: unknown }) =>
    Promise.resolve({
      leave: { startDate: "2026-09-01", endDate: "2026-09-03" },
      exceededDates: [],
    }),
  ),
  balanceItems: BalanceFixture[] = [
    {
      key: "annual",
      totalDays: 5,
      usedDays: 0,
      remainingDays: 5,
      remainingAsOfTodayDays: 5,
    },
  ],
  getBalances?: () => Promise<{
    balances: BalanceFixture[];
    regularOvernight: SetupContext["regularOvernight"];
  }>,
  context: SetupContext = {},
) {
  const client = {
    auth: {
      me: {
        $get: () =>
          Promise.resolve({
            user: {
              id: "u1",
              dischargeAt: context.dischargeAt ?? "2027-12-31",
            },
            unit: null,
          }),
      },
    },
    leaves: {
      mine: { $get: () => Promise.resolve({ leaves: context.leaves ?? [] }) },
      balances: {
        $get:
          getBalances ??
          (() =>
            Promise.resolve({
              balances: balanceItems,
              regularOvernight: context.regularOvernight ?? null,
            })),
      },
      $post: createLeave,
    },
  };
  const queryClient = testQueryClient();
  const adapter = testAdapter({
    client,
  });
  return {
    createLeave,
    queryClient,
    wrapper: wrapperFor(queryClient, adapter),
  };
}

/** 잔여를 읽어와야 검사가 의미 있으므로 로딩이 끝날 때까지 기다린다. */
async function renderForm(
  wrapper: ReturnType<typeof setup>["wrapper"],
  initialDate = "2026-09-01",
) {
  const view = renderHook(() => useLeaveForm({ initialDate }), { wrapper });
  await waitFor(() =>
    expect(view.result.current.submitBlocker).not.toBe(
      "시작일과 종료일을 확인해주세요.",
    ),
  );
  return view;
}

describe("기본 휴가 종류", () => {
  it("등록할 때 아직 실제로 쓰지 않은 잔여가 가장 많은 종류를 선택한다", async () => {
    const { wrapper } = setup(undefined, [
      // 미래 계획은 아직 사용한 휴가가 아니므로 오늘까지 실제 사용한 양만 뺀다.
      {
        key: "annual",
        totalDays: 20,
        usedDays: 20,
        remainingDays: 0,
        remainingAsOfTodayDays: 8,
      },
      {
        key: "award",
        totalDays: 10,
        usedDays: 3,
        remainingDays: 7,
        remainingAsOfTodayDays: 7,
      },
      {
        key: "consolation",
        totalDays: 6,
        usedDays: 1,
        remainingDays: 5,
        remainingAsOfTodayDays: 5,
      },
    ]);
    const { result } = await renderForm(wrapper);

    await waitFor(() => expect(result.current.drafts[0]?.key).toBe("annual"));
  });

  it("취소 직후 최신 잔여가 도착하면 기본 종류를 다시 선택한다", async () => {
    const { wrapper, queryClient } = setup(undefined, [
      {
        key: "annual",
        totalDays: 8,
        usedDays: 0,
        remainingDays: 8,
        remainingAsOfTodayDays: 8,
      },
      {
        key: "regular_overnight",
        totalDays: 4,
        usedDays: 4,
        remainingDays: 0,
        remainingAsOfTodayDays: 0,
      },
    ]);
    const { result } = await renderForm(wrapper);
    await waitFor(() => expect(result.current.drafts[0]?.key).toBe("annual"));

    act(() => {
      queryClient.setQueryData(queryKeys.leaveBalances, {
        balances: [
          {
            key: "annual",
            totalDays: 8,
            usedDays: 8,
            remainingDays: 0,
            remainingAsOfTodayDays: 0,
          },
          {
            key: "regular_overnight",
            totalDays: 4,
            usedDays: 0,
            remainingDays: 4,
            remainingAsOfTodayDays: 4,
          },
        ],
        regularOvernight: null,
      });
    });

    await waitFor(() =>
      expect(result.current.drafts[0]?.key).toBe("regular_overnight"),
    );
  });

  it("미래 날짜에는 취소된 계획을 빼고 해당 정기외박 주기 잔여를 선택한다", async () => {
    const { wrapper } = setup(
      undefined,
      [
        {
          key: "annual",
          totalDays: 0,
          usedDays: 0,
          remainingDays: 0,
          remainingAsOfTodayDays: 0,
        },
        // balances의 스칼라 값은 현재 주기 값이라 미래 주기에는 쓸 수 없다.
        {
          key: "regular_overnight",
          totalDays: 0,
          usedDays: 0,
          remainingDays: 0,
          remainingAsOfTodayDays: 0,
        },
      ],
      undefined,
      {
        dischargeAt: "2027-12-31",
        regularOvernight: {
          enabled: true,
          startDate: "2026-01-01",
          intervalDays: 90,
          daysPerGrant: 4,
        },
        leaves: [
          {
            id: "cancelled-regular",
            title: "취소한 정기외박",
            status: "cancelled",
            startDate: "2027-08-01",
            endDate: "2027-08-04",
            segments: [
              {
                category: "overnight",
                overnightKind: "regular",
                startDate: "2027-08-01",
                endDate: "2027-08-04",
                days: 4,
              },
            ],
          },
        ],
      },
    );
    const { result } = await renderForm(wrapper, "2027-08-01");

    await waitFor(() =>
      expect(result.current.drafts[0]?.key).toBe("regular_overnight"),
    );
  });

  it("잔여를 불러오는 동안 사용자가 고른 종류는 덮어쓰지 않는다", async () => {
    let resolveBalances!: (value: {
      balances: BalanceFixture[];
      regularOvernight: null;
    }) => void;
    const balancesResponse = new Promise<{
      balances: BalanceFixture[];
      regularOvernight: null;
    }>((resolve) => {
      resolveBalances = resolve;
    });
    const { wrapper } = setup(undefined, [], () => balancesResponse);
    const { result } = await renderForm(wrapper);

    act(() => {
      result.current.setDrafts((current) =>
        current.map((draft) => ({ ...draft, key: "consolation" })),
      );
    });
    await act(async () => {
      resolveBalances({
        balances: [
          {
            key: "annual",
            totalDays: 2,
            usedDays: 0,
            remainingDays: 2,
            remainingAsOfTodayDays: 2,
          },
          {
            key: "award",
            totalDays: 8,
            usedDays: 0,
            remainingDays: 8,
            remainingAsOfTodayDays: 8,
          },
        ],
        regularOvernight: null,
      });
      await balancesResponse;
    });

    await waitFor(() =>
      expect(
        result.current.rowAvailable("2026-09-01", "2026-09-01").get("award"),
      ).toBe(8),
    );
    expect(result.current.drafts[0]?.key).toBe("consolation");
  });
});

describe("기간 변경", () => {
  it("구간이 항상 기간 전체를 빈틈없이 덮는다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.applyRange("2026-09-01", "2026-09-04"));

    await waitFor(() => expect(result.current.duration).toBe(4));
    const resolved = result.current.resolved;
    expect(resolved[0]?.startDate).toBe("2026-09-01");
    expect(resolved[resolved.length - 1]?.endDate).toBe("2026-09-04");
    expect(resolved.reduce((sum, draft) => sum + draft.days, 0)).toBe(4);
  });
});

describe("잔여 검사", () => {
  it("남은 일수를 넘기면 저장을 막고 초과한 일수를 알려준다", async () => {
    const { wrapper, createLeave } = setup();
    const { result } = await renderForm(wrapper);

    // 연가 잔여는 5일인데 7일을 잡는다.
    act(() => result.current.applyRange("2026-09-01", "2026-09-07"));
    act(() => result.current.setTitle("연가"));

    await waitFor(() => expect(result.current.canSubmit).toBe(false));
    expect(result.current.balanceBlockMessage).toContain("2일 초과");

    await act(async () => {
      expect(await result.current.submit()).toBeNull();
    });
    expect(createLeave).not.toHaveBeenCalled();
    expect(result.current.error).toContain("초과");
  });

  it("잔여 안이면 저장하고 화면 상태 그대로 서버에 보낸다", async () => {
    const { wrapper, createLeave } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.applyRange("2026-09-01", "2026-09-03"));
    act(() => result.current.setTitle("  제주도 휴가  "));
    act(() => result.current.setReason("  가족 여행  "));

    await waitFor(() => expect(result.current.canSubmit).toBe(true));
    await act(async () => {
      expect(await result.current.submit()).not.toBeNull();
    });

    expect(createLeave).toHaveBeenCalledTimes(1);
    expect(createLeave.mock.calls[0]?.[0]).toEqual({
      json: {
        // 앞뒤 공백은 제거해서 보낸다.
        title: "제주도 휴가",
        reason: "가족 여행",
        status: "shared",
        segments: [
          {
            category: "annual",
            startDate: "2026-09-01",
            endDate: "2026-09-03",
          },
        ],
      },
    });
  });
});

describe("제목", () => {
  it("제목을 직접 받는 화면에서는 비어 있으면 저장을 막는다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.applyRange("2026-09-01", "2026-09-02"));

    await waitFor(() =>
      expect(result.current.submitBlocker).toBe("휴가 제목을 입력해주세요."),
    );
  });
});
