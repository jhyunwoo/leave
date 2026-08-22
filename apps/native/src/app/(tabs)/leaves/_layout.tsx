/** 내 휴가 탭의 스택 레이아웃(헤더 스타일만 정한다). */

import { Stack } from "expo-router/stack";
import { sideSafeAreaScreenLayout } from "@/components/side-safe-area";
import { useColors } from "@/theme";

export default function LeavesStackLayout() {
  const colors = useColors();
  return (
    <Stack
      /* 사이드바가 열린 iPad에서 화면 좌우가 사이드바 밑에 깔리지 않게 한다. */
      screenLayout={sideSafeAreaScreenLayout}
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
      <Stack.Screen name="index" options={{ title: "내 휴가" }} />
    </Stack>
  );
}
