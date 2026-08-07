/**
 * 인증·세션 훅.
 *
 * 사용처: 로그인/회원가입 화면, 프로필 화면(로그아웃·탈퇴), 앱 루트(내 정보).
 *
 * 세션이 바뀌면 이전 사용자의 데이터가 화면에 남으면 안 되므로 항상
 * `queryClient.clear()`로 캐시를 통째로 비운 뒤 토큰을 갈아끼운다.
 */
import type { LoginInput, SignupInput } from "@leave/shared";
import { ApiError } from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type { AuthResponse, Me } from "../types";

/** 401 응답은 다시 물어봐도 답이 달라지지 않으므로 재시도하지 않는다. */
function retryUnlessUnauthorized(failureCount: number, error: Error): boolean {
  if (error instanceof ApiError && error.status === 401) return false;
  return failureCount < 2;
}

/** 로그인한 사용자와 소속 그룹. 앱 전역에서 "나"의 단일 출처. */
export function useMe() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.me,
    retry: retryUnlessUnauthorized,
    queryFn: async () => unwrap<Me>(await client.auth.me.$get()),
  });
}

/**
 * 로그인·회원가입 성공 처리를 한곳에 모은다.
 * 두 뮤테이션의 차이는 호출하는 엔드포인트뿐이다.
 */
function useSessionStart<TInput>(
  request: (input: TInput) => Promise<AuthResponse>,
) {
  const { setSessionToken } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation<AuthResponse, Error, TInput>({
    mutationFn: request,
    onSuccess: async (data) => {
      queryClient.clear();
      await setSessionToken(data.token);
    },
  });
}

export function useLogin() {
  const { client, unwrap } = useLeaveApi();
  return useSessionStart(async (input: LoginInput) =>
    unwrap<AuthResponse>(await client.auth.login.$post({ json: input })),
  );
}

export function useSignup() {
  const { client, unwrap } = useLeaveApi();
  return useSessionStart(async (input: SignupInput) =>
    unwrap<AuthResponse>(await client.auth.signup.$post({ json: input })),
  );
}

/**
 * 로그아웃. 서버 세션 삭제가 실패해도(오프라인 등) 로컬 세션은 반드시 끊는다.
 * 그래서 onSuccess가 아니라 onSettled에서 정리한다.
 */
export function useLogout() {
  const { client, setSessionToken } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await client.auth.logout.$post().catch(() => null);
    },
    onSettled: async () => {
      queryClient.clear();
      await setSessionToken(null);
    },
  });
}

/** 회원 탈퇴. 서버가 지웠을 때만 로컬 세션을 끊는다. */
export function useDeleteAccount() {
  const { client, unwrap, setSessionToken } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => unwrap(await client.auth.account.$delete()),
    onSuccess: async () => {
      queryClient.clear();
      await setSessionToken(null);
    },
  });
}
