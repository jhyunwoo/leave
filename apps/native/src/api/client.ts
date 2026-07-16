import type { AppType } from "@leave/api";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { hc } from "hono/client";
import { Platform } from "react-native";

const TOKEN_KEY = "leave.token";

function defaultApiUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (envUrl) return envUrl;
  // 개발 중에는 Metro 번들러 호스트(개발 PC)의 8787 포트로 접속
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (host) return `http://${host}:8787`;
  return "http://localhost:8787";
}

export const API_URL = defaultApiUrl();

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

export const api = hc<AppType>(API_URL, {
  headers: (): Record<string, string> =>
    authToken ? { Authorization: `Bearer ${authToken}` } : {},
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function unwrap<T>(res: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "요청을 처리하지 못했습니다";
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export function imageUrl(key: string | null | undefined): string | null {
  return key ? `${API_URL}/images/${key}` : null;
}
