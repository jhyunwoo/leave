/**
 * 웹 앱의 HTTP 계층.
 *
 * 여기서 하는 일은 세 가지뿐이다.
 *  1) 서버 주소와 클라이언트 식별 헤더를 정한다.
 *  2) 토큰을 localStorage에 보관하고 매 요청에 붙인다.
 *  3) 응답이 401이면 "세션이 끊겼다"고 앱에 알린다.
 *
 * 실제 요청 목록(어떤 화면이 무엇을 부르는가)은 `@leave/client`에 있다.
 * 사용처: apps/web/src/api/provider.tsx 가 이 모듈을 어댑터로 감싸 앱에 넣는다.
 */
import type { AppType } from "@leave/api";
import {
  unwrap as unwrapResponse,
  type UnwrappableResponse,
} from "@leave/shared";
import { hc } from "hono/client";

// 공용 HTTP 유틸은 @leave/shared에서 재사용 (중복 제거)
export { ApiError } from "@leave/shared";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8787";

const TOKEN_KEY = "leave.token";

let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// 접속 기록에 남길 클라이언트 식별 정보 (플랫폼/버전)
const CLIENT_PLATFORM = "web";
const CLIENT_VERSION: string = import.meta.env.VITE_APP_VERSION ?? "dev";

export const api = hc<AppType>(API_URL, {
  headers: (): Record<string, string> => ({
    "X-Client-Platform": CLIENT_PLATFORM,
    "X-Client-Version": CLIENT_VERSION,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }),
});

/**
 * 세션이 더 이상 유효하지 않을 때(토큰 만료·삭제·서버에서 세션 소멸) 부를 콜백.
 * provider가 등록해 토큰을 비우면 라우터가 로그인 화면으로 돌려보낸다.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/**
 * 공용 unwrap에 "인증이 깨지면 로그아웃" 처리를 얹은 앱 전용 래퍼.
 * 화면마다 401을 따로 다루지 않아도 되도록 모든 요청이 이 함수를 지난다.
 * 토큰을 들고 보낸 요청이 401로 돌아왔을 때만 세션을 끊는다(비로그인 401은 정상).
 */
export async function unwrap<T>(res: UnwrappableResponse): Promise<T> {
  if (res.status === 401 && authToken) onUnauthorized?.();
  return unwrapResponse<T>(res);
}
