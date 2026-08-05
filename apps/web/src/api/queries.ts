import type {
  BlackoutCreateInput,
  BlockCreateInput,
  LeaveBalanceUpdateInput,
  LeaveCreateInput,
  LeaveGrantCreateInput,
  LeaveGrantUpdateInput,
  LoginInput,
  NotificationPrefsInput,
  RegularOvernightConfigInput,
  ReportCreateInput,
  SignupInput,
  UnitCreateInput,
  UnitInviteCreateInput,
  UnitJoinInput,
  UnitTransferInput,
  UnitUpdateInput,
} from "@leave/shared";
import type { InferResponseType } from "hono/client";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useMemo } from "react";
import { tokenAtom } from "../state/auth";
import { api, ApiError, unwrap } from "./client";

export type Me = InferResponseType<typeof api.auth.me.$get, 200>;
export type Unit = InferResponseType<
  (typeof api.units)[":id"]["$get"],
  200
>["unit"];
export type Calendar = InferResponseType<
  (typeof api.units)[":id"]["calendar"]["$get"],
  200
>;
export type CalendarDay = Calendar["days"][number];
export type CalendarLeave = Calendar["leaves"][number];
export type MyLeave = InferResponseType<
  typeof api.leaves.mine.$get,
  200
>["leaves"][number];
export type NotificationList = InferResponseType<
  typeof api.notifications.$get,
  200
>;
export type Member = InferResponseType<
  (typeof api.units)[":id"]["members"]["$get"],
  200
>["members"][number];
export type IssuedUnitInvite = InferResponseType<
  (typeof api.units)[":id"]["invite"]["$post"],
  201
>["invite"];
export type AuthResponse = InferResponseType<typeof api.auth.login.$post, 200>;
export type LeaveBalanceSummary = InferResponseType<
  typeof api.leaves.balances.$get,
  200
>;

export function useMe(enabled: boolean) {
  const [, setToken] = useAtom(tokenAtom);
  return useQuery({
    queryKey: ["me"],
    enabled,
    retry: (count, error) =>
      error instanceof ApiError && error.status === 401 ? false : count < 2,
    queryFn: async () => {
      try {
        return await unwrap<Me>(await api.auth.me.$get());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) setToken(null);
        throw err;
      }
    },
  });
}

export function useLogin() {
  const [, setToken] = useAtom(tokenAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) =>
      unwrap<AuthResponse>(await api.auth.login.$post({ json: input })),
    onSuccess: (data) => {
      setToken(data.token);
      qc.clear();
    },
  });
}

export function useSignup() {
  const [, setToken] = useAtom(tokenAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignupInput) =>
      unwrap<AuthResponse>(await api.auth.signup.$post({ json: input })),
    onSuccess: (data) => {
      setToken(data.token);
      qc.clear();
    },
  });
}

export function useLogout() {
  const [, setToken] = useAtom(tokenAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.auth.logout.$post().catch(() => null);
    },
    onSettled: () => {
      setToken(null);
      qc.clear();
    },
  });
}

export function useDeleteAccount() {
  const [, setToken] = useAtom(tokenAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.auth.account.$delete()),
    onSuccess: () => {
      setToken(null);
      qc.clear();
    },
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitCreateInput) =>
      unwrap<{ unit: Unit; invite: IssuedUnitInvite }>(
        await api.units.$post({ json: input }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** 검색이나 그룹 UUID 노출 없이, 고엔트로피 초대코드로만 가입한다. */
export function useJoinUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitJoinInput) =>
      unwrap<{ joined: true; unit: Unit }>(
        await api.units.join.$post({ json: input }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRotateUnitInvite(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitInviteCreateInput = {}) =>
      unwrap<{ invite: IssuedUnitInvite }>(
        await api.units[":id"].invite.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
}

export function useLeaveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.units.leave.$post()),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useUnitMembers(unitId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["unitMembers", unitId],
    enabled: enabled && unitId !== null,
    queryFn: async () =>
      unwrap<{ members: Member[] }>(
        await api.units[":id"].members.$get({ param: { id: unitId! } }),
      ),
  });
}

