import { Stack } from "expo-router/stack";
import { sideSafeAreaScreenLayout } from "@/components/side-safe-area";
import { useColors } from "@/theme";

export default function FriendsStackLayout() {
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
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.brand,
        contentStyle: { backgroundColor: colors.canvasSoft },
      }}
    >
      <Stack.Screen name="index" options={{ title: "친구" }} />
      <Stack.Screen name="add" options={{ title: "친구 추가" }} />
      <Stack.Screen name="sharing" options={{ title: "공유 설정" }} />
    </Stack>
  );
}
