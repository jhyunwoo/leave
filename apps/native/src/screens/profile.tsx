import { fmtDateShort } from "@leave/shared";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
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
import {
  ScreenHeader,
  useScreenHeaderHeight,
} from "@/components/screen-header";
import { ServiceProgress } from "@/components/service-progress";
import { colors, radius, spacing } from "@/theme";

export function ProfileScreen() {
  const me = useMe();
  const logout = useLogout();
  const deleteAccount = useDeleteAccount();
  const router = useRouter();
  const qc = useQueryClient();
  const headerHeight = useScreenHeaderHeight({ subtitle: true });
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
        contentContainerStyle={[
          styles.content,
          // paddingTop이 styles.content의 padding을 덮어써서, 헤더 아래 여백을 되살린다
          { paddingTop: headerHeight + spacing.lg },
        ]}
      >
        {/* 계급/전역 — DESIGN.md의 밝고 절제된 제품 UI 패널 */}
        <View style={styles.darkCard}>
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
        </View>

        {/* 프로필 정보 */}
        <View style={styles.card}>
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
            <Button
              title={uploading ? "올리는 중…" : "사진 변경"}
              variant="secondary"
              size="sm"
              loading={uploading}
              onPress={() => void changePhoto()}
            />
          </View>

          <View style={styles.infoGrid}>
            <InfoItem label="군 종류" value={user.branchLabel} />
            <InfoItem label="소속 부대" value={unit?.name ?? "미소속"} />
            <InfoItem label="입대일" value={user.enlistedAt} />
            <InfoItem label="전역 예정일" value={user.dischargeAt} />
          </View>
        </View>

        <View style={[styles.card, { flexDirection: "row", gap: spacing.md }]}>
          {/* 휴가 총량·만기·정기외박 설정은 모두 보유 휴가 화면으로 옮겼다. */}
          <Button
            title="보유 휴가"
            variant="secondary"
            onPress={() => router.push("/leave-grants")}
            style={{ flex: 1 }}
          />
          <Button
            title="부대 관리"
            variant="secondary"
            onPress={() => router.push("/units")}
            style={{ flex: 1 }}
          />
          <Button
            title="로그아웃"
            variant="tertiary"
            loading={logout.isPending}
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
            style={{ flex: 1 }}
          />
        </View>

        {/* 계정 삭제 (앱스토어/플레이 정책상 계정 삭제 경로 제공) */}
        <Pressable
          accessibilityRole="button"
          onPress={confirmDeleteAccount}
          disabled={deleteAccount.isPending}
          style={styles.deleteRow}
        >
          {deleteAccount.isPending ? (
            <ActivityIndicator color={colors.negativeDeep} />
          ) : (
            <Text style={styles.deleteText}>계정 삭제</Text>
          )}
        </Pressable>
      </ScrollView>

      <ScreenHeader title="프로필" subtitle="계급과 휴가 일수를 관리해요." />
    </>
  );
}

function InfoItem(props: { label: string; value: string }) {
  return (
    <View style={{ width: "45%" }}>
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
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  darkCard: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.xl,
    borderWidth: 0,
    borderCurve: "continuous",
  },
  darkTop: { flexDirection: "row", justifyContent: "space-between" },
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
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
    borderWidth: 0,
    borderCurve: "continuous",
  },
  profileRow: { flexDirection: "row", alignItems: "center", gap: spacing.lg },
  name: { fontSize: 22, fontWeight: "600", color: colors.ink },
  email: { fontSize: 12, color: colors.mute, marginTop: 2 },
  infoGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.lg,
  },
  infoLabel: { fontSize: 12, color: colors.mute },
  infoValue: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.ink,
    marginTop: 2,
  },
  deleteRow: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: spacing.md,
    minHeight: 44,
  },
  deleteText: {
    fontSize: 14,
    fontWeight: "600",
    color: colors.negativeDeep,
    textDecorationLine: "underline",
  },
});