/** 부대 정보 수정 (관리자). */
export function useUpdateUnit(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitUpdateInput) =>
      unwrap<{ unit: Unit }>(
        await api.units[":id"].$patch({ param: { id: unitId }, json: input }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRemoveMember(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await api.units[":id"].members[":userId"].remove.$post({
          param: { id: unitId, userId },
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useTransferAdmin(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitTransferInput) =>
      unwrap<{ unit: Unit }>(
        await api.units[":id"].transfer.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCalendar(unitId: string | null, month: string) {
  return useQuery({
    queryKey: ["calendar", unitId, month],
    enabled: unitId !== null,
    queryFn: async () =>
      unwrap<Calendar>(
        await api.units[":id"].calendar.$get({
          param: { id: unitId! },
          query: { month },
        }),
      ),
  });
}

/**
 * 여러 달의 달력을 한 번에 받아 일별 통계를 하나로 합친다.
 *
 * 대안 날짜 추천은 선택 구간 밖(±2주)까지 살펴보므로, 한 달치만 들고 계산하면
 * 월초·월말 후보가 "데이터 없음"으로 조용히 버려진다.
 */
export function useCalendarDays(unitId: string | null, months: string[]) {
  const results = useQueries({
    queries: months.map((month) => ({
      queryKey: ["calendar", unitId, month],
      enabled: unitId !== null,
      queryFn: async () =>
        unwrap<Calendar>(
          await api.units[":id"].calendar.$get({
            param: { id: unitId! },
            query: { month },
          }),
        ),
    })),
  });

  return useMemo(() => {
    const days = new Map<string, CalendarDay>();
    for (const result of results) {
      for (const day of result.data?.days ?? []) days.set(day.date, day);
    }
    return {
      days: [...days.values()].sort((a, b) => a.date.localeCompare(b.date)),
      isPending: results.some((result) => result.isPending),
    };
  }, [results]);
}

export function useMyLeaves() {
  return useQuery({
    queryKey: ["myLeaves"],
    queryFn: async () =>
      unwrap<{ leaves: MyLeave[] }>(await api.leaves.mine.$get()),
  });
}

export function useLeaveBalances() {
  return useQuery({
    queryKey: ["leaveBalances"],
    queryFn: async () =>
      unwrap<LeaveBalanceSummary>(await api.leaves.balances.$get()),
  });
}

export function useUpdateLeaveBalances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeaveBalanceUpdateInput) =>
      unwrap<LeaveBalanceSummary>(
        await api.leaves.balances.$put({ json: input }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaveBalances"] }),
  });
}

export function useUpdateRegularOvernight() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegularOvernightConfigInput) =>
      unwrap<LeaveBalanceSummary>(
        await api.leaves["regular-overnight"].$put({ json: input }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["leaveBalances"] });
      // 주기 목록은 이 설정에서 파생하므로 보유 휴가 화면도 다시 받아야 한다.
      qc.invalidateQueries({ queryKey: ["leaveGrants"] });
    },
  });
}

export type LeaveGrantsPage = InferResponseType<
  typeof api.leaves.grants.$get,
  200
>;
export type LeaveGrantFund = LeaveGrantsPage["funds"][number];
export type LeaveGrantItem = LeaveGrantFund["grants"][number];
export type RegularOvernightCycleItem =
  LeaveGrantsPage["regularOvernight"]["cycles"][number];

export function useLeaveGrants() {
  return useQuery({
    queryKey: ["leaveGrants"],
    queryFn: async () =>
      unwrap<LeaveGrantsPage>(await api.leaves.grants.$get()),
  });
}

/** 적립분을 바꾸면 재원 총량도 달라지므로 두 캐시를 함께 비운다. */
function useInvalidateGrants() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["leaveGrants"] });
    qc.invalidateQueries({ queryKey: ["leaveBalances"] });
  };
}

