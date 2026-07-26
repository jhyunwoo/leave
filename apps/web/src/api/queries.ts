import type {
  LeaveCreateInput,
  LoginInput,
  SignupInput,
  UnitCreateInput,
  UnitTransferInput,
  UnitUpdateInput,
} from "@leave/shared";
import type { InferResponseType } from "hono/client";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useAtom } from "jotai";
import { tokenAtom } from "../state/auth";
import { api, API_URL, ApiError, getAuthToken, unwrap } from "./client";

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
    mutationFn: async (file: File) => {
      const res = await fetch(`${API_URL}/images/unit/${unitId}`, {
        method: "PUT",
        headers: {
          "content-type": file.type,
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: file,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error ?? "업로드하지 못했습니다");
      }
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
    },
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
