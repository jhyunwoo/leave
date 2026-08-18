/**
 * 세션이 시작·종료될 때 클라이언트 계층이 반드시 해야 하는 두 가지를 지킨다.
 *  1) 앱이 주입한 저장소에 토큰을 반영한다(웹 localStorage / 네이티브 SecureStore).
 *  2) 남의 계정 데이터가 화면에 남지 않도록 쿼리 캐시를 비운다.
 *
 * 특히 로그아웃은 서버 호출이 실패해도(오프라인, 만료된 토큰) 반드시 정리돼야 한다 —
 * 여기가 깨지면 비행기 모드에서 로그아웃 버튼이 아무 일도 하지 않는다.
 */
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useDeleteAccount, useLogin, useLogout } from "../src/hooks/auth";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

function setup(client: unknown) {
  const queryClient = testQueryClient();
  const setSessionToken = vi.fn();
  const adapter = testAdapter({
    client,
    setSessionToken,
  });
  return {
    queryClient,
    setSessionToken,
    wrapper: wrapperFor(queryClient, adapter),
  };
}

describe("로그인", () => {
  it("받은 토큰을 앱 저장소에 넘기고 이전 사용자의 캐시를 비운다", async () => {
    const client = {
      auth: { login: { $post: () => Promise.resolve({ token: "new-token" }) } },
    };
    const { queryClient, setSessionToken, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.me, { user: { id: "이전-사용자" } });

    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ email: "a@b.c", password: "password123" });

    await waitFor(() =>
      expect(setSessionToken).toHaveBeenCalledWith("new-token"),
    );
    expect(queryClient.getQueryData(queryKeys.me)).toBeUndefined();
  });
});

describe("로그아웃", () => {
  it("서버 호출이 실패해도 로컬 세션과 캐시를 정리한다", async () => {
    const client = {
      auth: { logout: { $post: () => Promise.reject(new Error("offline")) } },
    };
    const { queryClient, setSessionToken, wrapper } = setup(client);
    queryClient.setQueryData(queryKeys.myLeaves, [{ id: "leave-1" }]);

    const { result } = renderHook(() => useLogout(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(setSessionToken).toHaveBeenCalledWith(null));
    expect(queryClient.getQueryData(queryKeys.myLeaves)).toBeUndefined();
  });
});

describe("회원 탈퇴", () => {
  it("서버가 실패하면 로컬 세션을 끊지 않는다", async () => {
    // 지워지지 않았는데 로그아웃시키면 사용자는 "지워졌다"고 믿게 된다.
    const client = {
      auth: { account: { $delete: () => Promise.reject(new Error("500")) } },
    };
    const { setSessionToken, wrapper } = setup(client);

    const { result } = renderHook(() => useDeleteAccount(), { wrapper });
    result.current.mutate();

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(setSessionToken).not.toHaveBeenCalled();
  });
});
