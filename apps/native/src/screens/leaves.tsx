import {
  BALANCE_LABELS,
  fmtRange,
  fmtRangeTiny,
  segmentBalanceKey,
} from "@leave/shared";
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
import type { MyLeave } from "@/api/queries";
import { useDeleteLeave, useLeaveBalances, useMyLeaves } from "@/api/queries";
import { Button } from "@/components/button";
import { LeaveFormModal } from "@/components/leave-form-modal";
import {
  ScreenHeader,
  useScreenHeaderHeight,
} from "@/components/screen-header";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

export function LeavesScreen() {
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);
  const headerHeight = useScreenHeaderHeight({ subtitle: true });
  const router = useRouter();

  // 보유 휴가 화면과 같은 셈 — 주기 재원은 이번 주기 몫에 앞으로 받을 몫(upcomingDays)까지
  // 더한다. 다른 재원의 적립 예정분은 아직 확정이 아니라 여기 넣지 않는다.
  const holdings = (balances.data?.balances ?? []).reduce(
    (sum, item) => ({
      remaining:
        sum.remaining +
        item.remainingDays +
        (item.cycleScoped ? item.upcomingDays : 0),
      expiringSoon: sum.expiringSoon + item.expiringSoonDays,
      expired: sum.expired + item.expiredDays,
    }),
    { remaining: 0, expiringSoon: 0, expired: 0 },
  );

  const confirmDelete = (leave: MyLeave) => {
    Alert.alert("휴가 삭제", `"${leave.title}" 휴가를 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: () => void del.mutateAsync(leave.id),
      },
    ]);
  };

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: headerHeight }]}
      >
        {balances.data ? (
          <>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="보유 휴가 자세히 보기"
              onPress={() => router.push("/leave-grants")}
              style={styles.holdingsCard}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.holdingsEyebrow} selectable>
                  보유 휴가
                </Text>
                <Text style={styles.holdingsValue} selectable>
                  남은 {holdings.remaining}일
                </Text>
                {holdings.expiringSoon > 0 || holdings.expired > 0 ? (
                  <Text style={styles.holdingsMeta} selectable>
                    {holdings.expiringSoon > 0
                      ? `만료 임박 ${holdings.expiringSoon}일`
                      : ""}
                    {holdings.expiringSoon > 0 && holdings.expired > 0
                      ? " · "
                      : ""}
                    {holdings.expired > 0 ? `소멸 ${holdings.expired}일` : ""}
                  </Text>
                ) : (
                  <Text style={styles.holdingsHint} selectable>
                    만기 기한과 정기외박 주기를 관리해요
                  </Text>
                )}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>

            <View style={styles.balanceGrid}>
              {balances.data.balances.map((item) => (
                <View key={item.key} style={styles.balanceCard}>
                  <Text style={styles.balanceLabel} selectable>
                    {item.label}
                  </Text>
                  <Text style={styles.balanceValue} selectable>
                    {item.remainingDays}일
                  </Text>
                  {/* 주기 재원은 이월되지 않아 총량·사용량이 이번 주기 기준이다. */}
                  <Text style={styles.balanceMeta} selectable>
                    {item.cycleScoped ? "이번 주기 " : ""}총 {item.totalDays} ·
                    사용 {item.usedDays}
                  </Text>
                  {item.expiredDays > 0 ? (
                    <Text style={styles.balanceExpired} selectable>
                      만료 {item.expiredDays}일
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          </>
        ) : null}

        {leaves.isPending ? (
          <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : !leaves.data || leaves.data.leaves.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 등록한 휴가가 없어요</Text>
            <Text style={styles.emptyCaption}>
              휴가를 등록하면 부대 달력에 함께 표시돼요.
            </Text>
          </View>
        ) : (
          leaves.data.leaves.map((l) => (
            <View key={l.id} style={styles.leaveCard}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.leaveTitle}>{l.title}</Text>
                <Text style={styles.leaveDates}>
                  {fmtRange(l.startDate, l.endDate)}
                </Text>
                {l.reason ? (
                  <Text style={styles.leaveReason}>{l.reason}</Text>
                ) : null}
                <View style={styles.segmentBadges}>
                  {l.segments.map((segment) => {
                    const key = segmentBalanceKey(segment);
                    const tone = BALANCE_COLORS[key];
                    return (
                      <View
                        key={`${key}-${segment.startDate}`}
                        style={[styles.badge, { backgroundColor: tone.bg }]}
                      >
                        <Text
                          style={[styles.badgeText, { color: tone.fg }]}
                          selectable
                        >
                          {BALANCE_LABELS[key]}{" "}
                          {fmtRangeTiny(segment.startDate, segment.endDate)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </View>
              <View style={styles.actions}>
                <Button
                  title="수정"
                  variant="secondary"
                  size="sm"
                  onPress={() => setEditing(l)}
                />
                <Button
                  title="삭제"
                  variant="danger"
                  size="sm"
                  disabled={del.isPending}
                  onPress={() => confirmDelete(l)}
                />
              </View>
            </View>
          ))
        )}
      </ScrollView>

      <ScreenHeader
        title="내 휴가"
        subtitle="등록한 휴가를 고치거나 지울 수 있어요."
        actions={
          <Button
            title="휴가 등록"
            size="sm"
            onPress={() => setCreating(true)}
          />
        }
      />

      {(creating || editing) && (
        <LeaveFormModal
          visible
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 120 },
  balanceGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  balanceCard: {
    width: "31%",
    minWidth: 96,
    backgroundColor: colors.primaryPale,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    padding: spacing.md,
  },
  balanceLabel: { fontSize: 11, color: colors.mute },
  balanceValue: {
    fontSize: 20,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    paddingTop: 2,
  },
  balanceMeta: { fontSize: 10, color: colors.mute, paddingTop: 2 },
  balanceExpired: {
    fontSize: 10,
    fontWeight: "600",
    color: colors.negativeDeep,
    paddingTop: 2,
  },
  holdingsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    padding: spacing.xl,
  },
  holdingsEyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  holdingsValue: {
    fontSize: 24,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
    paddingTop: 2,
  },
  holdingsMeta: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.negativeDeep,
    paddingTop: 2,
  },
  holdingsHint: { fontSize: 12, color: colors.mute, paddingTop: 2 },
  chevron: { fontSize: 28, color: colors.mute, lineHeight: 30 },
  empty: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
    borderWidth: 0,
    borderCurve: "continuous",
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  emptyCaption: { fontSize: 13, color: colors.body },
  leaveCard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    borderWidth: 0,
    borderCurve: "continuous",
  },
  leaveTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  leaveDates: { fontSize: 14, color: colors.body, marginTop: 2 },
  leaveReason: { fontSize: 12, color: colors.mute, marginTop: 4 },
  segmentBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
  actions: { gap: spacing.sm },
});
