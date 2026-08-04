import { fmtDateShort } from "@leave/shared";
import { Stack } from "expo-router";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useMarkNotificationsRead, useNotifications } from "@/api/queries";
import { Badge } from "@/components/badge";
import { ContentPanel } from "@/components/content-panel";
import { colors, layout, spacing } from "@/theme";

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

  return (
    <>
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {process.env.EXPO_OS === "web" && (
          <Text style={styles.webTitle}>알림</Text>
        )}
        {list.isPending ? (
          <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : !list.data || list.data.notifications.length === 0 ? (
          <ContentPanel style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 알림이 없어요</Text>
            <Text style={styles.emptyCaption}>
              내 휴가 기간에 최대 출타 인원이 초과되면 알려드릴게요.
            </Text>
          </ContentPanel>
        ) : (
          <ContentPanel style={styles.list}>
            {list.data.notifications.map((n, index) => (
              <View
                key={n.id}
                style={[
                  styles.notificationRow,
                  index > 0 && styles.rowDivider,
                  !n.read && styles.unreadRow,
                ]}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      backgroundColor: n.read
                        ? colors.hairline
                        : colors.negative,
                    },
                  ]}
                />
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text style={[styles.cardTitle, n.read && styles.readText]}>
                    {n.title}
                  </Text>
                  <Text style={[styles.cardBody, n.read && styles.readText]}>
                    {n.body}
                  </Text>
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
            ))}
          </ContentPanel>
        )}
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          hidden={!list.data || list.data.unreadCount === 0}
          disabled={markRead.isPending}
          onPress={() => void markRead.mutateAsync()}
        >
          {markRead.isPending ? "처리 중…" : "모두 읽음"}
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    maxWidth: layout.readableContent,
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  webTitle: { fontSize: 28, fontWeight: "800", color: colors.ink },
  empty: {
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  emptyCaption: { fontSize: 13, color: colors.body },
  list: { paddingHorizontal: spacing.lg, overflow: "hidden" },
  notificationRow: {
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.sm,
    flexDirection: "row",
    gap: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  unreadRow: { backgroundColor: colors.negativeTint },
  dot: { width: 10, height: 10, borderRadius: 5, marginTop: 5 },
  cardTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  cardBody: { fontSize: 14, color: colors.body, lineHeight: 20 },
  readText: { color: colors.mute },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  time: { fontSize: 12, color: colors.mute, marginTop: 2 },
});
