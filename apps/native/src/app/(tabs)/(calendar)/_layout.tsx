/** 달력 탭의 스택 레이아웃(헤더 스타일만 정한다). */

import { Stack } from "expo-router/stack";
import { useColors } from "@/theme";

export default function CalendarStackLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: process.env.EXPO_OS !== "web",
        headerTransparent: process.env.EXPO_OS !== "web",
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.brand,
        contentStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Stack.Screen name="index" options={{ title: "부대 달력" }} />
      <Stack.Screen name="friend-calendar" options={{ title: "친구 달력" }} />
      <Stack.Screen name="personal-events" options={{ title: "개인 일정" }} />
      <Stack.Screen
        name="personal-event"
        options={{
          title: "개인 일정 편집",
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  );
}
