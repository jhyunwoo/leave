/** 알림 탭의 스택 레이아웃 — 목록과 알림 설정 화면을 담는다. */

import { Stack } from "expo-router/stack";
import { sideSafeAreaScreenLayout } from "@/components/side-safe-area";
import { useColors } from "@/theme";

export default function NotificationsStackLayout() {
  const colors = useColors();
  return (
    <Stack
      /* 사이드바가 열린 iPad에서 화면 좌우가 사이드바 밑에 깔리지 않게 한다. */
      screenLayout={sideSafeAreaScreenLayout}
      screenOptions={{
        headerShown: process.env.EXPO_OS !== "web",
        // Android는 투명 헤더 아래 콘텐츠의 상단 여백을 자동 보정하지 않는다.
        headerTransparent: process.env.EXPO_OS === "ios",
        headerStyle:
          process.env.EXPO_OS === "android"
            ? { backgroundColor: colors.canvasSoft }
            : undefined,
        headerShadowVisible: false,
        headerLargeTitle: process.env.EXPO_OS === "ios",
        headerLargeStyle: { backgroundColor: "transparent" },
        headerLargeTitleShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.brand,
        contentStyle: { backgroundColor: colors.canvasSoft },
      }}
    >
      <Stack.Screen name="index" options={{ title: "알림" }} />
      {/* 설정은 목록 위로 밀어 넣어 뒤로가기로 알림 목록에 돌아오게 한다. */}
      <Stack.Screen
        name="settings"
        options={{
          title: "알림 설정",
          headerLargeTitle: false,
          headerBackTitle: "알림",
          headerBackButtonDisplayMode: "default",
        }}
      />
    </Stack>
  );
}
