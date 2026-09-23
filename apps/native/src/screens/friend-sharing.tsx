/**
 * 친구 공유 설정(네이티브) — 친구에게 보여줄 항목을 고른다.
 *
 * 사용처: 친구 탭 툴바의 "공유 설정"(app/(tabs)/(friends)/sharing.tsx).
 *
 * 모든 친구에게 같게 적용되고, 끈 항목은 서버가 응답에서 뺀다. 이 화면은 그 설정을
 * 바꾸는 곳일 뿐 무엇을 감추는 곳이 아니다.
 *
 * 설정을 받기 전에는 체크박스를 그리지 않는다. 기본값인 "켜짐"을 먼저 그렸다가 실제
 * 값으로 바꾸면, 공유를 끈 사람에게 잠깐이라도 "공유 중"이라고 말하게 된다.
 */

import { useFriendSharing, useUpdateFriendSharing } from "@leave/client";
import { ActivityIndicator, ScrollView, Text } from "react-native";
import { ContentPanel } from "@/components/content-panel";
import { NativeCheckbox } from "@/components/native-checkbox";
import { layout, makeStyles, spacing, useColors } from "@/theme";

export function FriendSharingScreen() {
  const styles = useStyles();
  const colors = useColors();
  const sharing = useFriendSharing();
  const update = useUpdateFriendSharing();
  const current = sharing.data?.sharing;

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {process.env.EXPO_OS === "web" && (
        <Text style={styles.webTitle}>공유 설정</Text>
      )}
      <ContentPanel style={styles.card}>
        <Text selectable style={styles.title}>
          내가 공유하는 항목
        </Text>
        <Text selectable style={styles.body}>
          모든 친구에게 똑같이 적용돼요. 끈 항목은 친구 화면에 “비공개”로
          보여요.
        </Text>
        {current ? (
          <>
            <NativeCheckbox
              value={current.serviceProgress}
              onValueChange={(serviceProgress) =>
                update.mutate({ serviceProgress })
              }
              label="복무율 (입대일·전역일)"
              testID="friend-sharing-service-progress"
            />
            <NativeCheckbox
              value={current.dutyDays}
              onValueChange={(dutyDays) => update.mutate({ dutyDays })}
              label="남은 일과일"
              testID="friend-sharing-duty-days"
            />
            <Text style={styles.hint}>휴가로 빠지는 날이 반영된 숫자예요.</Text>
            <NativeCheckbox
              value={current.leaveSchedule}
              onValueChange={(leaveSchedule) =>
                update.mutate({ leaveSchedule })
              }
              label="휴가 일정 (외출 포함)"
              testID="friend-sharing-leave-schedule"
            />
            <Text style={styles.hint}>
              끄면 친구 달력과 새 휴가 알림에서도 빠져요.
            </Text>
          </>
        ) : sharing.isError ? (
          <Text style={styles.error}>공유 설정을 불러오지 못했어요.</Text>
        ) : (
          <ActivityIndicator color={colors.ink} />
        )}
        {update.isError ? (
          <Text style={styles.error}>
            저장하지 못했어요. 잠시 후 다시 시도해주세요.
          </Text>
        ) : null}
      </ContentPanel>
    </ScrollView>
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
  card: { padding: spacing.xl, gap: spacing.md },
  title: { fontSize: 18, fontWeight: "700", color: colors.ink },
  body: { fontSize: 13, lineHeight: 20, color: colors.body },
  hint: { fontSize: 12, lineHeight: 18, color: colors.mute },
  error: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
}));
