/**
 * 공개 사용자 이름 훅 — 설정·중복 확인·검색·프로필 조회.
 *
 * 사용처: 온보딩의 이름 단계, 1회성 이름 설정 화면, 친구 찾기, 프로필 화면,
 * `/u/{username}` 딥링크 착지점.
 *
 * 검색과 중복 확인은 타이핑 도중 계속 불린다. 디바운스는 화면이 하고(입력의
 * 리듬은 플랫폼마다 다르다), 이 훅은 "이 값이면 물어볼 만한가"만 판정한다 —
 * 규칙에 어긋난 값은 아예 요청하지 않아 서버 왕복과 rate limit을 아낀다.
 */
import {
  isCanonicalUsername,
  isUsernameQuery,
  normalizeUsername,
  normalizeUsernameQuery,
  type UsernameSetInput,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import type {
  PublicUserProfile,
  UserProfile,
  UserSearchResults,
} from "../types";

/**
 * 사용자 이름 검색.
 *
 * 키에는 정규형을 넣는다. `@Hyun`과 `hyun`이 같은 요청이라 캐시가 갈리지 않는다.
 */
export function useUserSearch(rawQuery: string) {
  const adapter = useLeaveApi();
  const query = normalizeUsernameQuery(rawQuery);
  return useQuery({
    queryKey: queryKeys.userSearch(query),
    enabled: isUsernameQuery(query),
    // 관계 상태가 함께 실려 오므로 오래 들고 있으면 "친구 추가" 버튼이 낡는다.
    staleTime: 0,
    queryFn: (context) =>
      adapter.client.users.search
        .$get(
          { query: { q: query } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<UserSearchResults>(response)),
  });
}

/**
 * 경로 파라미터로 보낼 값을 감싼다.
 *
 * Hono 클라이언트는 `:param` 자리에 값을 **그대로** 끼워 넣는다(hono/client의
 * `replaceUrlParam`). 사용자 이름은 주소창과 딥링크에서 오므로 `..`나 `%2F`가
 * 섞여 들어오면 그대로 API 경로가 되어 다른 엔드포인트를 가리킬 수 있다.
 * 정상적인 이름(영문·숫자·마침표·밑줄·한글)에는 인코딩이 아무 영향도 주지 않는다.
 */
function pathParam(value: string): string {
  return encodeURIComponent(value);
}

/** 공개 프로필. 없는 이름·차단은 서버가 구분 없이 404로 답한다. */
export function useUserProfile(rawUsername: string | null | undefined) {
  const adapter = useLeaveApi();
  const username = rawUsername ? normalizeUsername(rawUsername) : "";
  return useQuery({
    queryKey: queryKeys.userProfile(username),
    enabled: username.length > 0,
    staleTime: 0,
    queryFn: (context) =>
      adapter.client.users[":username"]
        .$get(
          { param: { username: pathParam(username) } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<UserProfile>(response)),
  });
}

/**
 * 로그인 없이 보는 최소 공개 프로필.
 *
 * 인증 프로필과 캐시를 섞지 않는다. 인증 응답에는 관계와 내부 사용자 id가 있어
 * 익명 화면이 잘못된 캐시를 읽으면 공개하면 안 되는 정보가 노출될 수 있다.
 */
export function usePublicUserProfile(rawUsername: string | null | undefined) {
  const adapter = useLeaveApi();
  const username = rawUsername ? normalizeUsername(rawUsername) : "";
  return useQuery({
    queryKey: queryKeys.publicUserProfile(username),
    enabled: isCanonicalUsername(username),
    queryFn: (context) =>
      adapter.client.public.users[":username"]
        .$get(
          { param: { username: pathParam(username) } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<PublicUserProfile>(response)),
  });
}

/**
 * 중복 확인. 답은 조언일 뿐이라 최종 판정이 아니다 — 확인과 저장 사이에 남이
 * 가져갈 수 있고, 진짜 판정은 저장 시점의 유니크 인덱스가 내린다.
 */
export function useUsernameAvailability(rawUsername: string) {
  const adapter = useLeaveApi();
  const username = normalizeUsername(rawUsername);
  return useQuery({
    queryKey: queryKeys.usernameAvailability(username),
    enabled: isCanonicalUsername(username),
    staleTime: 0,
    queryFn: (context) =>
      adapter.client.users.availability
        .$get(
          { query: { username } },
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) =>
          adapter.unwrap<{ username: string; available: boolean }>(response),
        ),
  });
}

/**
 * 이름 설정·변경.
 *
 * 이름은 여러 응답에 박혀 나간다 — 내 정보, 온보딩 상태, 검색 결과, 프로필,
 * 친구 달력의 참가자 목록(내 이름이 들어 있다). 바꾸는 일 자체가 드물기 때문에
 * 이 자리에서는 좁게 고르는 대신 그 묶음을 통째로 다시 받는다.
 * 사용자 id는 바뀌지 않으므로 친구 관계·휴가 소유권은 그대로다.
 */
export function useSetUsername() {
  const { client, unwrap } = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UsernameSetInput) =>
      unwrap<{ username: string }>(
        await client.users.me.username.$put({ json: input }),
      ),
    onSuccess: async () => {
      await Promise.all(
        [
          queryKeys.me,
          queryKeys.onboarding,
          queryKeys.users,
          queryKeys.publicUserProfiles,
          queryKeys.friends,
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      );
    },
  });
}
