import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { FatalErrorRecord } from "@/lib/fatal-error";
import { colors, radius, spacing } from "@/theme";

/**
 * 오류를 사용자에게 보여주는 마지막 화면. 루트 경계와 라우트 경계가 같이 쓴다.
 *
 * 원인 문자열을 그대로 노출하는 건 의도한 것이다. 프로덕션 크래시 리포트에는
 * JS 메시지가 남지 않아, 화면에 띄워 사용자가 그대로 전해주는 것 말고는
 * 무엇이 터졌는지 알 방법이 없다. selectable로 두어 복사할 수 있게 한다.
 */
export function ErrorScreen(props: {
  title: string;
  body: string;
  record: FatalErrorRecord;
  actionLabel: string;
  onAction: () => void;
}) {
  const { record } = props;
  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>{props.title}</Text>
        <Text style={styles.body}>{props.body}</Text>

        <View style={styles.detail}>
          <Text style={styles.detailText} selectable>
            {record.message}
          </Text>
          {record.stack ? (
            <Text style={styles.detailStack} selectable>
              {record.stack}
            </Text>
          ) : null}
          {record.componentStack ? (
            <Text style={styles.detailStack} selectable>
              {record.componentStack}
            </Text>
          ) : null}
        </View>

        <Pressable
          accessibilityRole="button"
          style={styles.button}
          onPress={props.onAction}
        >
          <Text style={styles.buttonLabel}>{props.actionLabel}</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  content: {
    flexGrow: 1,
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  title: { fontSize: 24, fontWeight: "900", color: colors.ink },
  body: { fontSize: 15, lineHeight: 22, color: colors.body },
  detail: {
    gap: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.md,
    borderCurve: "continuous",
    padding: spacing.md,
  },
  detailText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  detailStack: { fontSize: 11, lineHeight: 16, color: colors.mute },
  button: {
    alignSelf: "flex-start",
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    borderCurve: "continuous",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  buttonLabel: { fontSize: 15, fontWeight: "600", color: colors.onPrimary },
});
