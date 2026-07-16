import { fmtDateShort } from "@leave/shared";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import { API_URL, getAuthToken } from "@/api/client";
import { useLogout, useMe } from "@/api/queries";
import { Avatar } from "@/components/avatar";
import { Button } from "@/components/button";
import { colors, radius, spacing } from "@/theme";

export function ProfileScreen() {
  const me = useMe();
  const logout = useLogout();
  const router = useRouter();
  const qc = useQueryClient();
  const insets = useSafeAreaInsets();
  const [uploading, setUploading] = useState(false);

  if (me.isPending || !me.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  const { user, unit } = me.data;
  const progress = Math.round(user.serviceProgress * 100);

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
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + spacing.lg },
      ]}
    >
      {/* 계급/전역 — 브랜드 다크 카드 */}
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

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityLabel={`복무 진행률 ${progress}%`}
        >
          <View style={[styles.progressFill, { width: `${progress}%` }]} />
        </View>
        <View style={styles.progressLabels}>
          <Text style={styles.progressText}>복무 {progress}%</Text>
          <Text style={styles.progressText}>
            {user.nextPromotionDate
              ? `다음 진급 ${fmtDateShort(user.nextPromotionDate)}`
              : "최종 계급"}
          </Text>
        </View>
      </View>

      {/* 프로필 정보 */}
      <View style={styles.card}>
        <View style={styles.profileRow}>
          <Avatar name={user.name} imageKey={user.profileImageKey} size={64} />
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
    </ScrollView>
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
    backgroundColor: colors.ink,
    borderRadius: radius.xl,
    padding: spacing.xxl,
    gap: spacing.xl,
  },
  darkTop: { flexDirection: "row", justifyContent: "space-between" },
  darkEyebrow: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 1,
    color: "rgba(159, 232, 112, 0.7)",
    textTransform: "uppercase",
  },
  rank: {
    fontSize: 52,
    fontWeight: "900",
    color: colors.primary,
    lineHeight: 58,
    marginTop: 4,
  },
  dday: {
    fontSize: 34,
    fontWeight: "900",
    color: colors.primary,
    marginTop: 8,
  },
  darkMeta: { fontSize: 14, color: "#fff", marginTop: spacing.sm },
  progressTrack: {
    height: 10,
    borderRadius: radius.pill,
    backgroundColor: "rgba(159, 232, 112, 0.18)",
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  progressLabels: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: -spacing.md,
  },
  progressText: { fontSize: 12, color: "rgba(255,255,255,0.75)" },
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
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
  infoLabel: { fontSize: 12, color: colors.mute },
  infoValue: { fontSize: 14, fontWeight: "600", color: colors.ink, marginTop: 2 },
});
