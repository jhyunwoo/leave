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
  PasskeyDeleteInput,
  PasskeyRegistrationOptionsInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { shouldRetryQuery } from "../query-policy";
import { useInvalidateKeys } from "./invalidate";
import { queryKeys } from "../query-keys";
import type {
  AuthBootstrap,
  AuthResponse,
  DutyDays,
  Me,
  OnboardingStatus,
  PasskeyList,
  PasskeyOptions,
} from "../types";

/*
 * 재시도 판정은 `query-policy.ts`의 `shouldRetryQuery` 하나만 쓴다.
 *
 * 예전에는 이 파일에 401만 거르는 사본이 따로 있었다. 그런데 아래 훅들이 부르는
 * 엔드포인트가 바로 428(온보딩 미완료, `middleware/onboarding.ts`)과 426(앱 업데이트
 * 필요, `middleware/min-version.ts`)을 돌려주는 자리다. 온보딩 중에는 화면마다 같은
 * 요청이 세 번씩 나갔고, 업데이트 안내는 backoff 두 번만큼 늦게 떴다.
 */

/** 로그인한 사용자와 소속 그룹. 앱 전역에서 "나"의 단일 출처. */
export function useMe() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.me,
    retry: shouldRetryQuery,
    queryFn: async (context) =>
      unwrap<Me>(
        await client.auth.me.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

/**
 * 남은 일과일 — 오늘부터 전역 전날까지의 평일에서 부대 휴일·공휴일·개인 휴가를 뺀 수.
 *
 * 서버가 센다. 부대 휴일은 달 단위 달력 응답으로만 읽을 수 있어서, 클라이언트가
 * 세려면 남은 복무 기간만큼 무거운 달력을 반복해 받아야 한다.
 */
export function useMyDutyDays() {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.dutyDays,
    retry: shouldRetryQuery,
    queryFn: async (context) =>
      unwrap<DutyDays>(
        await client.auth.me["duty-days"].$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

export function useOnboardingStatus(enabled = true) {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.onboarding,
    enabled,
    retry: shouldRetryQuery,
    queryFn: async (context) =>
      unwrap<OnboardingStatus>(
        await client.auth.onboarding.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      ),
  });
}

/**
 * 웹 인증 게이트 전용. 온보딩과 내 정보를 한 GET으로 받아 기존 두 캐시 키에
 * 나눠 심는다. 화면과 뮤테이션은 계속 기존 키를 보므로 무효화 범위가 달라지지 않는다.
 */
export function useAuthBootstrap(enabled = true) {
  const { client, unwrap, useRequestAbortSignal } = useLeaveApi();
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: queryKeys.onboarding,
    enabled,
    retry: shouldRetryQuery,
    queryFn: async (context) => {
      const bootstrap = unwrap<AuthBootstrap>(
        await client.auth.bootstrap.$get(
          undefined,
          queryRequestOptions(useRequestAbortSignal, context),
        ),
      );
      const data = await bootstrap;
      if (data.me) queryClient.setQueryData(queryKeys.me, data.me);
      return data.onboarding;
    },
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.dutyDays });
    },
  });
}

/**
 * 내 정보 수정(별칭·군 종류·입대일·전역예정일·계급).
 *
 * 달력 응답에는 별칭과 계급 라벨이 함께 실려 나가므로 달력 캐시도 같이 버린다.
 * 전역 예정일이 바뀌면 남은 일과일의 세는 구간이 통째로 달라진다.
 *
 * 입대일·전역일·군종은 **정기외박 주기와 앞으로 받을 몫의 입력**이기도 하다
 * (`lib/leave-grants.ts`의 `cycleDischargeDate`·`buildCycleList`). 그래서 잔여와
 * 적립분도 함께 버린다 — 빠뜨려 두는 동안 전역일을 고쳐도 보유 휴가 화면이 옛 주기를
 * 계속 그렸다. 온보딩 응답에도 같은 필드의 사본이 실리고(`lib/onboarding.ts`),
 * 군종이 바뀌면 서버가 주기 설정을 지우므로 그것도 다시 받아야 한다.
 */
export function useUpdateProfile() {
  const { client, unwrap } = useLeaveApi();
  const invalidate = useInvalidateKeys([
    queryKeys.me,
    queryKeys.dutyDays,
    queryKeys.calendars,
    queryKeys.allUnitMembers,
    queryKeys.leaveBalances,
    queryKeys.leaveGrants,
    queryKeys.onboarding,
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

type CredentialCeremony = (
  options: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

export function usePasskeys() {
  const { client, unwrap } = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.passkeys,
    queryFn: async () => unwrap<PasskeyList>(await client.auth.passkeys.$get()),
  });
}

export function useRegisterPasskey() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: PasskeyRegistrationOptionsInput & {
        createCredential: CredentialCeremony;
      },
    ) => {
      const begin = unwrap<PasskeyOptions>(
        await client.auth.passkeys.registration.options.$post({
          json: { name: input.name, currentPassword: input.currentPassword },
        }),
      );
      const ceremony = await begin;
      const response = await input.createCredential(ceremony.options);
      return unwrap(
        await client.auth.passkeys.registration.verify.$post({
          json: { ceremonyId: ceremony.ceremonyId, response },
        }),
      );
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.passkeys }),
  });
}

export function useDeletePasskey() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: PasskeyDeleteInput & { id: string }) =>
      unwrap(
        await client.auth.passkeys[":id"].$delete({
          param: { id: input.id },
          json: { currentPassword: input.currentPassword },
        }),
      ),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: queryKeys.passkeys }),
  });
}

export function usePasskeyLogin() {
  const { client, unwrap } = useLeaveApi();
  return useSessionStart(async (getCredential: CredentialCeremony) => {
    const ceremony = unwrap<PasskeyOptions>(
      await client.auth.passkeys.authentication.options.$post(),
    );
    const begin = await ceremony;
    const response = await getCredential(begin.options);
    return unwrap<AuthResponse>(
      await client.auth.passkeys.authentication.verify.$post({
        json: { ceremonyId: begin.ceremonyId, response },
      }),
    );
  });
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
