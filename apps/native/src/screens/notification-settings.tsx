/**
 * 알림 설정 화면(네이티브).
 * 종류별 수신 on/off와 함께, 기기 푸시 권한·토큰 등록 상태도 여기서 다룬다.
 */

import { useState } from "react";
import { ScrollView, Text } from "react-native";
import {
  useNotificationPrefs,
  useRegisterPushToken,
  useUpdateNotificationPrefs,
} from "@leave/client";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { NativeCheckbox } from "@/components/native-checkbox";
import { getPushToken } from "@/lib/notifications";
import { ResponsiveGrid, useWindowSizeClass } from "@/adaptive";
import { layout, makeStyles, spacing } from "@/theme";

export function NotificationSettingsScreen() {
  const styles = useStyles();
  const { sizeClass, isCompact } = useWindowSizeClass();
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
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: isCompact
            ? layout.readableContent
            : layout.workspaceContent,
        },
      ]}
    >
      {process.env.EXPO_OS === "web" && (
        <Text style={styles.webTitle}>알림 설정</Text>
      )}
      <ResponsiveGrid
        sizeClass={sizeClass}
        columns={{ compact: 1, medium: 2 }}
      >
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
      </ResponsiveGrid>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  webTitle: { fontSize: 28, fontWeight: "800", color: colors.ink },
  preferenceCard: { padding: spacing.xl, gap: spacing.md },
  preferenceTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  preferenceBody: { fontSize: 13, lineHeight: 20, color: colors.body },
  permissionResult: { fontSize: 12, color: colors.body },
}));
