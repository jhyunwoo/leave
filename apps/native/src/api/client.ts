/**
 * 네이티브 앱의 HTTP 계층.
 *
 * 하는 일은 세 가지다.
 *  1) 개발/프로덕션 서버 주소를 정한다(개발 중에는 Metro 호스트의 8787).
 *  2) 토큰을 SecureStore에 보관하고 매 요청에 붙인다.
 *  3) 응답이 401이면 "세션이 끊겼다"고 앱에 알린다.
 *
 * 실제 요청 목록(어떤 화면이 무엇을 부르는가)은 `@leave/client`에 있다.
 * 사용처: apps/native/src/api/provider.tsx 가 이 모듈을 어댑터로 감싼다.
 */

import type { AppType } from "@leave/api";
import {
  resolveApiUrl,
  unwrap as unwrapResponse,
  type UnwrappableResponse,
} from "@leave/shared/http";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { hc } from "hono/client";
import { Platform } from "react-native";
import {
  captureApiResponseError,
  instrumentedFetch,
} from "@/lib/observability/http";

// 공용 HTTP 유틸은 @leave/shared에서 재사용 (중복 제거)
export { ApiError } from "@leave/shared/http";

const TOKEN_KEY = "leave.token";

/**
 * 세션 토큰을 담는 키체인 항목의 접근 조건.
 *
 * 기본값(`WHEN_UNLOCKED`)에는 `ThisDeviceOnly`가 없어, 이 항목이 **암호화 백업에
 * 실려 다른 기기로 복원된다.** 토큰 하나면 30일짜리 세션이 통째로 열리므로
 * (apps/api/src/lib/sessions.ts) 기기를 넘겨주거나 백업이 새는 순간 계정도 함께
 * 넘어간다. 잠금 조건은 그대로 두고 기기 밖으로 나가는 것만 막는다 —
 * `AFTER_FIRST_UNLOCK_*`으로 바꾸면 잠긴 기기에서도 읽히게 되어 두 가지가 한꺼번에
 * 달라진다.
 *
 * Android는 `allowBackup: false`(app.json)로 이미 막혀 있고, 이 옵션은 무시된다.
 */
const TOKEN_STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

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
    if (Platform.OS === "web") {
      authToken = globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
      return authToken;
    }
    // 읽을 때는 접근 조건이 조회 조건에 들어가지 않는다 — 예전 조건으로 저장된
    // 항목도 그대로 읽힌다. 그래서 이미 깔려 있는 기기가 로그아웃 없이 넘어오도록,
    // 읽자마자 한 번 다시 써서 조건만 갱신한다.
    authToken = await SecureStore.getItemAsync(TOKEN_KEY);
    if (authToken) {
      await SecureStore.setItemAsync(TOKEN_KEY, authToken, TOKEN_STORE_OPTIONS);
    }
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
    if (token) {
      await SecureStore.setItemAsync(TOKEN_KEY, token, TOKEN_STORE_OPTIONS);
    } else {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    }
  } catch {
    // 저장 실패는 세션을 막지 않는다 (메모리 토큰으로 계속 동작)
  }
}

// 접속 기록에 남길 클라이언트 식별 정보 (플랫폼/앱 버전)
const CLIENT_VERSION: string = Constants.expoConfig?.version ?? "dev";

export const api = hc<AppType>(API_URL, {
  fetch: instrumentedFetch,
  headers: (): Record<string, string> => ({
    "X-Client-Platform": Platform.OS,
    "X-Client-Version": CLIENT_VERSION,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
  }),
});

/**
 * 세션이 더 이상 유효하지 않을 때(토큰 만료·삭제·서버에서 세션 소멸) 부를 콜백.
 * 루트 레이아웃이 등록해 토큰을 비우면 Stack.Protected가 로그인 화면으로 돌려보낸다.
 */
let onUnauthorized: (() => void) | null = null;

export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

/** 토큰을 들고 보낸 요청이 401로 돌아왔을 때만 세션을 끊는다. */
function reportUnauthorized(status: number): void {
  if (status === 401 && authToken) onUnauthorized?.();
}

/**
 * 공용 unwrap에 "인증이 깨지면 로그아웃" 처리를 얹은 앱 전용 래퍼.
 * 화면마다 401을 따로 다루지 않아도 되도록 모든 요청이 이 함수를 지난다.
 */
export async function unwrap<T>(res: UnwrappableResponse): Promise<T> {
  reportUnauthorized(res.status);
  try {
    return await unwrapResponse<T>(res);
  } catch (error) {
    captureApiResponseError(error, res);
    throw error;
  }
}

/** 바이너리 업로드처럼 raw fetch를 쓰는 곳에서 401을 같은 방식으로 다룬다. */
export function checkAuthorized(res: { status: number }): void {
  reportUnauthorized(res.status);
}