export function useCreateLeaveGrant() {
  const invalidate = useInvalidateGrants();
  return useMutation({
    mutationFn: async (input: LeaveGrantCreateInput) =>
      unwrap<LeaveGrantsPage>(await api.leaves.grants.$post({ json: input })),
    onSuccess: invalidate,
  });
}

export function useUpdateLeaveGrant() {
  const invalidate = useInvalidateGrants();
  return useMutation({
    mutationFn: async (vars: { id: string; input: LeaveGrantUpdateInput }) =>
      unwrap<LeaveGrantsPage>(
        await api.leaves.grants[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteLeaveGrant() {
  const invalidate = useInvalidateGrants();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap<LeaveGrantsPage>(
        await api.leaves.grants[":id"].$delete({ param: { id } }),
      ),
    onSuccess: invalidate,
  });
}

export type LeaveResult = { leave: MyLeave; exceededDates: string[] };

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LeaveCreateInput) =>
      unwrap<LeaveResult>(await api.leaves.$post({ json: input })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["myLeaves"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["leaveBalances"] });
      qc.invalidateQueries({ queryKey: ["leaveGrants"] });
    },
  });
}

export function useUpdateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: { id: string; input: LeaveCreateInput }) =>
      unwrap<LeaveResult>(
        await api.leaves[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["myLeaves"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      qc.invalidateQueries({ queryKey: ["leaveBalances"] });
      qc.invalidateQueries({ queryKey: ["leaveGrants"] });
    },
  });
}

export function useDeleteLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.leaves[":id"].$delete({ param: { id } })),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["calendar"] });
      qc.invalidateQueries({ queryKey: ["myLeaves"] });
      qc.invalidateQueries({ queryKey: ["leaveBalances"] });
      qc.invalidateQueries({ queryKey: ["leaveGrants"] });
    },
  });
}

export type Blackout = InferResponseType<
  (typeof api.units)[":id"]["blackouts"]["$get"],
  200
>["blackouts"][number];

export function useBlackouts(unitId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["blackouts", unitId],
    enabled: enabled && unitId !== null,
    queryFn: async () =>
      unwrap<{ blackouts: Blackout[] }>(
        await api.units[":id"].blackouts.$get({ param: { id: unitId! } }),
      ),
  });
}

export function useCreateBlackout(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlackoutCreateInput) =>
      unwrap<{ blackout: Blackout }>(
        await api.units[":id"].blackouts.$post({
          param: { id: unitId },
          json: input,
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blackouts"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export function useDeleteBlackout(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (blackoutId: string) =>
      unwrap(
        await api.units[":id"].blackouts[":blackoutId"].$delete({
          param: { id: unitId, blackoutId },
        }),
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["blackouts"] });
      void qc.invalidateQueries({ queryKey: ["calendar"] });
    },
  });
}

export type NotificationPrefs = InferResponseType<
  typeof api.notifications.preferences.$get,
  200
>["preferences"];

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ["notificationPrefs"],
    queryFn: async () =>
      unwrap<{ preferences: NotificationPrefs }>(
        await api.notifications.preferences.$get(),
      ),
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: NotificationPrefsInput) =>
      unwrap<{ preferences: NotificationPrefs }>(
        await api.notifications.preferences.$patch({ json: input }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notificationPrefs"] }),
  });
}

/** 신고는 접수만 하면 되므로 캐시를 건드리지 않는다. */
export function useCreateReport() {
  return useMutation({
    mutationFn: async (input: ReportCreateInput) =>
      unwrap(await api.moderation.reports.$post({ json: input })),
  });
}

export function useBlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: BlockCreateInput) =>
      unwrap(await api.moderation.blocks.$post({ json: input })),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["unitMembers"] }),
  });
}

export function useNotifications(enabled = true) {
  return useQuery({
    queryKey: ["notifications"],
    enabled,
    refetchInterval: 30_000,
    queryFn: async () =>
      unwrap<NotificationList>(await api.notifications.$get()),
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.notifications.read.$post()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
}
