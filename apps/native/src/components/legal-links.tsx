/**
 * 공개 문서 링크(개인정보처리방침·이용약관·지원).
 * 로그인 전에도 열 수 있어야 한다(Apple 5.1.1(i)). 앱에는 정적 페이지가 없으므로
 * 웹 사이트의 절대 URL을 브라우저로 연다 — 열지 못하는 기기가 있고 그때 무엇을
 * 하는지는 `lib/external-link.ts`에 있다.
 */

import { Pressable, Text, View } from "react-native";
import { openExternalLink } from "@/lib/external-link";
import { makeStyles, spacing } from "@/theme";

const PUBLIC_SITE = "https://leave.moveto.kr";

const LINKS = [
  { label: "개인정보처리방침", url: `${PUBLIC_SITE}/privacy` },
  { label: "이용약관", url: `${PUBLIC_SITE}/terms` },
  { label: "지원·문의", url: `${PUBLIC_SITE}/support` },
] as const;

export function LegalLinks() {
  const styles = useStyles();
  return (
    <View style={styles.row} accessibilityLabel="법적 고지와 지원 링크">
      {LINKS.map((item) => (
        <Pressable
          key={item.url}
          accessibilityRole="link"
          accessibilityLabel={`${item.label} 열기`}
          hitSlop={8}
          onPress={() => void openExternalLink(item.url, item.label)}
          style={({ pressed }) => [styles.link, pressed && { opacity: 0.55 }]}
        >
          <Text style={styles.text}>{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
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
}));
