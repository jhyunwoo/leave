import { Stack } from "expo-router/stack";
import { colors } from "@/theme";

export default function CalendarStackLayout() {
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
    </Stack>
  );
}
