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
  LeaveStatusUpdateInput,
  RegularOvernightConfigInput,
} from "@leave/shared";
import { monthsSpanning } from "@leave/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type {
  LeaveBalanceSummary,
  LeaveGrantsPage,
  LeaveResult,
  MyLeave,
} from "../types";
import {
  invalidateCalendarMonths,
  LEAVE_MUTATION_KEYS,
  setAuthoritativeQueryData,
  useInvalidateKeys,
} from "./invalidate";

type MyLeavesPage = { leaves: MyLeave[] };

/** 서로의 총량을 바꾸는 보유 휴가 쓰기는 서버 적용 순서대로 한 건씩 처리한다. */
const LEAVE_HOLDINGS_MUTATION_SCOPE = { id: "leave-holdings" } as const;
const LEAVE_STATUS_MUTATION_KEY = ["leave-status"] as const;

function monthsForLeave(leave: Pick<MyLeave, "startDate" | "endDate">) {
  return monthsSpanning(leave.startDate, leave.endDate);
}

function cachedLeave(
  queryClient: QueryClient,
  leaveId: string,
): MyLeave | undefined {
  return queryClient
    .getQueryData<MyLeavesPage>(queryKeys.myLeaves)
    ?.leaves.find((leave) => leave.id === leaveId);
}

/* ------------------------------------------------------------------ */
/* 내 휴가                                                              */
/* ------------------------------------------------------------------ */

/** 내가 등록한 휴가 전체(초안 포함). */
export function useMyLeaves() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.myLeaves,
    queryFn: async (context) =>
      unwrap<{ leaves: MyLeave[] }>(
        await client.leaves.mine.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

/** 휴가 등록. 응답의 exceededDates는 저장 후 출타 기준을 넘긴 날짜들이다. */
export function useCreateLeave() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateKeys(LEAVE_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (input: LeaveCreateInput) =>
      unwrap<LeaveResult>(await client.leaves.$post({ json: input })),
    onSuccess: (data) => {
      invalidate();
      invalidateCalendarMonths(
        queryClient,
        new Set(monthsForLeave(data.leave)),
      );
      if (data.exceededDates.length > 0) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.notifications,
        });
      }
    },
  });
}

/** 휴가 수정. 등록과 같은 입력 스키마를 쓴다(전체 교체). */
export function useUpdateLeave() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateKeys(LEAVE_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (vars: { id: string; input: LeaveCreateInput }) =>
      unwrap<LeaveResult>(
        await client.leaves[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: (data, variables) => {
      const previous = cachedLeave(queryClient, variables.id);
      invalidate();
      invalidateCalendarMonths(
        queryClient,
        previous
          ? new Set([
              ...monthsForLeave(previous),
              ...monthsForLeave(data.leave),
            ])
          : null,
      );
      if (data.exceededDates.length > 0) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.notifications,
        });
      }
    },
  });
}

/** 목록에서 제목·기간·구간을 건드리지 않고 진행 상태만 빠르게 바꾼다. */
export function useUpdateLeaveStatus() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: LEAVE_STATUS_MUTATION_KEY,
    mutationFn: async (vars: {
      id: string;
      status: LeaveStatusUpdateInput["status"];
    }) =>
      unwrap<LeaveResult>(
        await client.leaves[":id"].status.$patch({
          param: { id: vars.id },
          json: { status: vars.status },
        }),
      ),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: queryKeys.myLeaves,
        exact: true,
      });
      const previousPage = queryClient.getQueryData<MyLeavesPage>(
        queryKeys.myLeaves,
      );
      const previousLeave = previousPage?.leaves.find(
        (leave) => leave.id === variables.id,
      );
      if (previousPage) {
        queryClient.setQueryData<MyLeavesPage>(queryKeys.myLeaves, {
          leaves: previousPage.leaves.map((leave) =>
            leave.id === variables.id
              ? { ...leave, status: variables.status }
              : leave,
          ),
        });
      }
      return { previousLeave };
    },
    onError: (_error, _variables, context) => {
      const previousLeave = context?.previousLeave;
      if (!previousLeave) return;
      queryClient.setQueryData<MyLeavesPage>(queryKeys.myLeaves, (current) =>
        current
          ? {
              leaves: current.leaves.map((leave) =>
                leave.id === previousLeave.id
                  ? { ...leave, status: previousLeave.status }
                  : leave,
              ),
            }
          : current,
      );
    },
    onSuccess: (data, _variables, context) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveBalances });
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveGrants });
      invalidateCalendarMonths(
        queryClient,
        context?.previousLeave
          ? new Set([
              ...monthsForLeave(context.previousLeave),
              ...monthsForLeave(data.leave),
            ])
          : null,
      );
      if (data.exceededDates.length > 0) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.notifications,
        });
      }
    },
    onSettled: () => {
      // 동시에 바꾼 다른 행의 낙관적 상태를 중간 refetch가 덮지 않도록 마지막
      // 상태 요청이 끝날 때 서버의 병합 결과를 한 번만 다시 받는다.
      if (
        queryClient.isMutating({ mutationKey: LEAVE_STATUS_MUTATION_KEY }) === 1
      ) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.myLeaves });
      }
    },
  });
}

