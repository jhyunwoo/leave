/** 알림 탭의 스택 레이아웃 — 목록과 알림 설정 화면을 담는다. */

import { Stack } from "expo-router/stack";
import { useColors } from "@/theme";

export default function NotificationsStackLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: process.env.EXPO_OS !== "web",
        headerTransparent: process.env.EXPO_OS !== "web",
        headerShadowVisible: false,
        headerLargeTitle: process.env.EXPO_OS !== "web",
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
