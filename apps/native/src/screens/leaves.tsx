import { allocationBalanceKey, BALANCE_LABELS, fmtRange } from "@leave/shared";
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
import type { MyLeave } from "@/api/queries";
import { useDeleteLeave, useLeaveBalances, useMyLeaves } from "@/api/queries";
import { Button } from "@/components/button";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { colors, radius, spacing } from "@/theme";

export function LeavesScreen() {
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);
  const insets = useSafeAreaInsets();
  const topPadding =
    process.env.EXPO_OS === "web" ? 80 : insets.top + spacing.xs;

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
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: topPadding }]}
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>내 휴가</Text>
          <Text style={styles.subtitle}>
            등록한 휴가를 고치거나 지울 수 있어요.
          </Text>
        </View>
        <Button title="휴가 등록" size="sm" onPress={() => setCreating(true)} />
      </View>

      {balances.data ? (
        <View style={styles.balanceGrid}>
          {balances.data.balances.map((item) => (
            <View key={item.key} style={styles.balanceCard}>
              <Text style={styles.balanceLabel} selectable>
                {item.label}
              </Text>
              <Text style={styles.balanceValue} selectable>
                {item.remainingDays}일
              </Text>
              <Text style={styles.balanceMeta} selectable>
                총 {item.totalDays} · 사용 {item.usedDays}
              </Text>
            </View>
          ))}
        </View>
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
              <View style={styles.allocationBadges}>
                {l.allocations.map((allocation) => {
                  const key = allocationBalanceKey(allocation);
                  return (
                    <View key={key} style={styles.badge}>
                      <Text style={styles.badgeText} selectable>
                        {BALANCE_LABELS[key]} {allocation.days}일
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 120 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    marginBottom: spacing.sm,
    gap: spacing.md,
  },
  title: {
    fontSize: 36,
    fontWeight: "900",
    letterSpacing: -0.8,
    color: colors.ink,
  },
  subtitle: { fontSize: 14, color: colors.body, marginTop: 4 },
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
  allocationBadges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  badge: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { fontSize: 11, fontWeight: "600", color: colors.ink },
  actions: { gap: spacing.sm },
});
