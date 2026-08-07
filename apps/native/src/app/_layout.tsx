/**
 * 네이티브 앱의 루트 레이아웃 — 프로바이더, 세션 복원, 화면 스택.
 *
 * expo-router가 이 파일을 모든 화면의 부모로 삼는다.
 *
 * 시작 순서가 화면 깜빡임을 좌우한다. SecureStore에서 토큰을 되살릴 때까지는
 * 스플래시를 유지하고(`ready`), 그 뒤에야 Stack.Protected가 로그인 여부에 따라
 * 갈 곳을 정한다. 먼저 그리면 로그인 화면이 한 프레임 번쩍인다.
 *
 * 쿼리 캐시는 디스크에 저장한다(PersistQueryClientProvider). 통신이 끊긴
 * 훈련장·생활관에서도 마지막으로 본 달력과 내 휴가는 볼 수 있어야 한다.
 */

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { loadStoredToken } from "@/api/client";
import { ApiProvider } from "@/api/provider";
import { ErrorScreen } from "@/components/error-screen";
import { persistFatalError, toFatalRecord } from "@/lib/fatal-error";
import {
  configureQueryOnlineManager,
  QUERY_CACHE_MAX_AGE,
  queryPersistenceOptions,
} from "@/lib/query-persistence";
import { useNotificationLogging } from "@/lib/use-notification-logging";
import { tokenAtom } from "@/state/auth";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();
configureQueryOnlineManager();

/**
 * 라우트 트리 안에서 난 렌더 오류를 잡는다. 이게 없으면 프로덕션에서 렌더 오류가
 * 경계 없이 위로 올라가 RCTFatal로 앱이 종료된다.
 *
 * 이 경계는 라우트 트리 안쪽만 덮는다. 그 바깥은 index.js의 RootErrorBoundary가
 * 맡는다. 여기서도 내용을 남겨야 다음 실행에서 원인을 되짚을 수 있다.
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const record = useMemo(() => toFatalRecord(error), [error]);
  useEffect(() => {
    void SplashScreen.hideAsync();
    persistFatalError(record);
  }, [record]);
  return (
    <ErrorScreen
      title="문제가 발생했어요"
      body="화면을 그리는 중 오류가 났어요. 다시 시도해도 계속되면 아래 내용을 알려주세요."
      record={record}
      actionLabel="다시 시도"
      onAction={() => void retry()}
    />
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: QUERY_CACHE_MAX_AGE,
      networkMode: "offlineFirst",
    },
  },
});

function RootNavigator() {
  const token = useAtomValue(tokenAtom);
  const setToken = useSetAtom(tokenAtom);
  const [ready, setReady] = useState(false);

  // SecureStore에서 토큰을 되살릴 때까지는 스플래시를 유지한다. 먼저 그리면
  // 로그인 화면이 한 프레임 번쩍이고 나서 홈으로 넘어간다.
  useEffect(() => {
    void loadStoredToken().then((stored) => {
      setToken(stored);
      setReady(true);
      void SplashScreen.hideAsync();
    });
  }, [setToken]);

  const isAuthed = token !== null && token !== undefined;
  // 로그인 상태에서만 이 앱 푸시의 수신·열람 이벤트를 서버에 보고 (동의 기반)
  useNotificationLogging(isAuthed);

  if (!ready || token === undefined) return null; // 스플래시 유지

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.canvasSoft },
      }}
    >
      <Stack.Protected guard={isAuthed}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="units"
          options={{
            presentation: "formSheet",
            headerShown: true,
            title: "그룹 참여",
            headerTransparent: process.env.EXPO_OS !== "web",
            headerShadowVisible: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.75, 1],
            contentStyle: {
              backgroundColor:
                process.env.EXPO_OS === "web"
                  ? colors.canvasSoft
                  : "transparent",
            },
            headerTitleStyle: { fontWeight: "600", color: colors.ink },
          }}
        />
        <Stack.Screen
          name="unit-manage"
          options={{
            presentation: "formSheet",
            headerShown: true,
            title: "그룹 관리",
            headerTransparent: process.env.EXPO_OS !== "web",
            headerShadowVisible: false,
            sheetGrabberVisible: true,
            sheetAllowedDetents: [0.75, 1],
            contentStyle: {
              backgroundColor:
                process.env.EXPO_OS === "web"
                  ? colors.canvasSoft
                  : "transparent",
            },
            headerTitleStyle: { fontWeight: "600", color: colors.ink },
          }}
        />
        {/* 내 휴가 탭에서 들락거리는 목적지라 모달이 아니라 카드로 밀어 뒤로가기를 남긴다. */}
        <Stack.Screen
          name="leave-grants"
          options={{
            headerShown: true,
            title: "보유 휴가",
            // 탭은 헤더를 숨겨 제목이 없으므로, 돌아갈 곳을 뒤로가기에 직접 적는다.
            headerBackTitle: "내 휴가",
            headerStyle: { backgroundColor: colors.canvas },
            headerTitleStyle: { fontWeight: "600", color: colors.ink },
          }}
        />
        {/* 알림 탭·내 휴가 탭 양쪽에서 들어오므로 돌아갈 곳을 고정하지 않는다. */}
        <Stack.Screen
          name="leave/[leaveId]"
          options={{
            headerShown: true,
            title: "휴가 상세",
            headerBackTitle: "뒤로",
            headerStyle: { backgroundColor: colors.canvas },
            headerTitleStyle: { fontWeight: "600", color: colors.ink },
          }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthed}>
        <Stack.Screen name="login" />
        <Stack.Screen name="signup" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={queryPersistenceOptions}
    >
      {/* ApiProvider는 401 처리에서 쿼리 캐시를 비우므로 QueryClient 안쪽이어야 한다. */}
      <ApiProvider>
        <StatusBar style="auto" />
        <RootNavigator />
      </ApiProvider>
    </PersistQueryClientProvider>
  );
}
