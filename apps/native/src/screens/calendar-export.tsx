/**
 * 외부 캘린더 화면 — 리브 일정을 아이폰·구글 캘린더에서 구독하는 링크를 관리한다.
 *
 * 사용처: 라우트 `app/calendar-export.tsx`. 프로필 탭에서 들어온다.
 *
 * 링크는 비밀번호와 같다. 재발급과 끄기는 이미 붙여 둔 캘린더를 끊으므로 한 번 묻는다.
 */
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import {
  useCalendarFeed,
  useDisableCalendarFeed,
  useEnableCalendarFeed,
} from "@leave/client/hooks/calendar-feed";
import {
  calendarFeedWebcalUrl,
  googleCalendarSubscribeUrl,
} from "@leave/shared/calendar-feed";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { NativeCheckbox } from "@/components/native-checkbox";
import {
  deviceExportSupported,
  removeExportCalendar,
  requestExportPermission,
} from "@/device-calendar-export/bridge";
import { saveExportPreferences } from "@/device-calendar-export/preferences";
import { useExportPreferences } from "@/device-calendar-export/use-export-preferences";
import { confirmAction } from "@/lib/dialog";
import { makeStyles, spacing } from "@/theme";

export function CalendarExportScreen() {
  const styles = useStyles();
  const feed = useCalendarFeed();
  const enable = useEnableCalendarFeed();
  const disable = useDisableCalendarFeed();
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const exportPreferences = useExportPreferences();
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const url = feed.data?.url ?? null;
  const busy = enable.isPending || disable.isPending;

  const toggleDeviceExport = async (next: boolean) => {
    // 권한 창이나 삭제가 끝나기 전의 연타가 켜기·끄기 경로를 섞지 않게 한다.
    if (deviceBusy) return;
    setDeviceBusy(true);
    setDeviceError(null);
    try {
      if (!next) {
        await removeExportCalendar();
        return;
      }
      if (!(await requestExportPermission())) {
        setDeviceError(
          "캘린더 권한이 없어 추가할 수 없어요. 기기 설정에서 허용해 주세요.",
        );
        return;
      }
      // 켜기만 저장한다. 실제 쓰기는 CalendarExportSync가 항목을 받아 맡는다.
      await saveExportPreferences({
        ...exportPreferences,
        enabled: true,
        signature: null,
      });
    } finally {
      setDeviceBusy(false);
    }
  };

  const rotate = async () => {
    if (
      await confirmAction({
        title: "링크 재발급",
        message:
          "새 링크를 만들면 지금 링크로 구독한 캘린더는 더 이상 갱신되지 않아요.",
        confirmLabel: "재발급",
        destructive: true,
      })
    ) {
      setCopied(false);
      enable.mutate();
    }
  };

  const turnOff = async () => {
    if (
      await confirmAction({
        title: "구독 링크 끄기",
        message: "구독한 캘린더에서 리브 일정이 더 이상 갱신되지 않아요.",
        confirmLabel: "끄기",
        destructive: true,
      })
    ) {
      setCopied(false);
      disable.mutate();
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {deviceExportSupported ? (
        <ContentPanel style={styles.card}>
          <Text selectable style={styles.sectionTitle}>
            휴대폰 캘린더에 바로 추가
          </Text>
          <Text selectable style={styles.sectionBody}>
            이 휴대폰에 ‘리브’ 캘린더를 만들고 일정을 넣어요. 삼성 캘린더에서
            바로 보여요. 앱을 열 때마다 맞춰요.
          </Text>
          <NativeCheckbox
            value={exportPreferences.enabled}
            onValueChange={(next) => void toggleDeviceExport(next)}
            label="휴대폰 캘린더에 추가"
            testID="device-calendar-export-toggle"
          />
          {deviceError ? (
            <Text selectable style={styles.error}>
              {deviceError}
            </Text>
          ) : null}
        </ContentPanel>
      ) : null}
      <ContentPanel style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          캘린더 구독 링크
        </Text>
        <Text selectable style={styles.sectionBody}>
          외출·외박·휴가·개인 일정·부대 일정을 아이폰 캘린더나 구글 캘린더에서
          볼 수 있어요. 삼성 캘린더는 구글 캘린더에 추가하면 함께 보여요.
        </Text>
        {feed.isPending ? null : url === null && feed.isError ? (
          // 불러오지 못한 것을 "링크 없음"으로 읽으면 만들기가 기존 토큰을 갈아 끼워 구독이 끊긴다.
          <>
            <Text selectable style={styles.error}>
              링크 정보를 불러오지 못했어요.
            </Text>
            <Button
              icon="refresh"
              title="다시 시도"
              variant="secondary"
              onPress={() => void feed.refetch()}
            />
          </>
        ) : url === null ? (
          <Button
            icon="calendarAdd"
            title="구독 링크 만들기"
            disabled={busy}
            onPress={() => enable.mutate()}
            testID="calendar-feed-enable"
          />
        ) : (
          <View style={styles.actions}>
            {process.env.EXPO_OS === "ios" ? (
              <Button
                icon="calendarAdd"
                title="iPhone 캘린더에 추가"
                onPress={() => void Linking.openURL(calendarFeedWebcalUrl(url))}
              />
            ) : null}
            <Button
              icon="calendarAdd"
              title="Google 캘린더에 추가"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(googleCalendarSubscribeUrl(url))
              }
            />
            <Button
              icon="copy"
              title={copied ? "복사했어요" : "링크 복사"}
              variant="secondary"
              onPress={() => {
                Clipboard.setStringAsync(url).then(
                  () => {
                    setCopied(true);
                    setCopyFailed(false);
                  },
                  () => setCopyFailed(true),
                );
              }}
            />
            <Text selectable style={styles.sectionBody}>
              구글 캘린더는 바뀐 일정이 반영되기까지 최대 하루가 걸릴 수 있어요.
              링크를 가진 사람은 누구나 일정을 볼 수 있으니 공유하지 마세요.
            </Text>
            <Button
              icon="refresh"
              title="링크 재발급"
              variant="tertiary"
              disabled={busy}
              onPress={() => void rotate()}
            />
            <Button
              icon="close"
              title="끄기"
              variant="tertiary"
              disabled={busy}
              onPress={() => void turnOff()}
            />
          </View>
        )}
        {copyFailed ? (
          <Text selectable style={styles.error}>
            링크를 복사하지 못했어요.
          </Text>
        ) : null}
        {enable.error || disable.error ? (
          <Text selectable style={styles.error}>
            {(enable.error ?? disable.error)?.message}
          </Text>
        ) : null}
      </ContentPanel>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: { padding: spacing.xl, gap: spacing.lg },
  actions: { gap: spacing.sm },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  sectionBody: { fontSize: 14, lineHeight: 21, color: colors.body },
  error: { fontSize: 14, color: colors.negativeDeep },
}));
