import { fmtDateShort } from "@leave/shared";
import { Stack } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useMarkNotificationsRead,
  useNotificationPrefs,
  useNotifications,
  useRegisterPushToken,
  useUpdateNotificationPrefs,
} from "@/api/queries";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { NativeCheckbox } from "@/components/native-checkbox";
import { getPushToken } from "@/lib/notifications";
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
  const registerPush = useRegisterPushToken();
  const prefs = useNotificationPrefs();
  const updatePrefs = useUpdateNotificationPrefs();
  const [permissionResult, setPermissionResult] = useState<string | null>(null);

  const enableDeviceNotifications = async () => {
    const token = await getPushToken();
    if (!token) {
      setPermissionResult(
        "알림 권한이 꺼져 있거나 이 기기에서 푸시를 사용할 수 없어요.",
      );
      return;
    }
    try {
      await registerPush.mutateAsync(token);
      setPermissionResult("이 기기에서 일정 상태 변동 알림을 받을 수 있어요.");
    } catch (caught) {
      setPermissionResult(
        caught instanceof Error ? caught.message : "알림을 켜지 못했어요.",
      );
    }
  };

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
        <ContentPanel style={styles.preferenceCard}>
          <Text selectable style={styles.preferenceTitle}>
            기기 알림은 원할 때만
          </Text>
          <Text selectable style={styles.preferenceBody}>
            앱에서 일정 상태가 왜 중요한지 확인한 뒤 직접 켤 수 있어요. 권한을
            허용하지 않아도 캘린더와 계획 기능은 그대로 사용할 수 있습니다.
          </Text>
          <Button
            title={registerPush.isPending ? "설정 중…" : "기기 알림 켜기"}
            variant="secondary"
            loading={registerPush.isPending}
            onPress={() => void enableDeviceNotifications()}
          />
          {permissionResult ? (
            <Text selectable style={styles.permissionResult}>
              {permissionResult}
            </Text>
          ) : null}
        </ContentPanel>

        {/* 종류별 on/off — 전부 꺼도 앱은 그대로 쓸 수 있다. */}
        <ContentPanel style={styles.preferenceCard}>
          <Text selectable style={styles.preferenceTitle}>
            받을 알림 고르기
          </Text>
          <Text selectable style={styles.preferenceBody}>
            종류별로 따로 끌 수 있어요. 모두 꺼도 캘린더와 계획 기능은 그대로
            사용할 수 있습니다.
          </Text>
          <NativeCheckbox
            value={prefs.data?.preferences.overage ?? true}
            onValueChange={(overage) => void updatePrefs.mutateAsync({ overage })}
            label="내 계획 날짜가 참고 기준을 넘겼을 때"
            testID="notification-pref-overage"
          />
          <NativeCheckbox
            value={prefs.data?.preferences.blackout ?? true}
            onValueChange={(blackout) =>
              void updatePrefs.mutateAsync({ blackout })
            }
            label="내 계획 기간에 제한 기간(검열·훈련)이 등록됐을 때"
            testID="notification-pref-blackout"
          />
          <NativeCheckbox
            value={prefs.data?.preferences.unitNotice ?? true}
            onValueChange={(unitNotice) =>
              void updatePrefs.mutateAsync({ unitNotice })
            }
            label="그룹 설정·관리자 변경 안내"
            testID="notification-pref-unit-notice"
          />
        </ContentPanel>
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
  preferenceCard: { padding: spacing.xl, gap: spacing.md },
  preferenceTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  preferenceBody: { fontSize: 13, lineHeight: 20, color: colors.body },
  permissionResult: { fontSize: 12, color: colors.body },
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
