import {
  monthBounds,
  monthsSpanning,
  type PersonalEventCreateInput,
  type PersonalEventUpdateInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { createMonthRequestQueue } from "../month-request-queue";
import { queryKeys } from "../query-keys";
import type { PersonalEvent } from "../types";

type PersonalEventsMonth = { events: PersonalEvent[] };
const enqueuePersonalEvents = createMonthRequestQueue<PersonalEventsMonth>();

async function invalidateEventMonths(
  queryClient: ReturnType<typeof useQueryClient>,
  ranges: readonly { startDate: string; endDate: string }[],
) {
  const months = new Set(
    ranges.flatMap((range) => monthsSpanning(range.startDate, range.endDate)),
  );
  await Promise.all(
    [...months].map((month) =>
      queryClient.invalidateQueries({
        queryKey: queryKeys.personalEventsMonth(month),
      }),
    ),
  );
}

export function usePersonalEvents(month: string) {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.personalEventsMonth(month),
    queryFn: (context) =>
      enqueuePersonalEvents({
        adapter,
        scope: "personal-events",
        month,
        context,
        loadMonths: async (months, signal) => {
          const requestOptions = signal ? { init: { signal } } : undefined;
          if (months.length === 1) {
            const result = await adapter.unwrap<PersonalEventsMonth>(
              await adapter.client["personal-events"].$get(
                { query: { month: months[0]! } },
                requestOptions,
              ),
            );
            return new Map([[months[0]!, result]]);
          }
          const result = await adapter.unwrap<PersonalEventsMonth>(
            await adapter.client["personal-events"].calendars.$get(
              { query: { months: months.join(",") } },
              requestOptions,
            ),
          );
          return new Map(
            months.map((requestMonth) => {
              const { start, end } = monthBounds(requestMonth);
              return [
                requestMonth,
                {
                  events: result.events.filter(
                    (event) => event.startDate <= end && event.endDate >= start,
                  ),
                },
              ];
            }),
          );
        },
      }),
  });
}

export function useCreatePersonalEvent() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PersonalEventCreateInput) =>
      unwrap<{ event: PersonalEvent }>(
        await client["personal-events"].$post({ json: input }),
      ),
    // 서버가 돌려준 일정의 날짜로 무효화한다. 입력 기준으로 지우면 서버가 날짜를
    // 정규화하는 순간 엉뚱한 달이 새로 받아진다 — 수정·삭제는 이미 응답 기준이다.
    onSuccess: (data) => invalidateEventMonths(queryClient, [data.event]),
  });
}

export function useUpdatePersonalEvent() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: PersonalEventUpdateInput;
      previous: PersonalEvent;
    }) =>
      unwrap<{ event: PersonalEvent }>(
        await client["personal-events"][":id"].$patch({
          param: { id },
          json: input,
        }),
      ),
    onSuccess: async (data, variables) => {
      queryClient.setQueryData(queryKeys.personalEvent(variables.id), data);
      await invalidateEventMonths(queryClient, [
        variables.previous,
        data.event,
      ]);
    },
  });
}

export function useDeletePersonalEvent() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: PersonalEvent) => {
      await unwrap(
        await client["personal-events"][":id"].$delete({
          param: { id: event.id },
        }),
      );
      return event;
    },
    onSuccess: async (event) => {
      queryClient.removeQueries({
        queryKey: queryKeys.personalEvent(event.id),
      });
      await invalidateEventMonths(queryClient, [event]);
    },
  });
}
