import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useAuthBootstrap, useMe } from "../src/hooks/auth";
import { useCalendar } from "../src/hooks/calendar";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

const MONTHS = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"];
const LARGE_MONTH_RANGE = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
  "2026-07",
  "2026-08",
  "2026-09",
  "2026-10",
  "2026-11",
  "2026-12",
];

function useInitialCalendarWindow() {
  return [
    useCalendar("unit-1", MONTHS[0]!),
    useCalendar("unit-1", MONTHS[1]!),
    useCalendar("unit-1", MONTHS[2]!),
    useCalendar("unit-1", MONTHS[3]!),
    useCalendar("unit-1", MONTHS[4]!),
  ];
}

function useLargeCalendarRange() {
  return [
    useCalendar("unit-1", LARGE_MONTH_RANGE[0]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[1]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[2]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[3]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[4]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[5]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[6]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[7]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[8]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[9]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[10]!),
    useCalendar("unit-1", LARGE_MONTH_RANGE[11]!),
  ];
}

describe("웹 인증 부트스트랩", () => {
  it("한 GET으로 온보딩과 me 캐시를 모두 채운다", async () => {
    const bootstrapGet = vi.fn(() =>
      Promise.resolve({
        onboarding: {
          completed: true,
          profile: null,
          regularOvernight: null,
          unitId: "unit-1",
        },
        me: { user: { id: "user-1" }, unit: { id: "unit-1" } },
      }),
    );
    const meGet = vi.fn(() => Promise.resolve({ user: { id: "unexpected" } }));
    const client = {
      auth: {
        bootstrap: { $get: bootstrapGet },
        me: { $get: meGet },
      },
    };
    const queryClient = testQueryClient();
    queryClient.setQueryDefaults(queryKeys.me, { staleTime: Infinity });
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));

    const bootstrap = renderHook(() => useAuthBootstrap(), { wrapper });
    await waitFor(() => expect(bootstrap.result.current.isSuccess).toBe(true));
    expect(bootstrapGet).toHaveBeenCalledTimes(1);
    expect(queryClient.getQueryData(queryKeys.me)).toEqual({
      user: { id: "user-1" },
      unit: { id: "unit-1" },
    });

    const me = renderHook(() => useMe(), { wrapper });
    await waitFor(() => expect(me.result.current.isSuccess).toBe(true));
    expect(meGet).not.toHaveBeenCalled();
  });
});

describe("웹 달력 전송 배치", () => {
  it("5개 월별 쿼리 키를 한 배치 GET으로 채운다", async () => {
    const calendarGet = vi.fn();
    const calendarsGet = vi.fn((input: { query: { months: string } }) =>
      Promise.resolve({
        calendars: input.query.months.split(",").map((month) => ({ month })),
      }),
    );
    const client = {
      units: {
        ":id": {
          calendar: { $get: calendarGet },
          calendars: { $get: calendarsGet },
        },
      },
    };
    const queryClient = testQueryClient();
    const wrapper = wrapperFor(
      queryClient,
      testAdapter({ client, batchCalendarRequests: true }),
    );

    const { result } = renderHook(() => useInitialCalendarWindow(), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.every((query) => query.isSuccess)).toBe(true),
    );

    expect(calendarsGet).toHaveBeenCalledTimes(1);
    expect(calendarGet).not.toHaveBeenCalled();
    expect(calendarsGet.mock.calls[0]?.[0].query.months).toBe(MONTHS.join(","));
    for (const month of MONTHS) {
      expect(
        queryClient.getQueryData(queryKeys.calendar("unit-1", month)),
      ).toEqual({ month });
    }
  });

  it("옵트인하지 않은 어댑터는 기존 단일 월 전송을 유지한다", async () => {
    const calendarGet = vi.fn((input: { query: { month: string } }) =>
      Promise.resolve({ month: input.query.month }),
    );
    const calendarsGet = vi.fn();
    const client = {
      units: {
        ":id": {
          calendar: { $get: calendarGet },
          calendars: { $get: calendarsGet },
        },
      },
    };
    const wrapper = wrapperFor(testQueryClient(), testAdapter({ client }));

    const { result } = renderHook(() => useInitialCalendarWindow(), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.every((query) => query.isSuccess)).toBe(true),
    );

    expect(calendarGet).toHaveBeenCalledTimes(5);
    expect(calendarsGet).not.toHaveBeenCalled();
  });

  it("9개월을 넘는 유효 범위는 API 제한에 맞는 여러 배치로 나눈다", async () => {
    const calendarGet = vi.fn();
    const calendarsGet = vi.fn((input: { query: { months: string } }) =>
      Promise.resolve({
        calendars: input.query.months.split(",").map((month) => ({ month })),
      }),
    );
    const client = {
      units: {
        ":id": {
          calendar: { $get: calendarGet },
          calendars: { $get: calendarsGet },
        },
      },
    };
    const wrapper = wrapperFor(
      testQueryClient(),
      testAdapter({ client, batchCalendarRequests: true }),
    );

    const { result } = renderHook(() => useLargeCalendarRange(), { wrapper });
    await waitFor(() =>
      expect(result.current.every((query) => query.isSuccess)).toBe(true),
    );

    expect(calendarsGet).toHaveBeenCalledTimes(2);
    expect(calendarGet).not.toHaveBeenCalled();
    const batches = calendarsGet.mock.calls.map((call) =>
      call[0].query.months.split(","),
    );
    expect(batches.flat()).toEqual(LARGE_MONTH_RANGE);
    for (const batch of batches) {
      expect(batch.length).toBeLessThanOrEqual(9);
      const first = batch[0]!;
      const last = batch[batch.length - 1]!;
      const [firstYear, firstMonth] = first.split("-").map(Number);
      const [lastYear, lastMonth] = last.split("-").map(Number);
      expect(
        lastYear! * 12 + lastMonth! - firstYear! * 12 - firstMonth!,
      ).toBeLessThanOrEqual(8);
    }
  });
});
