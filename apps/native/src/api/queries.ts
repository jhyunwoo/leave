import type {
  LeaveCreateInput,
  LoginInput,
  SignupInput,
  UnitCreateInput,
} from "@leave/shared";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { InferResponseType } from "hono/client";
import { useSetAtom } from "jotai";
import { setSessionAtom } from "../state/auth";
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
export type AuthResponse = InferResponseType<typeof api.auth.login.$post, 200>;
export type LeaveResult = { leave: MyLeave; exceededDates: string[] };

export function useMe() {
  const setSession = useSetAtom(setSessionAtom);
  return useQuery({
    queryKey: ["me"],
    retry: (count, error) =>
      error instanceof ApiError && error.status === 401 ? false : count < 2,
    queryFn: async () => {
      try {
        return await unwrap<Me>(await api.auth.me.$get());
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          void setSession(null);
        }
        throw err;
      }
    },
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

export function useJoinUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (unitId: string) =>
      unwrap<{ unit: Unit }>(
        await api.units[":id"].join.$post({ param: { id: unitId } }),
      ),
    onSuccess: () => qc.invalidateQueries(),
  });
}

export function useLeaveUnit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await api.units.leave.$post()),
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

function useInvalidateLeaveData() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ["calendar"] });
    void qc.invalidateQueries({ queryKey: ["myLeaves"] });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
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
