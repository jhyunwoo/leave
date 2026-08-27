/**
 * 그룹(부대) 훅.
 *
 * 사용처: 그룹 참여/생성 화면, 그룹 관리 화면, 구성원 목록.
 *
 * 그룹 소속이 바뀌면 달력·휴가·알림까지 전부 다른 그룹 기준이 되므로,
 * 가입·탈퇴·이양처럼 소속이 흔들리는 뮤테이션은 캐시 전체를 무효화한다.
 */
import type {
  UnitCreateInput,
  UnitInviteCreateInput,
  UnitJoinInput,
  UnitTransferInput,
  UnitUpdateInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { IssuedUnitInvite, Member, Unit } from "../types";

/** 소속이 바뀌는 뮤테이션은 화면 전체가 다른 그룹 기준이 되므로 전부 다시 받는다. */
function useInvalidateAll() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries();
  };
}

/** 새 그룹을 만든다. 만든 사람이 관리자가 되고 초대코드가 함께 발급된다. */
export function useCreateUnit() {
  const { client, unwrap } = useLeaveApi();
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: UnitCreateInput) =>
      unwrap<{ unit: Unit; invite: IssuedUnitInvite }>(
        await client.units.$post({ json: input }),
      ),
    onSuccess: invalidateAll,
  });
}

/** 검색이나 그룹 UUID 노출 없이, 고엔트로피 초대코드로만 가입한다. */
export function useJoinUnit() {
  const { client, unwrap } = useLeaveApi();
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: UnitJoinInput) =>
      unwrap<{ joined: true; unit: Unit }>(
        await client.units.join.$post({ json: input }),
      ),
    onSuccess: invalidateAll,
  });
}

/**
 * 초대코드를 새로 발급한다(이전 코드는 무효).
 * 코드 원문은 응답에만 담기고 서버에는 해시만 남으므로, 이 응답을 놓치면 다시 볼 수 없다.
 */
export function useRotateUnitInvite(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  return useMutation({
    mutationFn: async (input: UnitInviteCreateInput = {}) =>
      unwrap<{ invite: IssuedUnitInvite }>(
        await client.units[":id"].invite.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
  });
}

/**
 * 그룹에서 나간다.
 *
 * 나가는 순간 그룹 달력·구성원 명단·제한 기간을 볼 근거가 사라진다. 무효화만
 * 하면 본문은 캐시에 그대로 남는다 — 낡았다고 표시될 뿐 지워지지는 않는다.
 * 그리고 앱은 `calendar`를 오프라인용으로 디스크에 최대 24시간 남기므로
 * (apps/native/src/lib/query-persistence.ts), 나간 뒤에도 옛 동료의 이름과
 * 휴가 날짜가 기기에 하루 더 머문다.
 *
 * 친구를 끊을 때 이미 같은 판단을 내려 뒀다 — hooks/friends.ts의
 * `purgeFriendCalendarAccess`는 무효화가 아니라 removeQueries를 쓴다.
 * 소속이 끊기는 것도 같은 종류의 사건이므로 같게 다룬다.
 */
export function useLeaveUnit() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async () => unwrap(await client.units.leave.$post()),
    onSuccess: async () => {
      const revoked = [
        queryKeys.calendars,
        queryKeys.allUnitMembers,
        queryKeys.allBlackouts,
      ];
      // 진행 중인 요청이 지운 자리에 응답을 도로 채우지 않도록 먼저 끊는다.
      await Promise.all(
        revoked.map((queryKey) => queryClient.cancelQueries({ queryKey })),
      );
      for (const queryKey of revoked) {
        queryClient.removeQueries({ queryKey });
      }
      invalidateAll();
    },
  });
}

/** 그룹 구성원 목록. unitId가 없으면(그룹 미소속) 요청하지 않는다. */
export function useUnitMembers(unitId: string | null, enabled = true) {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.unitMembers(unitId),
    enabled: enabled && unitId !== null,
    queryFn: async (context) =>
      unwrap<{ members: Member[] }>(
        await client.units[":id"].members.$get(
          { param: { id: unitId! } },
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

/** 그룹 정보 수정(관리자 전용). 최대 출타 인원이 바뀌면 달력 판정도 달라진다. */
export function useUpdateUnit(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: UnitUpdateInput) =>
      unwrap<{ unit: Unit }>(
        await client.units[":id"].$patch({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: invalidateAll,
  });
}

/** 구성원 강제 탈퇴(관리자 전용). */
export function useRemoveMember(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await client.units[":id"].members[":userId"].remove.$post({
          param: { id: unitId, userId },
        }),
      ),
    onSuccess: invalidateAll,
  });
}

/** 관리자 권한을 다른 구성원에게 넘긴다. 넘긴 순간 내 권한이 사라진다. */
export function useTransferAdmin(unitId: string) {
  const { client, unwrap } = useLeaveApi();
  const invalidateAll = useInvalidateAll();
  return useMutation({
    mutationFn: async (input: UnitTransferInput) =>
      unwrap<{ unit: Unit }>(
        await client.units[":id"].transfer.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: invalidateAll,
  });
}
