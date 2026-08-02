import type {
  LeaveBalanceUpdateInput,
  LeaveCreateInput,
  LoginInput,
  RegularOvernightConfigInput,
  SignupInput,
  UnitCreateInput,
  UnitTransferInput,
  UnitUpdateInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSetAtom } from "jotai";
import { setSessionAtom } from "../state/auth";
import {
  api,
  API_URL,
  ApiError,
  checkAuthorized,
  getAuthToken,
  unwrap,
} from "./client";

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
export type JoinRequest = InferResponseType<
  (typeof api.units)[":id"]["requests"]["$get"],
  200
>["requests"][number];
export type AuthResponse = InferResponseType<typeof api.auth.login.$post, 200>;
export type LeaveResult = { leave: MyLeave; exceededDates: string[] };
export type LeaveBalanceSummary = InferResponseType<
  typeof api.leaves.balances.$get,
  200
>;

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    // 401은 다시 물어봐야 답이 달라지지 않는다. 로그아웃 처리는 client.ts가 맡는다.
    retry: (count, error) =>
      error instanceof ApiError && error.status === 401 ? false : count < 2,
    queryFn: async () => unwrap<Me>(await api.auth.me.$get()),
  });
}

export function useLogin() {
  const setSession = useSetAtom(setSessionAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: LoginInput) =>
      unwrap<AuthResponse>(await api.auth.login.$post({ json: input })),
    onSuccess: async (data) => {
      qc.clear();
      await setSession(data.token);
    },
  });
}

export function useSignup() {
  const setSession = useSetAtom(setSessionAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: SignupInput) =>
      unwrap<AuthResponse>(await api.auth.signup.$post({ json: input })),
    onSuccess: async (data) => {
      qc.clear();
      await setSession(data.token);
    },
  });
}

export function useLogout() {
  const setSession = useSetAtom(setSessionAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.auth.logout.$post().catch(() => null);
    },
    onSettled: async () => {
      qc.clear();
      await setSession(null);
    },
  });
}

export function useDeleteAccount() {
  const setSession = useSetAtom(setSessionAtom);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.auth.account.$delete()),
    onSuccess: async () => {
      qc.clear();
      await setSession(null);
    },
  });
}

export function useUnitSearch(q: string) {
  return useQuery({
    queryKey: ["units", q],
    queryFn: async () =>
      unwrap<{ units: Unit[] }>(await api.units.$get({ query: { q } })),
  });
}

export function useCreateUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UnitCreateInput) =>
      unwrap<{ unit: Unit }>(await api.units.$post({ json: input })),
    onSuccess: () => qc.invalidateQueries(),
  });
}

/** 부대 가입 신청 (관리자 승인 필요). 빈 부대면 즉시 가입되고 관리자가 된다. */
export function useJoinUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unitId: string) =>
      unwrap<{ requested: boolean; joined: boolean }>(
        await api.units[":id"].join.$post({ param: { id: unitId } }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useCancelJoinRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.units.join.cancel.$post()),
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

export function useJoinRequests(unitId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["joinRequests", unitId],
    enabled: enabled && unitId !== null,
    refetchInterval: 30_000,
    queryFn: async () =>
      unwrap<{ requests: JoinRequest[] }>(
        await api.units[":id"].requests.$get({ param: { id: unitId! } }),
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

export function useApproveJoinRequest(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await api.units[":id"].requests[":userId"].approve.$post({
          param: { id: unitId, userId },
        }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useRejectJoinRequest(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      unwrap(
        await api.units[":id"].requests[":userId"].reject.$post({
          param: { id: unitId, userId },
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["joinRequests"] }),
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

/** 부대 이미지 업로드 (관리자). 바이너리 본문이라 raw fetch 사용. */
export function useUploadUnitImage(unitId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (asset: { uri: string; mimeType?: string }) => {
      const blob = await (await fetch(asset.uri)).blob();
      const res = await fetch(`${API_URL}/images/unit/${unitId}`, {
        method: "PUT",
        headers: {
          "content-type": asset.mimeType ?? "image/jpeg",
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: blob,
      });
      checkAuthorized(res);
      if (!res.ok) throw new Error("업로드하지 못했습니다");
      return (await res.json()) as { key: string };
    },
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["leaveBalances"] }),
  });
}

function useInvalidateLeaveData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["myLeaves"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
    void qc.invalidateQueries({ queryKey: ["leaveBalances"] });
  };
}

export function useCreateLeave() {
  const invalidate = useInvalidateLeaveData();
  return useMutation({
    mutationFn: async (input: LeaveCreateInput) =>
      unwrap<LeaveResult>(await api.leaves.$post({ json: input })),
    onSuccess: invalidate,
  });
}

export function useUpdateLeave() {
  const invalidate = useInvalidateLeaveData();
  return useMutation({
    mutationFn: async (vars: { id: string; input: LeaveCreateInput }) =>
      unwrap<LeaveResult>(
        await api.leaves[":id"].$patch({
          param: { id: vars.id },
          json: vars.input,
        }),
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteLeave() {
  const invalidate = useInvalidateLeaveData();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await api.leaves[":id"].$delete({ param: { id } })),
    onSuccess: invalidate,
  });
}

export function useNotifications() {
  return useQuery({
    queryKey: ["notifications"],
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

export function useRegisterPushToken() {
  return useMutation({
    mutationFn: async (token: string) =>
      unwrap(await api.push.token.$put({ json: { token } })),
  });
}
