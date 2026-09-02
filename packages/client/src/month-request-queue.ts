import type { LeaveApiAdapter } from "./context";

type PendingMonth<T> = {
  month: string;
  signal: AbortSignal | undefined;
  aborted: boolean;
  onAbort: (() => void) | undefined;
  group: PendingMonth<T>[] | undefined;
  controller: AbortController | undefined;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
};

type MonthQueue<T> = {
  pending: PendingMonth<T>[];
  scheduled: boolean;
  loadMonths: (
    months: string[],
    signal: AbortSignal | undefined,
  ) => Promise<Map<string, T>>;
};

function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  if (reason == null) return new Error("월별 요청이 취소되었습니다");
  return new Error("월별 요청이 취소되었습니다", { cause: reason });
}

function monthIndex(month: string): number {
  const [year, monthNumber] = month.split("-").map(Number);
  return year! * 12 + monthNumber! - 1;
}

/** API 계약인 최대 9개월, 9개월 이내 범위로 요청 묶음을 나눈다. */
export function groupMonthRequests<T extends { month: string }>(
  pending: T[],
): T[][] {
  const sorted = [...pending].sort((left, right) =>
    left.month.localeCompare(right.month),
  );
  const groups: T[][] = [];
  let group: T[] = [];
  let firstMonthIndex = 0;
  let uniqueMonths = new Set<string>();

  for (const request of sorted) {
    const requestMonthIndex = monthIndex(request.month);
    const isNewMonth = !uniqueMonths.has(request.month);
    if (
      group.length > 0 &&
      isNewMonth &&
      (uniqueMonths.size === 9 || requestMonthIndex - firstMonthIndex > 8)
    ) {
      groups.push(group);
      group = [];
      uniqueMonths = new Set();
    }
    if (group.length === 0) firstMonthIndex = requestMonthIndex;
    group.push(request);
    uniqueMonths.add(request.month);
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

/**
 * 같은 마이크로태스크에 시작한 월별 쿼리를 배치 전송하는 큐를 만든다.
 * 반환된 큐 하나는 응답 타입 하나에만 사용한다.
 */
export function createMonthRequestQueue<T>() {
  const queues = new WeakMap<LeaveApiAdapter, Map<string, MonthQueue<T>>>();

  async function fetchGroup(
    adapter: LeaveApiAdapter,
    queue: MonthQueue<T>,
    pending: PendingMonth<T>[],
  ): Promise<void> {
    const controller = new AbortController();
    for (const request of pending) {
      request.group = pending;
      request.controller = controller;
    }

    try {
      const months = [...new Set(pending.map((request) => request.month))];
      const byMonth = await queue.loadMonths(
        months,
        adapter.useRequestAbortSignal ? controller.signal : undefined,
      );
      for (const request of pending) {
        if (request.aborted) continue;
        const value = byMonth.get(request.month);
        if (value === undefined) {
          request.reject(
            new Error(`월별 배치 응답에 ${request.month} 데이터가 없습니다`),
          );
        } else {
          request.resolve(value);
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

  async function flush(
    adapter: LeaveApiAdapter,
    scope: string,
    queue: MonthQueue<T>,
  ): Promise<void> {
    queues.get(adapter)?.delete(scope);
    const pending = queue.pending.filter((request) => !request.aborted);
    await Promise.all(
      groupMonthRequests(pending).map((group) =>
        fetchGroup(adapter, queue, group),
      ),
    );
  }

  return function enqueueMonthRequest(options: {
    adapter: LeaveApiAdapter;
    scope: string;
    month: string;
    context: { readonly signal: AbortSignal };
    loadMonths: MonthQueue<T>["loadMonths"];
  }): Promise<T> {
    const { adapter, scope, month, context, loadMonths } = options;
    const signal = adapter.useRequestAbortSignal ? context.signal : undefined;

    if (!adapter.batchCalendarRequests) {
      return loadMonths([month], signal).then((byMonth) => {
        const value = byMonth.get(month);
        if (value === undefined) {
          throw new Error(`월별 응답에 ${month} 데이터가 없습니다`);
        }
        return value;
      });
    }
    if (signal?.aborted) return Promise.reject(abortReason(signal));

    let byScope = queues.get(adapter);
    if (!byScope) {
      byScope = new Map();
      queues.set(adapter, byScope);
    }
    let queue = byScope.get(scope);
    if (!queue) {
      queue = { pending: [], scheduled: false, loadMonths };
      byScope.set(scope, queue);
    }
    const activeQueue = queue;

    const promise = new Promise<T>((resolve, reject) => {
      const request: PendingMonth<T> = {
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
            request.group?.every((candidate) => candidate.aborted)
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
        void flush(adapter, scope, activeQueue);
      });
    }
    return promise;
  };
}