/** 휴가 삭제. */
export function useDeleteLeave() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  const invalidate = useInvalidateKeys(LEAVE_MUTATION_KEYS);
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await client.leaves[":id"].$delete({ param: { id } })),
    onSuccess: (_data, leaveId) => {
      const previous = cachedLeave(queryClient, leaveId);
      invalidate();
      invalidateCalendarMonths(
        queryClient,
        previous ? new Set(monthsForLeave(previous)) : null,
      );
    },
  });
}

/* ------------------------------------------------------------------ */
/* 보유 휴가 요약 (재원별 총량/사용/잔여)                                */
/* ------------------------------------------------------------------ */

/** 재원별 보유·사용·잔여 요약 + 정기외박 설정. */
export function useLeaveBalances() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.leaveBalances,
    queryFn: async (context) =>
      unwrap<LeaveBalanceSummary>(
        await client.leaves.balances.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

/** 재원별 총 보유 일수를 직접 지정한다(적립분이 자동으로 맞춰진다). */
export function useUpdateLeaveBalances() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: LEAVE_HOLDINGS_MUTATION_SCOPE,
    mutationFn: async (input: LeaveBalanceUpdateInput) =>
      unwrap<LeaveBalanceSummary>(
        await client.leaves.balances.$put({ json: input }),
      ),
    onSuccess: async (data) => {
      await setAuthoritativeQueryData(
        queryClient,
        queryKeys.leaveBalances,
        data,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveGrants });
    },
  });
}

/**
 * 정기외박 설정(주기 길이·시작일·주기당 일수)을 바꾼다.
 * 주기 목록은 이 설정에서 파생하므로 보유 휴가 화면도 함께 다시 받아야 한다.
 */
export function useUpdateRegularOvernight() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: LEAVE_HOLDINGS_MUTATION_SCOPE,
    mutationFn: async (input: RegularOvernightConfigInput) =>
      unwrap<LeaveBalanceSummary>(
        await client.leaves["regular-overnight"].$put({ json: input }),
      ),
    onSuccess: async (data) => {
      await setAuthoritativeQueryData(
        queryClient,
        queryKeys.leaveBalances,
        data,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveGrants });
    },
  });
}

/* ------------------------------------------------------------------ */
/* 적립분 (언제 얼마가 부여됐고 언제까지 유효한가)                        */
/* ------------------------------------------------------------------ */

/** 재원별 적립분 목록 + 정기외박 주기별 사용 현황. */
export function useLeaveGrants() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.leaveGrants,
    queryFn: async (context) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

export function useCreateLeaveGrant() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: LEAVE_HOLDINGS_MUTATION_SCOPE,
    mutationFn: async (input: LeaveGrantCreateInput) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants.$post({ json: input }),
      ),
    onSuccess: async (data) => {
      await setAuthoritativeQueryData(queryClient, queryKeys.leaveGrants, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveBalances });
    },
  });
}

export function useUpdateLeaveGrant() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: LEAVE_HOLDINGS_MUTATION_SCOPE,
    mutationFn: async (vars: { id: string; input: LeaveGrantUpdateInput }) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: async (data) => {
      await setAuthoritativeQueryData(queryClient, queryKeys.leaveGrants, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveBalances });
    },
  });
}

export function useDeleteLeaveGrant() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    scope: LEAVE_HOLDINGS_MUTATION_SCOPE,
    mutationFn: async (id: string) =>
      unwrap<LeaveGrantsPage>(
        await client.leaves.grants[":id"].$delete({ param: { id } }),
      ),
    onSuccess: async (data) => {
      await setAuthoritativeQueryData(queryClient, queryKeys.leaveGrants, data);
      void queryClient.invalidateQueries({ queryKey: queryKeys.leaveBalances });
    },
  });
}
