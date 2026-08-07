/**
 * 제한 기간(검열·훈련 등) 훅.
 *
 * 사용처: 그룹 관리 화면(등록·삭제), 달력(경고 표시).
 * 제한 기간은 출타율과 무관하게 지휘관이 휴가를 막을 수 있는 구간을 알려주는
 * 참고 정보이며, 서버가 휴가 등록을 강제로 막지는 않는다.
 */
import type { BlackoutCreateInput } from "@leave/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { Blackout } from "../types";
import { BLACKOUT_MUTATION_KEYS, useInvalidateKeys } from "./invalidate";

/** 그룹의 제한 기간 목록. unitId가 없으면 요청하지 않는다. */
export function useBlackouts(unitId: string | null, enabled = true) {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.blackouts(unitId),
    enabled: enabled && unitId !== null,
    queryFn: async () =>
      unwrap<{ blackouts: Blackout[] }>(
        await client.units[":id"].blackouts.$get({ param: { id: unitId! } }),
      ),
  });
}

export function useCreateBlackout(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(BLACKOUT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (input: BlackoutCreateInput) =>
      unwrap<{ blackout: Blackout }>(
        await client.units[":id"].blackouts.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteBlackout(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(BLACKOUT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (blackoutId: string) =>
      unwrap(
        await client.units[":id"].blackouts[":blackoutId"].$delete({
          param: { id: unitId, blackoutId },
        }),
      ),
    onSuccess: invalidate,
  });
}
