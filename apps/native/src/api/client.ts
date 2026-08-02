import type { AppType } from "@leave/api";
import { buildImageUrl, resolveApiUrl } from "@leave/shared";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { hc } from "hono/client";
import { Platform } from "react-native";

// 공용 HTTP 유틸은 @leave/shared에서 재사용 (중복 제거)
export { ApiError, unwrap } from "@leave/shared";

const TOKEN_KEY = "leave.token";

// 개발 중에는 Metro 번들러 호스트(개발 PC)의 8787 포트로, 그 외에는 프로덕션으로.
// hostUri는 개발 서버에 붙어 있을 때만 채워지므로 스탠드얼론 빌드는 항상 프로덕션이다.
export const API_URL = resolveApiUrl({
  envUrl: process.env.EXPO_PUBLIC_API_URL,
  devHost: Constants.expoConfig?.hostUri?.split(":")[0],
});

let authToken: string | null = null;

export function getAuthToken(): string | null {
  return authToken;
}

export async function loadStoredToken(): Promise<string | null> {
  try {
    authToken =
      Platform.OS === "web"
        ? globalThis.localStorage?.getItem(TOKEN_KEY) ?? null
        : await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    authToken = null;
  }
  return authToken;
}

export async function persistToken(token: string | null): Promise<void> {
  authToken = token;
  try {
    if (Platform.OS === "web") {
      if (token) globalThis.localStorage?.setItem(TOKEN_KEY, token);
      else globalThis.localStorage?.removeItem(TOKEN_KEY);
      return;
    }
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // 저장 실패는 세션을 막지 않는다 (메모리 토큰으로 계속 동작)
  }
}

// 접속 기록에 남길 클라이언트 식별 정보 (플랫폼/앱 버전)
const CLIENT_VERSION: string = Constants.expoConfig?.version ?? "dev";

export const api = hc<AppType>(API_URL, {
  headers: (): Record<string, string> => ({
    "X-Client-Platform": Platform.OS,
    "X-Client-Version": CLIENT_VERSION,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }),
});

export function imageUrl(key: string | null | undefined): string | null {
  return buildImageUrl(API_URL, key);
}
