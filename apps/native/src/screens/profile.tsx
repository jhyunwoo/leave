import { Stack, useRouter } from "expo-router";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useDeleteAccount, useLogout, useMe } from "@/api/queries";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { LegalLinks } from "@/components/legal-links";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { colors, layout, spacing } from "@/theme";

export function ProfileScreen() {
  const me = useMe();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const router = useRouter();

  if (me.isPending || !me.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  const { user, unit } = me.data;

  const confirmDeleteAccount = () => {
    Alert.alert(
      "계정과 데이터 영구 삭제",
      "계정, 휴가 계획, 알림, 그룹 소속 데이터가 삭제됩니다. 되돌릴 수 없어요.",
      [
        { text: "취소", style: "cancel" },
        {
          text: "영구 삭제",
          style: "destructive",
          onPress: () =>
            void deleteAccount
              .mutateAsync()
              .catch((caught) =>
                Alert.alert(
                  "삭제 실패",
                  caught instanceof Error
                    ? caught.message
                    : "잠시 후 다시 시도해주세요",
                ),
              ),
        },
      ],
    );
  };

  return (
    <>
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {process.env.EXPO_OS === "web" ? (
          <Text selectable style={styles.webTitle}>
            설정
          </Text>
        ) : null}

        <ContentPanel style={styles.card}>
          <View style={styles.profileRow}>
            <Avatar name={user.name} size={64} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text selectable style={styles.alias}>
                {user.name}
              </Text>
              <Text selectable style={styles.email}>
                {user.email}
              </Text>
            </View>
          </View>
          <Text selectable style={styles.privacyHint}>
            별칭만 표시합니다. 실명·군번·계급·기수·사진은 프로필에 저장하지
            마세요.
          </Text>

          <View style={styles.divider} />
          <InfoItem label="공유 그룹" value={unit?.name ?? "참여 전"} />
          <Button
            title="그룹 참여·관리"
            variant="secondary"
            onPress={() => router.push("/units")}
          />
        </ContentPanel>

        <OfficialDisclaimer />

        <ContentPanel style={styles.card}>
          <Text selectable style={styles.sectionTitle}>
            개인정보와 계정
          </Text>
          <Text selectable style={styles.sectionBody}>
            앱을 삭제한 뒤에도 공개 삭제 요청 페이지에서 계정 삭제 방법을 확인할
            수 있어요. 앱 안에서는 아래 버튼으로 바로 요청할 수 있습니다.
          </Text>
          <LegalLinks />
          <Button
            title={deleteAccount.isPending ? "삭제 중…" : "계정과 데이터 삭제"}
            variant="danger"
            loading={deleteAccount.isPending}
            onPress={confirmDeleteAccount}
            testID="delete-account"
          />
        </ContentPanel>
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="rectangle.portrait.and.arrow.right"
          onPress={() =>
            Alert.alert("로그아웃", "로그아웃할까요?", [
              { text: "취소", style: "cancel" },
              {
                text: "로그아웃",
                style: "destructive",
                onPress: () => void logout.mutateAsync(),
              },
            ])
          }
        >
          로그아웃
        </Stack.Toolbar.Button>
      </Stack.Toolbar>
    </>
  );
}

function InfoItem(props: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text selectable style={styles.infoLabel}>
        {props.label}
      </Text>
      <Text selectable style={styles.infoValue}>
        {props.value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
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
  card: { padding: spacing.xl, gap: spacing.lg },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  alias: { fontSize: 22, fontWeight: "700", color: colors.ink },
  email: { fontSize: 12, color: colors.mute, marginTop: 2 },
  privacyHint: { fontSize: 13, lineHeight: 19, color: colors.body },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  infoItem: { gap: 2 },
  infoLabel: { fontSize: 12, color: colors.mute },
  infoValue: { fontSize: 15, fontWeight: "600", color: colors.ink },
  sectionTitle: { fontSize: 20, fontWeight: "700", color: colors.ink },
  sectionBody: { fontSize: 14, lineHeight: 21, color: colors.body },
});
