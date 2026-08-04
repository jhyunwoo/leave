import { fmtDateShort } from "@leave/shared";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL, getAuthToken } from "@/api/client";
import { useDeleteAccount, useLogout, useMe } from "@/api/queries";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { ServiceProgress } from "@/components/service-progress";
import { colors, layout, spacing } from "@/theme";

export function ProfileScreen() {
  const me = useMe();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const router = useRouter();
  const qc = useQueryClient();
  const [uploading, setUploading] = useState(false);

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
      "계정 삭제",
      "계정과 등록한 휴가·알림·접속 기록이 영구히 삭제됩니다. 이 작업은 되돌릴 수 없어요. 정말 삭제할까요?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "삭제",
          style: "destructive",
          onPress: () =>
            void deleteAccount
              .mutateAsync()
              .catch((err) =>
                Alert.alert(
                  "삭제 실패",
                  err instanceof Error
                    ? err.message
                    : "잠시 후 다시 시도해주세요",
                ),
              ),
        },
      ],
    );
  };

  const changePhoto = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (result.canceled || !asset) return;
    setUploading(true);
    try {
      const blob = await (await fetch(asset.uri)).blob();
      const res = await fetch(`${API_URL}/images/profile`, {
        method: "PUT",
        headers: {
          "content-type": asset.mimeType ?? "image/jpeg",
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: blob,
      });
      if (!res.ok) throw new Error("업로드하지 못했습니다");
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      Alert.alert(
        "사진 변경 실패",
        err instanceof Error ? err.message : "업로드하지 못했습니다",
      );
    } finally {
      setUploading(false);
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
          <Text style={styles.webTitle}>프로필</Text>
        )}
        {/* 계급/전역 — DESIGN.md의 밝고 절제된 제품 UI 패널 */}
        <ContentPanel tone="accent" style={styles.darkCard}>
          <View style={styles.darkTop}>
            <View>
              <Text style={styles.darkEyebrow}>현재 계급</Text>
              <Text style={styles.rank}>{user.rankLabel}</Text>
              <Text style={styles.darkMeta}>
                {user.branchLabel} · {user.name}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={styles.darkEyebrow}>전역까지</Text>
              <Text style={styles.dday}>D-{user.daysUntilDischarge}</Text>
            </View>
          </View>

          <ServiceProgress
            enlistedAt={user.enlistedAt}
            dischargeAt={user.dischargeAt}
            caption={
              user.nextPromotionDate
                ? `다음 진급 ${fmtDateShort(user.nextPromotionDate)}`
                : "최종 계급"
            }
          />
        </ContentPanel>

        {/* 프로필 정보 */}
        <ContentPanel style={styles.card}>
          <View style={styles.profileRow}>
            <Avatar
              name={user.name}
              imageKey={user.profileImageKey}
              size={64}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{user.name}</Text>
              <Text style={styles.email}>{user.email}</Text>
            </View>
          </View>
          <Button
            title={uploading ? "올리는 중…" : "프로필 사진 변경"}
            variant="secondary"
            size="sm"
            loading={uploading}
            onPress={() => void changePhoto()}
          />

          <View style={styles.infoGrid}>
            <InfoItem label="군 종류" value={user.branchLabel} />
            <InfoItem label="소속 부대" value={unit?.name ?? "미소속"} />
            <InfoItem label="입대일" value={user.enlistedAt} />
            <InfoItem label="전역 예정일" value={user.dischargeAt} />
          </View>
          <View style={styles.cardDivider} />
          <Button
            title="부대 관리"
            variant="secondary"
            onPress={() => router.push("/units")}
          />
        </ContentPanel>
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Menu icon="ellipsis">
          <Stack.Toolbar.MenuAction
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
          </Stack.Toolbar.MenuAction>
          <Stack.Toolbar.MenuAction
            icon="trash"
            destructive
            disabled={deleteAccount.isPending}
            onPress={confirmDeleteAccount}
          >
            계정 삭제
          </Stack.Toolbar.MenuAction>
        </Stack.Toolbar.Menu>
      </Stack.Toolbar>
    </>
  );
}

function InfoItem(props: { label: string; value: string }) {
  return (
    <View style={styles.infoItem}>
      <Text style={styles.infoLabel}>{props.label}</Text>
      <Text style={styles.infoValue}>{props.value}</Text>
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
  darkCard: {
    padding: spacing.xxl,
    gap: spacing.xl,
  },
  darkTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: spacing.xl,
  },
  darkEyebrow: {
    fontSize: 12,
    fontWeight: "500",
    color: colors.mute,
  },
  rank: {
    fontSize: 52,
    fontWeight: "900",
    color: colors.ink,
    lineHeight: 58,
    marginTop: 4,
  },
  dday: {
    fontSize: 34,
    fontWeight: "900",
    color: colors.ink,
    marginTop: 8,
  },
  darkMeta: { fontSize: 14, color: colors.body, marginTop: spacing.sm },
  card: {
    padding: spacing.xl,
    gap: spacing.lg,
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  name: { fontSize: 22, fontWeight: "600", color: colors.ink },
  email: { fontSize: 12, color: colors.mute, marginTop: 2 },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  infoItem: { flexGrow: 1, flexBasis: "44%", minWidth: 132 },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.hairline,
  },
  infoLabel: { fontSize: 12, color: colors.mute },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    marginTop: 2,
  },
});
