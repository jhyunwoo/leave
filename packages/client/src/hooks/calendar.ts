/**
 * 달력 훅.
 *
 * 사용처: 웹 CalendarPage, 네이티브 캘린더 탭, 휴가 등록 폼(혼잡도 시뮬레이션).
 */
import { useQueries, useQuery } from "@tanstack/react-query";
import {
  queryRequestOptions,
  useLeaveApi,
  type LeaveApiAdapter,
} from "../context";
import { queryKeys } from "../query-keys";
import type { Calendar, CalendarBatch, CalendarDay } from "../types";

type PendingCalendar = {
  month: string;
  signal: AbortSignal | undefined;
  aborted: boolean;
  onAbort: (() => void) | undefined;
  group: PendingCalendar[] | undefined;
  controller: AbortController | undefined;
  resolve: (calendar: Calendar) => void;
  reject: (reason: unknown) => void;
};

type CalendarQueue = {
  pending: PendingCalendar[];
  scheduled: boolean;
};

/** 어댑터(=앱 인스턴스)·부대별로 같은 마이크로태스크의 월 요청만 합친다. */
const calendarQueues = new WeakMap<
  LeaveApiAdapter,
  Map<string, CalendarQueue>
>();

/**
 * 취소 사유를 reject에 실어 보낼 Error로 맞춘다.
 *
 * AbortSignal.reason은 보통 DOMException("AbortError")이라 그대로 통과한다.
 * 비-Error 사유(문자열 등)를 그대로 reject하면 스택도 name도 없는 값이 오류
 * 경로를 타므로, 사유를 cause에 남긴 Error로 감싼다.
 */
function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  if (reason == null) return new Error("달력 요청이 취소되었습니다");
  return new Error("달력 요청이 취소되었습니다", { cause: reason });
}

function calendarMonthIndex(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return year! * 12 + monthNumber! - 1;
}

