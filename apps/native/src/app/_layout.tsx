import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ErrorBoundaryProps, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { loadStoredToken } from "@/api/client";
import { useNotificationLogging } from "@/lib/use-notification-logging";
import { tokenAtom } from "@/state/auth";
import { colors, radius, spacing } from "@/theme";

SplashScreen.preventAutoHideAsync();

/**
 * 렌더 중 발생한 예외를 여기서 잡는다. 이게 없으면 프로덕션 빌드에서 렌더 에러가
 * RCTFatal로 올라가고, expo-updates가 복구용 업데이트를 찾지 못하면 앱이 그대로
 * 종료된다 (build 14 실행 즉시 종료의 실제 경로).
 */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  void SplashScreen.hideAsync();
  return (
    <View style={errorStyles.root}>
      <Text style={errorStyles.title}>문제가 발생했어요</Text>
      <Text style={errorStyles.body}>
        화면을 그리는 중 오류가 났어요. 다시 시도해도 계속되면 잠시 후 열어주세요.
      </Text>
      <Text style={errorStyles.detail} selectable numberOfLines={6}>
        {error.message}
      </Text>
      <Pressable style={errorStyles.button} onPress={() => void retry()}>
        <Text style={errorStyles.buttonLabel}>다시 시도</Text>
      </Pressable>
    </View>
  );
}

const errorStyles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.canvas,
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.body },
  detail: {
    fontSize: 12,
    color: colors.mute,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonLabel: { fontSize: 15, fontWeight: "600", color: colors.onPrimary },
});

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
            headerStyle: { backgroundColor: colors.canvas },
            headerTitleStyle: { fontWeight: "600", color: colors.ink },
          }}
        />
        <Stack.Screen
          name="unit-manage"
          options={{
            presentation: "modal",
            headerShown: true,
            title: "부대 관리",
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
      <StatusBar style="dark" />
      <RootNavigator />
    </QueryClientProvider>
  );
}
