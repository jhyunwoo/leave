import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@leave/shared";
import {
  useAcceptFriendRequest,
  useSendFriendRequest,
  watchFriendAccessRevocation,
} from "../src/hooks/friends";
import { useSetUsername, useUserSearch } from "../src/hooks/users";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

function invalidatedKeys(queryClient: ReturnType<typeof testQueryClient>) {
  return queryClient
    .getQueryCache()
    .getAll()
    .filter((query) => query.state.isInvalidated)
    .map((query) => query.queryKey);
}

describe("사용자 검색", () => {
  it("정규형으로 캐시 키를 만들어 @와 대소문자가 같은 요청이 되게 한다", async () => {
    const queryClient = testQueryClient();
    // 훅이 보내는 인자를 검사하려면 목이 그 인자를 받는 것으로 선언돼야 한다.
    const search = vi.fn((_input?: unknown) =>
      Promise.resolve({ results: [] }),
    );
    const wrapper = wrapperFor(
      queryClient,
      testAdapter({ client: { users: { search: { $get: search } } } }),
    );

    const first = renderHook(() => useUserSearch("@HyunWoo"), { wrapper });
    await waitFor(() => expect(first.result.current.isSuccess).toBe(true));
    const second = renderHook(() => useUserSearch("hyunwoo"), { wrapper });
    await waitFor(() => expect(second.result.current.isSuccess).toBe(true));

    // 두 훅이 같은 캐시 항목을 가리킨다. (staleTime이 0이라 두 번째 마운트가
    // 다시 조회하는 것은 의도된 동작이다 — 관계 상태는 금방 낡는다.)
    for (const call of search.mock.calls) {
      expect(call[0]).toMatchObject({ query: { q: "hyunwoo" } });
    }
    expect(
      queryClient.getQueryData(queryKeys.userSearch("hyunwoo")),
    ).toBeDefined();
    expect(
      queryClient
        .getQueryCache()
        .getAll()
        .filter((query) => query.queryKey[1] === "search"),
    ).toHaveLength(1);
  });

  it("규칙에 어긋난 검색어는 서버까지 보내지 않는다", () => {
    const queryClient = testQueryClient();
    const search = vi.fn(() => Promise.resolve({ results: [] }));
    const wrapper = wrapperFor(
      queryClient,
      testAdapter({ client: { users: { search: { $get: search } } } }),
    );
    const { result } = renderHook(() => useUserSearch("hyun woo"), { wrapper });
    expect(result.current.fetchStatus).toBe("idle");
    expect(search).not.toHaveBeenCalled();
  });
});

describe("친구 관계 뮤테이션은 검색·프로필 상태까지 새로 받는다", () => {
  it("요청을 보내면 목록 셋과 사용자 캐시가 함께 낡는다", async () => {
    const queryClient = testQueryClient();
    for (const key of [
      queryKeys.friendList,
      queryKeys.incomingFriendRequests,
      queryKeys.outgoingFriendRequests,
      queryKeys.userSearch("hyunwoo"),
      queryKeys.userProfile("hyunwoo"),
    ]) {
      queryClient.setQueryData(key, {});
    }
    const client = {
      friends: { requests: { $post: () => Promise.resolve({ ok: true }) } },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useSendFriendRequest(), { wrapper });
    await act(() => result.current.mutateAsync({ username: "hyunwoo" }));

    const keys = invalidatedKeys(queryClient);
    expect(keys).toContainEqual([...queryKeys.friendList]);
    expect(keys).toContainEqual([...queryKeys.userSearch("hyunwoo")]);
    expect(keys).toContainEqual([...queryKeys.userProfile("hyunwoo")]);
  });

  it("상대가 이미 요청을 보낸 409에서도 받은 요청 목록을 새로 받는다", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.incomingFriendRequests, {});
    const client = {
      friends: {
        requests: {
          $post: () =>
            Promise.reject(
              new ApiError(
                "이미 요청이 있어요",
                409,
                "incoming_request_exists",
              ),
            ),
        },
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useSendFriendRequest(), { wrapper });
    await act(async () => {
      await result.current
        .mutateAsync({ username: "hyunwoo" })
        .catch(() => null);
    });
    await waitFor(() =>
      expect(
        queryClient.getQueryState(queryKeys.incomingFriendRequests)
          ?.isInvalidated,
      ).toBe(true),
    );
  });

  it("수락하면 프로필·검색의 관계 상태가 낡는다", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.userProfile("bob"), {
      relationship: "incoming",
    });
    const client = {
      friends: {
        requests: {
          ":userId": { accept: { $post: () => Promise.resolve({ ok: true }) } },
        },
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useAcceptFriendRequest(), { wrapper });
    await act(() => result.current.mutateAsync("bob-id"));
    expect(
      queryClient.getQueryState(queryKeys.userProfile("bob"))?.isInvalidated,
    ).toBe(true);
  });
});

describe("이름 변경", () => {
  it("내 정보·온보딩·사용자·친구 캐시를 함께 무효화한다", async () => {
    const queryClient = testQueryClient();
    for (const key of [
      queryKeys.me,
      queryKeys.onboarding,
      queryKeys.userProfile("old"),
      queryKeys.friendList,
    ]) {
      queryClient.setQueryData(key, {});
    }
    const client = {
      users: {
        me: {
          username: { $put: () => Promise.resolve({ username: "newname" }) },
        },
      },
    };
    const wrapper = wrapperFor(queryClient, testAdapter({ client }));
    const { result } = renderHook(() => useSetUsername(), { wrapper });
    await act(() => result.current.mutateAsync({ username: "newname" }));

    for (const key of [
      queryKeys.me,
      queryKeys.onboarding,
      queryKeys.userProfile("old"),
      queryKeys.friendList,
    ]) {
      expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
    }
  });
});

describe("watchFriendAccessRevocation", () => {
  it("친구 권한이 사라지면 캐시에 남은 일정을 지운다", async () => {
    const queryClient = testQueryClient();
    const stop = watchFriendAccessRevocation(queryClient);
    const key = queryKeys.friendSchedule("gone", "2026-01-01", "2026-12-31");
    queryClient.setQueryData(key, { leaves: [{ leaveId: "secret" }] });

    // 재조회가 403으로 실패해도 TanStack은 마지막 성공 데이터를 들고 있는다.
    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: () => Promise.reject(new ApiError("권한 없음", 403)),
        retry: false,
      })
      .catch(() => null);

    await waitFor(() => expect(queryClient.getQueryData(key)).toBeUndefined());
    stop();
  });

  it("일시적인 서버 오류로는 캐시를 버리지 않는다", async () => {
    const queryClient = testQueryClient();
    const stop = watchFriendAccessRevocation(queryClient);
    const key = queryKeys.friendSchedule("ok", "2026-01-01", "2026-12-31");
    queryClient.setQueryData(key, { leaves: [] });
    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: () => Promise.reject(new ApiError("서버 오류", 500)),
        retry: false,
      })
      .catch(() => null);
    expect(queryClient.getQueryData(key)).toEqual({ leaves: [] });
    stop();
  });

  it("친구가 아닌 캐시는 건드리지 않는다", async () => {
    const queryClient = testQueryClient();
    const stop = watchFriendAccessRevocation(queryClient);
    const key = queryKeys.calendar("unit", "2026-09");
    queryClient.setQueryData(key, { days: [] });
    await queryClient
      .fetchQuery({
        queryKey: key,
        queryFn: () => Promise.reject(new ApiError("권한 없음", 403)),
        retry: false,
      })
      .catch(() => null);
    expect(queryClient.getQueryData(key)).toEqual({ days: [] });
    stop();
  });
});
