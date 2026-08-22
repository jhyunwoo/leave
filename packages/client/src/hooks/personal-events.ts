import {
  monthsSpanning,
  type PersonalEventCreateInput,
  type PersonalEventUpdateInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { PersonalEvent } from "../types";

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
      adapter.client["personal-events"]
        .$get(
          { query: { month } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) =>
          adapter.unwrap<{ events: PersonalEvent[] }>(response),
        ),
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
    onSuccess: (_data, input) => invalidateEventMonths(queryClient, [input]),
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
