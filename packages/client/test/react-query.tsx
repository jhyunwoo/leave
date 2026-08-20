/**
 * 훅 테스트용 하네스.
 *
 * 훅을 실제로 렌더해서 확인하는 이유는, 이 패키지가 지키려는 것 대부분이
 * "무엇을 계산하는가"가 아니라 "성공 후 어떤 캐시를 비우고 어댑터의 무엇을
 * 부르는가"이기 때문이다. 그 부분은 함수를 직접 불러서는 드러나지 않는다.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { vi } from "vitest";
import { LeaveApiProvider, type LeaveApiAdapter } from "../src/context";

/** 재시도·백그라운드 갱신을 끄면 테스트가 결정적으로 돈다. */
export function testQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      // gcTime을 0으로 두면 관찰자 없는 캐시 항목(테스트에서 심은 값)이 즉시
      // 수거돼 무효화 여부를 볼 수 없다.
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

/**
 * 앱이 주입하는 어댑터를 대신한다. `client`는 훅이 부르는 경로만 담으면 되므로
 * 테스트마다 필요한 부분만 넘긴다.
 */
export function testAdapter(
  overrides: {
    /** 훅이 실제로 부르는 경로만 담으면 된다. 전체 RPC 트리를 흉내 낼 필요는 없다. */
    client?: unknown;
    unwrap?: LeaveApiAdapter["unwrap"];
    setSessionToken?: LeaveApiAdapter["setSessionToken"];
    useRequestAbortSignal?: boolean;
  } = {},
): LeaveApiAdapter {
  return {
    client: (overrides.client ?? {}) as LeaveApiAdapter["client"],
    // 가짜 client가 이미 파싱된 값을 돌려주므로 unwrap은 그대로 통과시킨다.
    unwrap:
      overrides.unwrap ?? (<T,>(res: unknown) => Promise.resolve(res as T)),
    setSessionToken: overrides.setSessionToken ?? vi.fn(),
    useRequestAbortSignal: overrides.useRequestAbortSignal,
  };
}

export function wrapperFor(queryClient: QueryClient, adapter: LeaveApiAdapter) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <LeaveApiProvider adapter={adapter}>{children}</LeaveApiProvider>
      </QueryClientProvider>
    );
  };
}
