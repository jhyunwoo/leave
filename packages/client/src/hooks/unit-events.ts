import {
  monthsSpanning,
  type UnitEventCreateInput,
  type UnitEventUpdateInput,
} from "@leave/shared";
import {
  useMutation,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { UnitEvent } from "../types";

function invalidateUnitEventMonths(
  queryClient: QueryClient,
  unitId: string,
  ranges: readonly { startDate: string; endDate: string }[],
) {
  const months = new Set(
    ranges.flatMap((range) => monthsSpanning(range.startDate, range.endDate)),
  );
  // 부대 휴일은 남은 일과일에서 빠지는 날이다. 여기서 휴일 여부까지 따지지 않고
  // 늘 버린다 — 일정 하나를 고칠 때 숫자 하나를 다시 받는 값싼 요청이고,
  // 반대로 빠뜨리면 달력과 프로필의 숫자가 조용히 어긋난다.
  void queryClient.invalidateQueries({ queryKey: queryKeys.dutyDays });
  return queryClient.invalidateQueries({
    queryKey: queryKeys.calendars,
    predicate: (query) =>
      query.queryKey[1] === unitId &&
      typeof query.queryKey[2] === "string" &&
      months.has(query.queryKey[2]),
  });
}

export function useCreateUnitEvent(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitEventCreateInput) =>
      unwrap<{ event: UnitEvent }>(
        await client.units[":id"].events.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: (_data, input) =>
      invalidateUnitEventMonths(queryClient, unitId, [input]),
  });
}

export function useUpdateUnitEvent(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      input,
    }: {
      id: string;
      input: UnitEventUpdateInput;
      previous: UnitEvent;
    }) =>
      unwrap<{ event: UnitEvent }>(
        await client.units[":id"].events[":eventId"].$patch({
          param: { id: unitId, eventId: id },
          json: input,
        }),
      ),
    onSuccess: (data, variables) =>
      invalidateUnitEventMonths(queryClient, unitId, [
        variables.previous,
        data.event,
      ]),
  });
}

export function useDeleteUnitEvent(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (event: UnitEvent) => {
      await unwrap(
        await client.units[":id"].events[":eventId"].$delete({
          param: { id: unitId, eventId: event.id },
        }),
      );
      return event;
    },
    onSuccess: (event) =>
      invalidateUnitEventMonths(queryClient, unitId, [event]),
  });
}
