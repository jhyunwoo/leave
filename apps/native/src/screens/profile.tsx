/**
 * 프로필 탭(네이티브) — 내 정보 요약, 복무율, 공유 그룹, 홈 화면 위젯.
 *
 * 값을 **바꾸는** 일은 전부 "내 정보 수정"이 여는 화면에 있다
 * (`screens/profile-edit.tsx`). 예전에는 여기에 사용자 이름·개인정보와 계정까지
 * 섞여 있었고, 복무율을 보러 들어온 사람이 계정 삭제 버튼까지 지나쳐 스크롤해야
 * 했다.
 *
 * 위젯 카드만 그 분리에서 예외다. 홈 화면에 위젯을 붙이는 일은 내 값을 고치는
 * 일이 아니라 "내 상태를 보는 또 하나의 길"이라 이 탭에 속하고, 무엇보다
 * 편집 화면 안에 있으면 아무도 찾지 못했다. 그래서 그리드 **밖** 맨 아래에 둔다.
 *
 * 넓은 창에서는 위쪽 세 장을 두 열로 나눈다 — 한 열에 쌓아도 짧지만, 태블릿에서
 * 카드 하나가 화면 폭을 통째로 쓰면 글줄이 지나치게 길어진다.
 */

import { fmtDateK, formatUsername, type ISODate } from "@leave/shared";
import { Link, Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLogout, useMe, useMyDutyDays } from "@leave/client";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { ServiceProgress } from "@/components/service-progress";
import { WebScreenActions } from "@/components/web-screen-actions";
import { confirmAction } from "@/lib/dialog";
import { useRefresh } from "@/lib/use-refresh";
import { ResponsiveGrid, useWindowSizeClass } from "@/adaptive";
import { layout, makeStyles, spacing, useColors } from "@/theme";

