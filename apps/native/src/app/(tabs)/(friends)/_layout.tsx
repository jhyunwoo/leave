import { Stack } from "expo-router/stack";
import { useColors } from "@/theme";

export default function FriendsStackLayout() {
  const colors = useColors();
  return (
    <Stack
      screenOptions={{
        headerShown: process.env.EXPO_OS !== "web",
        headerTransparent: process.env.EXPO_OS !== "web",
        headerShadowVisible: false,
        headerBackButtonDisplayMode: "minimal",
        headerTintColor: colors.brand,
        contentStyle: { backgroundColor: colors.canvasSoft },
      }}
    >
      <Stack.Screen name="index" options={{ title: "친구" }} />
    </Stack>
  );
}
