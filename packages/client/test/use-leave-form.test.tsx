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
  /** 그룹을 주면 달력 조회가 일어난다(혼잡도·추천의 근거). */
  unit?: { id: string; outingCounts: boolean } | null;
  calendarDays?: {
    date: string;
    count: number;
    allowed: number;
    exceeded: boolean;
    blocked: boolean;
  }[];
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
            unit: context.unit ?? null,
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
    units: {
      ":id": {
        calendar: {
          $get: ({ query }: { query: { month: string } }) =>
            Promise.resolve({
              month: query.month,
              days: context.calendarDays ?? [],
              leaves: [],
              attendees: [],
              blackouts: [],
              events: [],
            }),
        },
      },
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
      "휴가 시작일을 선택해주세요.",
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

describe("정기외박 주기 선택", () => {
  it("여러 주기에 하루라도 걸치면 차감할 주기를 직접 고른다", async () => {
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
        {
          key: "regular_overnight",
          totalDays: 4,
          usedDays: 0,
          remainingDays: 4,
          remainingAsOfTodayDays: 4,
        },
      ],
      undefined,
      {
        regularOvernight: {
          enabled: true,
          startDate: "2026-01-01",
          intervalDays: 30,
          daysPerGrant: 4,
        },
      },
    );
    const { result } = await renderForm(wrapper, "2026-03-01");

    await waitFor(() =>
      expect(result.current.drafts[0]?.key).toBe("regular_overnight"),
    );
    act(() => result.current.setDraftDays(0, 2));
    await waitFor(() =>
      expect(result.current.regularCycleChoices[0]).toHaveLength(2),
    );
    // 하루짜리였을 때 자동 선택된 첫 주기는 기간을 늘려도 유효하므로 유지한다.
    expect(result.current.resolved[0]?.regularOvernightCycleStart).toBe(
      result.current.regularCycleChoices[0]![0]!.start,
    );

    act(() =>
      result.current.setRegularOvernightCycle(
        0,
        result.current.regularCycleChoices[0]![1]!.start,
      ),
    );
    await waitFor(() =>
      expect(result.current.resolved[0]?.regularOvernightCycleStart).toBe(
        result.current.regularCycleChoices[0]![1]!.start,
      ),
    );
    expect(result.current.balanceBlockMessage).toBe("");
  });
});

describe("종류별 개수", () => {
  it("개수를 올리면 종료일이 따라 늘어난다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    // "연가 4개" = 9/1~9/4. 종료일을 고르는 것이 아니라 개수에서 나온다.
    act(() => result.current.setDraftDays(0, 4));

    await waitFor(() => expect(result.current.duration).toBe(4));
    expect(result.current.endDate).toBe("2026-09-04");
    expect(result.current.resolved).toMatchObject([
      { key: "annual", days: 4, startDate: "2026-09-01" },
    ]);
  });

  it("종류를 더하면 하루가 붙고 휴가가 그만큼 길어진다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.setDraftDays(0, 4));
    act(() => result.current.addDraft("award"));

    await waitFor(() => expect(result.current.duration).toBe(5));
    expect(result.current.endDate).toBe("2026-09-05");
    expect(result.current.resolved).toMatchObject([
      { key: "annual", startDate: "2026-09-01", endDate: "2026-09-04" },
      { key: "award", startDate: "2026-09-05", endDate: "2026-09-05" },
    ]);
  });

  it("순서를 바꾸면 총 기간은 그대로고 날짜만 다시 배치된다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.setDraftDays(0, 3));
    act(() => result.current.addDraft("award"));
    await waitFor(() => expect(result.current.duration).toBe(4));

    act(() => result.current.moveDraft(1, 0));

    await waitFor(() =>
      expect(result.current.resolved).toMatchObject([
        { key: "award", startDate: "2026-09-01", endDate: "2026-09-01" },
        { key: "annual", startDate: "2026-09-02", endDate: "2026-09-04" },
      ]),
    );
    expect(result.current.duration).toBe(4);
  });

  it("구간을 지우면 그 개수만큼 휴가가 짧아진다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.setDraftDays(0, 3));
    act(() => result.current.addDraft("award"));
    await waitFor(() => expect(result.current.duration).toBe(4));

    act(() => result.current.removeDraftAt(0));

    await waitFor(() => expect(result.current.duration).toBe(1));
    expect(result.current.resolved).toMatchObject([{ key: "award", days: 1 }]);
  });

  it("달력에서 기간을 좁히면 넘치는 뒤 구간이 떨어져 나간다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.setDraftDays(0, 3));
    act(() => result.current.addDraft("award"));
    await waitFor(() => expect(result.current.duration).toBe(4));

    act(() => result.current.applyRange("2026-09-01", "2026-09-02"));

    await waitFor(() => expect(result.current.duration).toBe(2));
    expect(result.current.resolved).toMatchObject([{ key: "annual", days: 2 }]);
  });

  it("366일을 넘기면 저장을 막는다 — 서버가 거절하는 값과 같은 상한이다", async () => {
    const { wrapper } = setup();
    const { result } = await renderForm(wrapper);

    act(() => result.current.setDraftDays(0, 367));

    await waitFor(() =>
      expect(result.current.submitBlocker).toContain("366일"),
    );
    expect(result.current.canSubmit).toBe(false);
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
        returnTime: "21:00",
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

describe("이 계획을 더하면 — 그룹이 외출을 세지 않을 때", () => {
  /** 9/1에 이미 2명, 기준 3명. 내 계획을 더하면 100%가 되는 자리다. */
  const days = [
    {
      date: "2026-09-01",
      count: 2,
      allowed: 3,
      exceeded: false,
      blocked: false,
    },
  ];

  it("외출만으로 이뤄진 계획은 자기 자신을 출타율에 더하지 않는다", async () => {
    const { wrapper } = setup(undefined, undefined, undefined, {
      unit: { id: "unit-1", outingCounts: false },
      calendarDays: days,
    });
    const { result } = await renderForm(wrapper);

    await waitFor(() =>
      expect(result.current.selectedSimulation?.peak).toBe(100),
    );

    act(() => result.current.setDrafts([{ key: "outing", days: 1 }]));

    await waitFor(() =>
      expect(result.current.selectedSimulation?.peak).toBe(67),
    );
    expect(result.current.selectedSimulation?.exceeded).toBe(false);
  });

  it("그룹이 외출을 세면 외출 계획도 평소처럼 한 명을 더한다", async () => {
    const { wrapper } = setup(undefined, undefined, undefined, {
      unit: { id: "unit-1", outingCounts: true },
      calendarDays: days,
    });
    const { result } = await renderForm(wrapper);

    act(() => result.current.setDrafts([{ key: "outing", days: 1 }]));

    await waitFor(() =>
      expect(result.current.selectedSimulation?.peak).toBe(100),
    );
  });
});
