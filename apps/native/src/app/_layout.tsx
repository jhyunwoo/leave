import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useMemo, useState } from "react";
import { loadStoredToken, setUnauthorizedHandler } from "@/api/client";
import { ErrorScreen } from "@/components/error-screen";
import { persistFatalError, toFatalRecord } from "@/lib/fatal-error";
import { useNotificationLogging } from "@/lib/use-notification-logging";
import { setSessionAtom, tokenAtom } from "@/state/auth";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();

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
    queries: { staleTime: 15_000 },
  },
});

function RootNavigator() {
  const token = useAtomValue(tokenAtom);
  const setToken = useSetAtom(tokenAtom);
  const setSession = useSetAtom(setSessionAtom);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void loadStoredToken().then((stored) => {
      setToken(stored);
      setReady(true);
      void SplashScreen.hideAsync();
    });
  }, [setToken]);

  // 저장된 토큰이 서버에서 더는 통하지 않으면(만료·세션 삭제) 조용히 로그아웃한다.
  // 토큰을 비우면 아래 Stack.Protected가 로그인 화면으로 돌려보낸다.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      queryClient.clear();
      void setSession(null);
    });
    return () => setUnauthorizedHandler(null);
  }, [setSession]);

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
            title: "부대 찾기",
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
            title: "부대 관리",
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
    <QueryClientProvider client={queryClient}>
      <StatusBar style="auto" />
      <RootNavigator />
    </QueryClientProvider>
  );
}
