/** 달력 탭의 스택 레이아웃(헤더 스타일만 정한다). */

import { Stack } from "expo-router/stack";
import { sideSafeAreaScreenLayout } from "@/components/side-safe-area";
import { useColors } from "@/theme";

export default function CalendarStackLayout() {
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
            ? { backgroundColor: colors.canvas }
            : undefined,
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
        시트 크롬은 시스템 내비게이션 바가 맡는다(제목·닫기는 화면 쪽에서 채운다).

        RN으로 시트 안에 헤더를 그리면 formSheet 안에서 그 헤더만 레이아웃 자리를
        못 잡아, 스크롤 본문이 시트 맨 위에서 시작하며 제목과 닫기 버튼을 덮었다.
        투명 헤더도 같은 이유로 쓰지 않는다 — 콘텐츠가 바 아래로 들어가 겹친다.
      */}
      <Stack.Screen
        name="personal-event"
        options={{
          headerShown: true,
          headerTransparent: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
        }}
      />
      <Stack.Screen
        name="unit-event"
        options={{
          headerShown: true,
          headerTransparent: false,
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
        }}
      />
    </Stack>
  );
}
