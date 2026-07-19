import type { AppType } from "@leave/api";
import { buildImageUrl } from "@leave/shared";
import { hc } from "hono/client";

// 공용 HTTP 유틸은 @leave/shared에서 재사용 (중복 제거)
export { ApiError, unwrap } from "@leave/shared";

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

export function imageUrl(key: string | null | undefined): string | null {
  return buildImageUrl(API_URL, key);
}
