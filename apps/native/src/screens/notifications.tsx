/**
 * 알림함 화면(네이티브).
 * 열면 전부 읽음 처리되고, 초과 알림은 해당 휴가 상세로 이어진다.
 */

import { fmtDateShort } from "@leave/shared";
import { Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useMarkNotificationsRead,
  useMyLeaves,
  useNotifications,
  type NotificationList,
} from "@leave/client";
import { ContentPanel } from "@/components/content-panel";
import { layout, makeStyles, radius, spacing, useColors } from "@/theme";

type Notification = NotificationList["notifications"][number];

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${d
    .getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export function NotificationsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const list = useNotifications();
  const markRead = useMarkNotificationsRead();
  const myLeaves = useMyLeaves();
  const router = useRouter();

  /**
   * 초과일 중 내 휴가가 걸린 첫 날짜와 그 휴가를 찾는다.
   *
   * 알림의 leaveId는 초과를 유발한 "남의" 휴가라 이동에 쓸 수 없다. 알림을 받은
   * 사람은 정의상 초과일에 자기 휴가가 있으므로 여기서 되짚을 수 있다 —
   * 다만 알림을 받은 뒤 그 휴가를 지웠거나 기간을 바꿨으면 못 찾을 수 있다.
   */
  const resolveTarget = (dates: string[]) => {
    for (const date of [...dates].sort()) {
      const mine = myLeaves.data?.leaves.find(
        (leave) => leave.startDate <= date && date <= leave.endDate,
      );
      if (mine) return { leaveId: mine.id, date };
    }
    return null;
  };

  const openDates = (dates: string[]) => {
    const target = resolveTarget(dates);
    if (!target) {
      Alert.alert(
        "휴가를 찾을 수 없어요",
        "이미 삭제하거나 기간을 바꾼 계획일 수 있어요.",
      );
      return;
    }
    router.push({
      pathname: "/leave/[leaveId]",
      params: { leaveId: target.leaveId, date: target.date },
    });
  };

  /** 날짜 배지 줄. 배지 하나하나가 그 날짜의 상세로 가는 입구다. */
  const renderDates = (notification: Notification) =>
    notification.dates.length > 0 ? (
      <View style={styles.dateRow}>
        {notification.dates.map((date) => (
          <Pressable
            key={date}
            accessibilityRole="button"
            accessibilityLabel={`${fmtDateShort(date)} 휴가 상세 보기`}
            onPress={() => openDates([date])}
            style={styles.dateChip}
          >
            <Text style={styles.dateChipText}>{fmtDateShort(date)}</Text>
          </Pressable>
        ))}
      </View>
    ) : null;

  const notifications = list.data?.notifications ?? [];
  const [latest, ...earlier] = notifications;

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
        ) : !latest ? (
          <ContentPanel style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 알림이 없어요</Text>
            <Text style={styles.emptyCaption}>
              내 휴가 기간에 최대 출타 인원이 초과되면 알려드릴게요.
            </Text>
          </ContentPanel>
        ) : (
          <>
            {/* 최근 알림은 목록에서 떼어내 가장 먼저, 가장 크게 보여준다. */}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`최근 알림: ${latest.title}. 휴가 상세 보기`}
              testID="latest-notification"
              onPress={() => openDates(latest.dates)}
            >
              <ContentPanel
                tone={latest.read ? "plain" : "danger"}
                style={styles.latestCard}
              >
                <View style={styles.latestHeader}>
                  <Text style={styles.eyebrow}>최근 알림</Text>
                  {!latest.read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.latestTitle} selectable>
                  {latest.title}
                </Text>
                <Text style={styles.latestBody} selectable>
                  {latest.body}
                </Text>
                {renderDates(latest)}
                <View style={styles.latestFooter}>
                  <Text style={styles.time}>{fmtTime(latest.createdAt)}</Text>
                  <Text style={styles.detailLink}>자세히</Text>
                </View>
              </ContentPanel>
            </Pressable>

            {earlier.length > 0 && (
              <>
                <Text style={styles.sectionTitle}>이전 알림</Text>
                <ContentPanel style={styles.list}>
                  {earlier.map((n, index) => (
                    <Pressable
                      key={n.id}
                      accessibilityRole="button"
                      accessibilityLabel={`${n.title}. 휴가 상세 보기`}
                      onPress={() => openDates(n.dates)}
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
                        <Text
                          style={[styles.cardTitle, n.read && styles.readText]}
                        >
                          {n.title}
                        </Text>
                        <Text
                          style={[styles.cardBody, n.read && styles.readText]}
                        >
                          {n.body}
                        </Text>
                        {renderDates(n)}
                        <Text style={styles.time}>{fmtTime(n.createdAt)}</Text>
                      </View>
                    </Pressable>
                  ))}
                </ContentPanel>
              </>
            )}
          </>
        )}
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="gearshape"
          onPress={() => router.push("/notifications/settings")}
        >
          설정
        </Stack.Toolbar.Button>
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

const useStyles = makeStyles(({ colors }) => ({
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
  latestCard: { padding: spacing.xl, gap: spacing.sm },
  latestHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
    color: colors.brand,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.negative,
  },
  latestTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  latestBody: { fontSize: 14, lineHeight: 20, color: colors.body },
  latestFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  detailLink: { fontSize: 13, fontWeight: "700", color: colors.brand },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.mute,
    paddingHorizontal: spacing.sm,
    marginBottom: -spacing.sm,
  },
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
  // 안 읽은 카드는 배경이 negativeTint라 같은 톤 배지는 묻힌다. 테두리로 세운다.
  dateChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.canvas,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.negative,
  },
  dateChipText: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  time: { fontSize: 12, color: colors.mute, marginTop: 2 },
}));
