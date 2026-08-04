import { Stack } from "expo-router/stack";
import { colors } from "@/theme";

export default function NotificationsStackLayout() {
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
    </Stack>
  );
}