/** API 계약(중복 없는 최대 9개월·9개월 범위)을 넘지 않게 전송 묶음을 나눈다. */
function calendarRequestGroups(
  pending: PendingCalendar[],
): PendingCalendar[][] {
  const sorted = [...pending].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const groups: PendingCalendar[][] = [];
  let group: PendingCalendar[] = [];
  let firstMonthIndex = 0;
  let uniqueMonths = new Set<string>();

  for (const request of sorted) {
    const monthIndex = calendarMonthIndex(request.month);
    const isNewMonth = !uniqueMonths.has(request.month);
    if (
      group.length > 0 &&
      isNewMonth &&
      (uniqueMonths.size === 9 || monthIndex - firstMonthIndex > 8)
    ) {
      groups.push(group);
      group = [];
      uniqueMonths = new Set();
    }
    if (group.length === 0) firstMonthIndex = monthIndex;
    group.push(request);
    uniqueMonths.add(request.month);
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

async function fetchCalendarGroup(
  adapter: LeaveApiAdapter,
  unitId: string,
  pending: PendingCalendar[],
): Promise<void> {
  const controller = new AbortController();
  for (const request of pending) {
    request.group = pending;
    request.controller = controller;
  }
  const requestOptions = adapter.useRequestAbortSignal
    ? { init: { signal: controller.signal } }
    : undefined;

  try {
    const months = [...new Set(pending.map((request) => request.month))];
    if (months.length === 1) {
      const month = months[0]!;
      const calendar = await adapter.unwrap<Calendar>(
        await adapter.client.units[":id"].calendar.$get(
          {
            param: { id: unitId },
            query: { month },
          },
          requestOptions,
        ),
      );
      for (const request of pending) {
        if (!request.aborted) request.resolve(calendar);
      }
      return;
    }

    const batch = await adapter.unwrap<CalendarBatch>(
      await adapter.client.units[":id"].calendars.$get(
        {
          param: { id: unitId },
          query: { months: months.join(",") },
        },
        requestOptions,
      ),
    );
    const byMonth = new Map(
      batch.calendars.map((calendar) => [calendar.month, calendar] as const),
    );
    for (const request of pending) {
      if (request.aborted) continue;
      const calendar = byMonth.get(request.month);
      if (calendar) {
        request.resolve(calendar);
      } else {
        request.reject(
          new Error(`달력 배치 응답에 ${request.month} 데이터가 없습니다`),
        );
      }
    }
  } catch (error) {
    for (const request of pending) {
      if (!request.aborted) request.reject(error);
    }
  } finally {
    for (const request of pending) {
      if (request.signal && request.onAbort) {
        request.signal.removeEventListener("abort", request.onAbort);
      }
    }
  }
}

async function flushCalendarQueue(
  adapter: LeaveApiAdapter,
  unitId: string,
  queue: CalendarQueue,
): Promise<void> {
  calendarQueues.get(adapter)?.delete(unitId);
  const pending = queue.pending.filter((request) => !request.aborted);
  await Promise.all(
    calendarRequestGroups(pending).map((group) =>
      fetchCalendarGroup(adapter, unitId, group),
    ),
  );
}

function enqueueCalendar(
  adapter: LeaveApiAdapter,
  unitId: string,
  month: string,
  context: { readonly signal: AbortSignal },
): Promise<Calendar> {
  if (!adapter.batchCalendarRequests) {
    return adapter.client.units[":id"].calendar
      .$get(
        { param: { id: unitId }, query: { month } },
        queryRequestOptions(adapter.useRequestAbortSignal, context),
      )
      .then((response) => adapter.unwrap<Calendar>(response));
  }

  const signal = adapter.useRequestAbortSignal ? context.signal : undefined;
  if (signal?.aborted) return Promise.reject(abortReason(signal));

  let byUnit = calendarQueues.get(adapter);
  if (!byUnit) {
    byUnit = new Map();
    calendarQueues.set(adapter, byUnit);
  }
  let queue = byUnit.get(unitId);
  if (!queue) {
    queue = { pending: [], scheduled: false };
    byUnit.set(unitId, queue);
  }
  const activeQueue = queue;

  const promise = new Promise<Calendar>((resolve, reject) => {
    const request: PendingCalendar = {
      month,
      signal,
      aborted: false,
      onAbort: undefined,
      group: undefined,
      controller: undefined,
      resolve,
      reject,
    };
    if (signal) {
      request.onAbort = () => {
        request.aborted = true;
        reject(abortReason(signal));
        if (
          request.controller &&
          request.group?.every((pending) => pending.aborted)
        ) {
          request.controller.abort(abortReason(signal));
        }
      };
      signal.addEventListener("abort", request.onAbort, { once: true });
    }
    activeQueue.pending.push(request);
  });

  if (!activeQueue.scheduled) {
    activeQueue.scheduled = true;
    queueMicrotask(() => {
      void flushCalendarQueue(adapter, unitId, activeQueue);
    });
  }
  return promise;
}

/**
 * 달력 한 달은 전역 기본값(15초)보다 오래 신선하게 본다.
 *
 * 달력은 달마다 별도 쿼리이고, 무한 스크롤은 같은 달을 오르내리며 몇 번씩 다시
 * 마운트한다. 15초로는 위아래로 두 번 훑는 것만으로 같은 달을 다시 받는다 —
 * 저대역·간헐적 연결에서 가장 아픈 종류의 낭비다.
 *
 * 그렇다고 오래된 값을 보여주는 것도 아니다. 내 휴가를 등록·수정·삭제하면
 * `LEAVE_MUTATION_KEYS`가 달력 전체를 무효화하고, 남이 바꾼 것은 앱으로 돌아올 때
 * (focusManager) 와 재연결 시 다시 받는다.
 */
const CALENDAR_STALE_TIME = 60_000;

/** 한 달치 달력(일별 출타 통계 + 그 달에 걸친 휴가들). */
export function useCalendar(unitId: string | null, month: string) {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.calendar(unitId, month),
    enabled: unitId !== null,
    staleTime: CALENDAR_STALE_TIME,
    queryFn: (context) => enqueueCalendar(adapter, unitId!, month, context),
  });
}

/**
 * 여러 달의 달력을 한 번에 받아 일별 통계를 하나로 합친다.
 *
 * 대안 날짜 추천은 선택 구간 밖(±2주)까지 살펴보므로, 한 달치만 들고 계산하면
 * 월초·월말 후보가 "데이터 없음"으로 조용히 버려진다.
 *
 * 각 달은 `useCalendar`와 같은 캐시 키를 쓰므로, 달력 화면이 이미 받아둔 달은
 * 다시 요청하지 않는다.
 */
export function useCalendarDays(unitId: string | null, months: string[]) {
  const adapter = useLeaveApi();
  return useQueries({
    queries: months.map((month) => ({
      queryKey: queryKeys.calendar(unitId, month),
      enabled: unitId !== null,
      staleTime: CALENDAR_STALE_TIME,
      queryFn: (context) => enqueueCalendar(adapter, unitId!, month, context),
    })),
    // combine은 결과가 실제로 바뀔 때만 다시 도는 React Query 내장 메모이제이션이다.
    // 바깥에서 useMemo로 감싸면 매 렌더 새 배열이 들어와 메모가 무력화된다.
    combine: (results) => {
      const byDate = new Map<string, CalendarDay>();
      for (const result of results) {
        for (const day of result.data?.days ?? []) byDate.set(day.date, day);
      }
      return {
        days: [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)),
        isPending: results.some((result) => result.isPending),
      };
    },
  });
}