export function ProfileScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const me = useMe();
  const dutyDays = useMyDutyDays();
  const refresh = useRefresh(me, dutyDays);
  const logout = useLogout();

  const router = useRouter();

  if (me.isPending || !me.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  const { user, unit } = me.data;

  const confirmLogout = async () => {
    const confirmed = await confirmAction({
      title: "로그아웃",
      message: "로그아웃할까요?",
      confirmLabel: "로그아웃",
      destructive: true,
    });
    if (confirmed) await logout.mutateAsync();
  };

  return (
    <>
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
        refreshControl={
          <RefreshControl
            refreshing={refresh.refreshing}
            onRefresh={refresh.onRefresh}
            tintColor={colors.mute}
          />
        }
      >
        {process.env.EXPO_OS === "web" ? (
          <View style={styles.webHeader}>
            <Text selectable style={styles.webTitle}>
              설정
            </Text>
            {/* 웹에는 툴바가 없으므로 로그아웃도 여기서 연다. */}
            <WebScreenActions
              actions={[
                {
                  id: "logout",
                  title: "로그아웃",
                  variant: "danger",
                  disabled: logout.isPending,
                  onPress: () => void confirmLogout(),
                  testID: "profile-logout",
                },
              ]}
            />
          </View>
        ) : null}

        <ResponsiveGrid
          sizeClass={sizeClass}
          // 카드 안의 글이 짧아 두 열에서도 줄이 어색해지지 않는다.
          columns={{ compact: 1, medium: 2 }}
        >
          <ContentPanel style={styles.card}>
            <View style={styles.profileRow}>
              <Avatar name={user.name} size={64} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text selectable style={styles.alias}>
                  {user.name}
                </Text>
                {user.username ? (
                  <Text selectable style={styles.email}>
                    {formatUsername(user.username)}
                  </Text>
                ) : null}
                <Text selectable style={styles.email}>
                  {user.email}
                </Text>
              </View>
            </View>
            <Text selectable style={styles.privacyHint}>
              별칭만 표시합니다. 실명·군번·기수는 넣지 마세요. 프로필 사진은
              올릴 수 없고 부대 화면에도 이니셜만 나갑니다.
            </Text>

            <View style={styles.divider} />
            <View style={styles.infoGrid}>
              <InfoItem label="군 종류" value={user.branchLabel} />
              <InfoItem label="계급" value={user.rankLabel} />
              <InfoItem label="입대일" value={fmtDateK(user.enlistedAt)} />
              <InfoItem
                label="전역 예정일"
                value={fmtDateK(user.dischargeAt)}
                // 남은 일과일은 별도 요청이라 한 박자 늦게 붙는다. 자리를 미리
                // 비워 두지 않고 도착한 뒤에만 덧붙여 칸이 흔들리지 않게 한다.
                caption={
                  dutyDays.data
                    ? `D-${user.daysUntilDischarge} · 일과 ${dutyDays.data.dutyDays}일`
                    : `D-${user.daysUntilDischarge}`
                }
              />
            </View>
            <Button
              title="내 정보 수정"
              variant="secondary"
              onPress={() => router.push("/(tabs)/profile/edit")}
              testID="edit-profile"
            />
          </ContentPanel>

          <Link href="/service-progress" asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="복무율 전체 화면으로 보기"
              accessibilityHint="실시간 세로 복무율 프로그래스 바를 엽니다"
              style={({ pressed }) => pressed && styles.progressCardPressed}
              testID="profile-service-progress-card"
            >
              <ContentPanel style={styles.card}>
                <ServiceProgress
                  enlistedAt={user.enlistedAt as ISODate}
                  dischargeAt={user.dischargeAt as ISODate}
                  daysLeft={user.daysUntilDischarge}
                  dutyDays={dutyDays.data?.dutyDays ?? null}
                  caption={
                    user.nextPromotionDate
                      ? `다음 진급 ${fmtDateK(user.nextPromotionDate)}`
                      : "더 이상 예정된 진급이 없어요"
                  }
                />
                <View style={styles.progressDisclosure}>
                  <Text style={styles.progressDisclosureText}>
                    전체 화면으로 보기
                  </Text>
                  <Text style={styles.progressDisclosureChevron}>›</Text>
                </View>
              </ContentPanel>
            </Pressable>
          </Link>

          <ContentPanel style={styles.card}>
            <InfoItem label="공유 그룹" value={unit?.name ?? "참여 전"} />
            <Button
              title="그룹 참여·관리"
              variant="secondary"
              onPress={() => router.push("/units")}
            />
          </ContentPanel>
        </ResponsiveGrid>

        {/*
          위젯 카드는 그리드 밖에 둔다 — medium 폭에서 2열에 끼면 반쪽으로
          눌려 "맨 아래"라는 자리의 뜻이 사라진다. 내 정보 수정 안에 있던 것을
          여기로 옮겼다. 홈 화면에 붙이는 일은 "내 값을 고치는 일"이 아니라
          이 탭이 이미 맡고 있는 "지금 내 상태를 보는 길"에 가깝다.
        */}
        <ContentPanel style={styles.card}>
          <Text selectable style={styles.sectionTitle}>
            홈 화면 위젯
          </Text>
          <Text selectable style={styles.sectionBody}>
            전역일 D-Day·다음 휴가·남은 휴가를 홈 화면과 잠금화면에서 바로 볼 수
            있어요. 어떤 지표를 보여줄지 여기서 고릅니다.
          </Text>
          <Button
            title="위젯 설정"
            variant="secondary"
            onPress={() => router.push("/widget-settings")}
            testID="open-widget-settings"
          />
        </ContentPanel>
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="rectangle.portrait.and.arrow.right"
          onPress={() => void confirmLogout()}
        >
          로그아웃
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}

function InfoItem(props: { label: string; value: string; caption?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.infoItem}>
      <Text selectable style={styles.infoLabel}>
        {props.label}
      </Text>
      <Text selectable style={styles.infoValue}>
        {props.value}
      </Text>
      {props.caption ? (
        <Text selectable style={styles.infoCaption}>
          {props.caption}
        </Text>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  webTitle: { fontSize: 28, fontWeight: "800", color: colors.ink },
  card: { padding: spacing.xl, gap: spacing.lg },
  progressCardPressed: { opacity: 0.65 },
  progressDisclosure: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: spacing.xs,
  },
  progressDisclosureText: {
    color: colors.brand,
    fontSize: 13,
    fontWeight: "700",
  },
  progressDisclosureChevron: {
    color: colors.brand,
    fontSize: 22,
    lineHeight: 22,
    fontWeight: "500",
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  alias: { fontSize: 22, fontWeight: "700", color: colors.ink },
  email: { fontSize: 12, color: colors.mute, marginTop: 2 },
  privacyHint: { fontSize: 13, lineHeight: 19, color: colors.body },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  sectionBody: { fontSize: 14, lineHeight: 21, color: colors.body },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    rowGap: spacing.lg,
    columnGap: spacing.lg,
  },
  infoItem: { gap: 2, minWidth: 120, flexGrow: 1, flexBasis: "40%" },
  infoLabel: { fontSize: 12, color: colors.mute },
  infoValue: { fontSize: 15, fontWeight: "600", color: colors.ink },
  infoCaption: { fontSize: 12, color: colors.brand, fontWeight: "600" },
}));
