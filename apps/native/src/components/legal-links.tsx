import * as Linking from "expo-linking";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "@/theme";

const PUBLIC_SITE = "https://leave-web.moveto.workers.dev";

const LINKS = [
  { label: "개인정보처리방침", url: `${PUBLIC_SITE}/privacy` },
  { label: "이용약관", url: `${PUBLIC_SITE}/terms` },
  { label: "지원·문의", url: `${PUBLIC_SITE}/support` },
] as const;

export function LegalLinks() {
  return (
    <View style={styles.row} accessibilityLabel="법적 고지와 지원 링크">
      {LINKS.map((item) => (
        <Pressable
          key={item.url}
          accessibilityRole="link"
          accessibilityLabel={`${item.label} 열기`}
          hitSlop={8}
          onPress={() => void Linking.openURL(item.url)}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.55 }]}
        >
          <Text style={styles.text}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.lg,
  },
  link: { minHeight: 44, justifyContent: "center" },
  text: { fontSize: 12, color: colors.body, textDecorationLine: "underline" },
});
