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
import { confirmAction } from "@/lib/dialog";
import { makeStyles, spacing } from "@/theme";

export function CalendarExportScreen() {
  const styles = useStyles();
  const feed = useCalendarFeed();
  const enable = useEnableCalendarFeed();
  const disable = useDisableCalendarFeed();
  const [copied, setCopied] = useState(false);
  const url = feed.data?.url ?? null;
  const busy = enable.isPending || disable.isPending;

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
      <ContentPanel style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          캘린더 구독 링크
        </Text>
        <Text selectable style={styles.sectionBody}>
          외출·외박·휴가·개인 일정·부대 일정을 아이폰 캘린더나 구글 캘린더에서
          볼 수 있어요. 삼성 캘린더는 구글 캘린더에 추가하면 함께 보여요.
        </Text>
        {feed.isPending ? null : url === null ? (
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
                void Clipboard.setStringAsync(url).then(() => setCopied(true));
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
