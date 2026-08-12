/**
 * 인증·세션 훅.
 *
 * 사용처: 로그인/회원가입 화면, 프로필 화면(로그아웃·탈퇴), 앱 루트(내 정보).
 *
 * 세션이 바뀌면 이전 사용자의 데이터가 화면에 남으면 안 되므로 항상
 * `queryClient.clear()`로 캐시를 통째로 비운 뒤 토큰을 갈아끼운다.
 */
import type {
  LoginInput,
  OnboardingProfileInput,
  PasswordChangeInput,
  ProfileUpdateInput,
  RegularOvernightConfigInput,
  SignupInput,
} from "@leave/shared";
import { ApiError } from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLeaveApi } from "../context";
import { useInvalidateKeys } from "./invalidate";
import { queryKeys } from "../query-keys";
import type { AuthResponse, Me, OnboardingStatus } from "../types";

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

export function useOnboardingStatus(enabled = true) {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.onboarding,
    enabled,
    retry: retryUnlessUnauthorized,
    queryFn: async () =>
      unwrap<OnboardingStatus>(await client.auth.onboarding.$get()),
  });
}

export function useSaveOnboardingProfile() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OnboardingProfileInput) =>
      unwrap(await client.auth.onboarding.profile.$put({ json: input })),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding }),
  });
}

export function useSaveOnboardingRegularOvernight() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: RegularOvernightConfigInput) =>
      unwrap(
        await client.auth.onboarding["regular-overnight"].$put({ json: input }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.onboarding }),
  });
}

export function useCompleteOnboarding() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      unwrap(await client.auth.onboarding.complete.$post()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.onboarding });
      void queryClient.invalidateQueries({ queryKey: queryKeys.me });
    },
  });
}

/**
 * 내 정보 수정(별칭·군 종류·입대일·전역예정일·계급).
 *
 * 달력 응답에는 별칭과 계급 라벨이 함께 실려 나가므로 달력 캐시도 같이 버린다.
 */
export function useUpdateProfile() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([
    queryKeys.me,
    queryKeys.calendars,
    queryKeys.allUnitMembers,
  ]);
  return useMutation({
    mutationFn: async (input: ProfileUpdateInput) =>
      unwrap<{ user: Me["user"] }>(
        await client.auth.me.$patch({ json: input }),
      ),
    onSuccess: invalidate,
  });
}

/**
 * 프로필 이미지 업로드. 파일을 multipart로 보낸다.
 *
 * 네이티브는 파일 시스템 경로를 그대로 쓸 수 없어서, 화면 쪽에서 uri를 읽어
 * Blob/File로 만들어 넘긴다(profile.tsx의 pickImage 참고).
 */
export function useUploadProfileImage() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([
    queryKeys.me,
    queryKeys.calendars,
    queryKeys.allUnitMembers,
  ]);
  return useMutation({
    mutationFn: async (image: Blob) => {
      const form = new FormData();
      form.append("image", image);
      return unwrap<{ profileImageKey: string }>(
        await client.auth.me.image.$put({ form: form as never }),
      );
    },
    onSuccess: invalidate,
  });
}

/** 프로필 이미지 삭제. 이니셜 아바타로 되돌아간다. */
export function useDeleteProfileImage() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([
    queryKeys.me,
    queryKeys.calendars,
    queryKeys.allUnitMembers,
  ]);
  return useMutation({
    mutationFn: async () => unwrap(await client.auth.me.image.$delete()),
    onSuccess: invalidate,
  });
}

/**
 * 비밀번호 변경. 서버가 기존 세션을 전부 끊으므로, 돌려받은 새 토큰으로
 * 즉시 갈아끼워야 이 기기가 그대로 로그아웃되지 않는다.
 */
export function useChangePassword() {
  const { client, unwrap, setSessionToken } = useLeaveApi();
  return useMutation({
    mutationFn: async (input: PasswordChangeInput) =>
      unwrap<{ token: string }>(
        await client.auth.me.password.$post({ json: input }),
      ),
    onSuccess: async (data) => {
      await setSessionToken(data.token);
    },
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
