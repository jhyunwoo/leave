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
      {/*
        시트 안쪽은 `SheetScaffold`가 제목과 닫기 버튼을 직접 그린다. 여기서
        네이티브 헤더까지 띄우면(스택 기본값 `headerShown` + `headerTransparent`)
        투명 헤더가 그 위에 겹쳐, 시트 제목과 닫기 버튼을 가린다.
      */}
      <Stack.Screen
        name="personal-event"
        options={{
          headerShown: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  );
}
