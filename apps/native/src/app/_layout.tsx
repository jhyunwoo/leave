import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { loadStoredToken } from "@/api/client";
import { useNotificationLogging } from "@/lib/use-notification-logging";
import { tokenAtom } from "@/state/auth";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 15_000 },
  },
});

function RootNavigator() {
  const token = useAtomValue(tokenAtom);
  const setToken = useSetAtom(tokenAtom);
  const [ready, setReady] = useState(false);

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
            presentation: "modal",
            headerShown: true,
            title: "부대 찾기",
            headerStyle: { backgroundColor: colors.canvasSoft },
            headerTitleStyle: { fontWeight: "900", color: colors.ink },
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
      <StatusBar style="dark" />
      <RootNavigator />
    </QueryClientProvider>
  );
}
