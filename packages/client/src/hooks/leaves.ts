/**
 * 휴가·보유 휴가 훅.
 *
 * 사용처: 내 휴가 목록, 휴가 등록/수정 폼, 휴가 상세, 보유 휴가 화면.
 */
import type {
  LeaveBalanceUpdateInput,
  LeaveCreateInput,
  LeaveGrantCreateInput,
  LeaveGrantUpdateInput,
  RegularOvernightConfigInput,
} from "@leave/shared";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type {
  LeaveBalanceSummary,
  LeaveGrantsPage,
  LeaveResult,
  MyLeave,
} from "../types";
import {
  GRANT_MUTATION_KEYS,
  LEAVE_MUTATION_KEYS,
  useInvalidateKeys,
} from "./invalidate";

/* ------------------------------------------------------------------ */
/* 내 휴가                                                              */
/* ------------------------------------------------------------------ */

/** 내가 등록한 휴가 전체(초안 포함). */
export function useMyLeaves() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.myLeaves,
    queryFn: async () =>
      unwrap<{ leaves: MyLeave[] }>(await client.leaves.mine.$get()),
  });
}

/** 휴가 등록. 응답의 exceededDates는 저장 후 출타 기준을 넘긴 날짜들이다. */
export function useCreateLeave() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(LEAVE_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (input: LeaveCreateInput) =>
      unwrap<LeaveResult>(await client.leaves.$post({ json: input })),
    onSuccess: invalidate,
  });
}

/** 휴가 수정. 등록과 같은 입력 스키마를 쓴다(전체 교체). */
export function useUpdateLeave() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(LEAVE_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (vars: { id: string; input: LeaveCreateInput }) =>
      unwrap<LeaveResult>(
        await client.leaves[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: invalidate,
  });
}

/** 휴가 삭제. */
export function useDeleteLeave() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(LEAVE_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client.leaves[":id"].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}

/* ------------------------------------------------------------------ */
/* 보유 휴가 요약 (재원별 총량/사용/잔여)                                */
/* ------------------------------------------------------------------ */

/** 재원별 보유·사용·잔여 요약 + 정기외박 설정. */
export function useLeaveBalances() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.leaveBalances,
    queryFn: async () =>
      unwrap<LeaveBalanceSummary>(await client.leaves.balances.$get()),
  });
}

/** 재원별 총 보유 일수를 직접 지정한다(적립분이 자동으로 맞춰진다). */
export function useUpdateLeaveBalances() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(GRANT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (input: LeaveBalanceUpdateInput) =>
      unwrap<LeaveBalanceSummary>(
        await client.leaves.balances.$put({ json: input }),
      ),
    onSuccess: invalidate,
  });
}

/**
 * 정기외박 설정(주기 길이·시작일·주기당 일수)을 바꾼다.
 * 주기 목록은 이 설정에서 파생하므로 보유 휴가 화면도 함께 다시 받아야 한다.
 */
export function useUpdateRegularOvernight() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(GRANT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (input: RegularOvernightConfigInput) =>
      unwrap<LeaveBalanceSummary>(
        await client.leaves["regular-overnight"].$put({ json: input }),
      ),
    onSuccess: invalidate,
  });
}

/* ------------------------------------------------------------------ */
/* 적립분 (언제 얼마가 부여됐고 언제까지 유효한가)                        */
/* ------------------------------------------------------------------ */

/** 재원별 적립분 목록 + 정기외박 주기별 사용 현황. */
export function useLeaveGrants() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.leaveGrants,
    queryFn: async () =>
      unwrap<LeaveGrantsPage>(await client.leaves.grants.$get()),
  });
}

export function useCreateLeaveGrant() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(GRANT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (input: LeaveGrantCreateInput) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants.$post({ json: input }),
      ),
    onSuccess: invalidate,
  });
}

export function useUpdateLeaveGrant() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(GRANT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (vars: { id: string; input: LeaveGrantUpdateInput }) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteLeaveGrant() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys(GRANT_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants[":id"].$delete({ param: { id } }),
      ),
    onSuccess: invalidate,
  });
}
