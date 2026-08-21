/**
 * 앱(웹/네이티브)과 공용 데이터 계층을 잇는 어댑터 컨텍스트.
 *
 * 웹과 네이티브는 "서버에 뭘 요청하고 어떤 캐시를 비우는가"는 완전히 같지만
 * "토큰을 어디에 저장하는가"(localStorage vs SecureStore)와 "인증이 깨졌을 때
 * 무엇을 정리하는가"(웹은 메모리 캐시만, 네이티브는 디스크 캐시까지)가 다르다.
 * 그 차이만 어댑터로 주입받고, 나머지 쿼리/뮤테이션 로직은 이 패키지가 한 벌만
 * 들고 있는다.
 *
 * 사용처: apps/web/src/main.tsx, apps/native/src/app/_layout.tsx 에서
 * `LeaveApiProvider`로 앱 전체를 감싼다.
 */
import type { AppType } from "@leave/api";
import type { UnwrappableResponse } from "@leave/shared";
import type { ClientRequestOptions, hc } from "hono/client";
import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from "react";

/** Hono RPC 클라이언트. 서버 라우트 타입(AppType)에서 그대로 파생된다. */
export type LeaveApiClient = ReturnType<typeof hc<AppType>>;

/** 앱이 제공해야 하는 최소 능력. */
export type LeaveApiAdapter = {
  /** 인증 헤더·baseURL이 이미 설정된 RPC 클라이언트. */
  client: LeaveApiClient;
  /**
   * 응답을 검사해 본문을 꺼내거나 ApiError를 던진다.
   * 앱이 여기에 "401이면 로그아웃" 같은 플랫폼 처리를 얹는다.
   */
  unwrap: <T>(res: UnwrappableResponse) => Promise<T>;
  /**
   * 세션 토큰을 앱의 영속 저장소와 전역 상태에 반영한다.
   * null이면 로그아웃. 네이티브는 여기서 디스크 쿼리 캐시도 함께 비운다.
   */
  setSessionToken: (token: string | null) => void | Promise<void>;
  /**
   * TanStack Query가 마지막 관찰자를 잃으면 진행 중인 GET도 취소한다.
   * 플랫폼 fetch의 AbortSignal 지원이 확인된 어댑터만 켠다.
   */
  useRequestAbortSignal?: boolean;
  /**
   * 같은 렌더에서 시작한 월별 달력 GET을 배치 엔드포인트 한 번으로 합친다.
   * 웹만 켠다. 네이티브는 기존 단일 월 전송 경로와 동작을 그대로 유지한다.
   */
  batchCalendarRequests?: boolean;
};

/** 플랫폼이 허용한 경우에만 Hono GET에 TanStack의 취소 신호를 전달한다. */
export function queryRequestOptions(
  useRequestAbortSignal: boolean | undefined,
  context: { readonly signal: AbortSignal },
): ClientRequestOptions | undefined {
  // `context.signal` is a getter that tells TanStack the transport consumes the
  // signal. Do not read it at all for adapters that did not opt in.
  return useRequestAbortSignal
    ? { init: { signal: context.signal } }
    : undefined;
}

const LeaveApiContext = createContext<LeaveApiAdapter | null>(null);

/** 앱 루트에서 한 번만 감싼다. JSX 없이 만들어 순수 .ts 패키지로 유지한다. */
export function LeaveApiProvider(props: {
  adapter: LeaveApiAdapter;
  children: ReactNode;
}) {
  return createElement(
    LeaveApiContext.Provider,
    { value: props.adapter },
    props.children,
  );
}

/** 이 패키지의 모든 훅이 서버 호출 수단을 얻는 통로. */
export function useLeaveApi(): LeaveApiAdapter {
  const adapter = useContext(LeaveApiContext);
  if (!adapter) {
    throw new Error(
      "LeaveApiProvider가 없습니다. 앱 루트를 LeaveApiProvider로 감싸주세요.",
    );
  }
  return adapter;
}
