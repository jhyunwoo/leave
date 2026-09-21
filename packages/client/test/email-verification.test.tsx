import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});
