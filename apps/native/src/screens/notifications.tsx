import { fmtDateShort } from "@leave/shared";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useMarkNotificationsRead, useNotifications } from "@/api/queries";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { colors, radius, spacing } from "@/theme";

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function NotificationsScreen() {
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const insets = useSafeAreaInsets();
  const topPadding =
    process.env.EXPO_OS === "web" ? 80 : insets.top + spacing.xs;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>알림</Text>
          <Text style={styles.subtitle}>
            최대 출타 인원 초과 소식을 여기서 확인해요.
          </Text>
        </View>
        {list.data && list.data.unreadCount > 0 && (
          <Button
            title="모두 읽음"
            variant="secondary"
            size="sm"
            loading={markRead.isPending}
            onPress={() => void markRead.mutateAsync()}
          />
        )}
      </View>

      {list.isPending ? (
        <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : !list.data || list.data.notifications.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 알림이 없어요</Text>
          <Text style={styles.emptyCaption}>
            내 휴가 기간에 출타율이 초과되면 알려드릴게요.
          </Text>
        </View>
      ) : (
        list.data.notifications.map((n) => (
          <View key={n.id} style={[styles.card, n.read && { opacity: 0.6 }]}>
            <View
              style={[
                styles.dot,
                {
                  backgroundColor: n.read ? colors.canvasSoft : colors.negative,
                },
              ]}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text style={styles.cardTitle}>{n.title}</Text>
              <Text style={styles.cardBody}>{n.body}</Text>
              {n.dates.length > 0 && (
                <View style={styles.dateRow}>
                  {n.dates.map((d) => (
                    <Badge key={d} text={fmtDateShort(d)} kind="negative" />
                  ))}
                </View>
              )}
              <Text style={styles.time}>{fmtTime(n.createdAt)}</Text>
            </View>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  subtitle: { fontSize: 14, color: colors.body, marginTop: 4 },
  empty: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 0,
    borderCurve: "continuous",
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  emptyCaption: { fontSize: 13, color: colors.body },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    flexDirection: "row",
    gap: spacing.md,
    borderWidth: 0,
    borderCurve: "continuous",
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  cardBody: { fontSize: 14, color: colors.body, lineHeight: 20 },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  time: { fontSize: 12, color: colors.mute, marginTop: 2 },
});
