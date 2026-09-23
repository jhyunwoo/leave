import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  EMAIL_LINK_POLL_MS,
  useEmailVerification,
} from "../src/forms/use-email-verification";
import { useVerifyEmail } from "../src/hooks/auth";
import { queryKeys } from "../src/query-keys";
import { testAdapter, testQueryClient, wrapperFor } from "./react-query";

describe("이메일 인증", () => {
  it("성공하면 웹·네이티브의 인증 게이트와 내 정보를 갱신한다", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.onboarding, { emailVerified: false });
    queryClient.setQueryData(queryKeys.me, { user: { id: "user-1" } });
    const client = {
      auth: {
        "email-verification": {
          verify: {
            $post: ({ json }: { json: { code: string } }) => {
              expect(json.code).toBe("012345");
              return Promise.resolve({ ok: true });
            },
          },
        },
      },
    };
    const { result } = renderHook(() => useVerifyEmail(), {
      wrapper: wrapperFor(queryClient, testAdapter({ client })),
    });
    result.current.mutate("012345");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(queryClient.getQueryState(queryKeys.onboarding)?.isInvalidated).toBe(
      true,
    );
    expect(queryClient.getQueryState(queryKeys.me)?.isInvalidated).toBe(true);
  });

  it("오답이면 게이트의 미인증 상태를 유지한다", async () => {
    const queryClient = testQueryClient();
    queryClient.setQueryData(queryKeys.onboarding, { emailVerified: false });
    const client = {
      auth: {
        "email-verification": {
          verify: { $post: () => Promise.reject(new Error("invalid code")) },
        },
      },
    };
    const { result } = renderHook(() => useVerifyEmail(), {
      wrapper: wrapperFor(queryClient, testAdapter({ client })),
    });
    result.current.mutate("000000");
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(queryClient.getQueryData(queryKeys.onboarding)).toEqual({
      emailVerified: false,
    });
    expect(queryClient.getQueryState(queryKeys.onboarding)?.isInvalidated).toBe(
      false,
    );
  });

  it("메일을 보낸 뒤에는 다른 곳에서 링크로 끝낸 인증을 알아채도록 상태를 다시 받는다", async () => {
    vi.useFakeTimers();
    try {
      const queryClient = testQueryClient();
      queryClient.setQueryData(queryKeys.onboarding, { emailVerified: false });
      const client = {
        auth: {
          "email-verification": {
            send: { $post: () => Promise.resolve({ ok: true }) },
          },
        },
      };
      const { result, unmount } = renderHook(() => useEmailVerification(), {
        wrapper: wrapperFor(queryClient, testAdapter({ client })),
      });
      await act(() => vi.advanceTimersByTimeAsync(EMAIL_LINK_POLL_MS));
      expect(
        queryClient.getQueryState(queryKeys.onboarding)?.isInvalidated,
      ).toBe(false);
      await act(() => result.current.send());
      await act(() => vi.advanceTimersByTimeAsync(EMAIL_LINK_POLL_MS));
      expect(
        queryClient.getQueryState(queryKeys.onboarding)?.isInvalidated,
      ).toBe(true);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
