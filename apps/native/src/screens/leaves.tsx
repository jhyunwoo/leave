/**
 * 내 휴가 목록 화면(네이티브).
 * 다가오는 일정과 지난 일정을 나누고, 재원별 잔여 요약과 보유 휴가로 가는 길을 준다.
 */

import { fmtRange } from "@leave/shared";
import { Stack, useRouter } from "expo-router";
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
import type { MyLeave } from "@leave/client";
import { useDeleteLeave, useLeaveBalances, useMyLeaves } from "@leave/client";
import { ActionMenu } from "@/components/action-menu";
import { ContentPanel } from "@/components/content-panel";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { SegmentBadges } from "@/components/segment-badges";
import { colors, layout, radius, spacing } from "@/theme";

export function LeavesScreen() {
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);
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
  const visibleBalances = (balances.data?.balances ?? []).filter(
    (item) =>
      item.totalDays > 0 ||
      item.usedDays > 0 ||
      item.remainingDays > 0 ||
      item.expiredDays > 0,
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
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        {process.env.EXPO_OS === "web" && (
          <Text style={styles.webTitle}>내 휴가</Text>
        )}
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
              <Text style={styles.detailLink}>자세히</Text>
            </Pressable>

            <ContentPanel style={styles.balancePanel}>
              <Text style={styles.sectionTitle} selectable>
                휴가 재원
              </Text>
              {visibleBalances.map((item, index) => (
                <View
                  key={item.key}
                  style={[styles.balanceRow, index > 0 && styles.rowDivider]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.balanceLabel} selectable>
                      {item.label}
                    </Text>
                    {/* 주기 재원은 이월되지 않아 총량·사용량이 이번 주기 기준이다. */}
                    <Text style={styles.balanceMeta} selectable>
                      {item.cycleScoped ? "이번 주기 · " : ""}총{" "}
                      {item.totalDays}일 · 사용 {item.usedDays}일
                      {item.expiredDays > 0
                        ? ` · 만료 ${item.expiredDays}일`
                        : ""}
                    </Text>
                  </View>
                  <Text style={styles.balanceValue} selectable>
                    {item.remainingDays}일
                  </Text>
                </View>
              ))}
              {visibleBalances.length < balances.data.balances.length && (
                <Text style={styles.balanceHint} selectable>
                  잔여가 없는 재원은 보유 휴가 상세에서 추가할 수 있어요.
                </Text>
              )}
            </ContentPanel>
          </>
        ) : null}

        {leaves.isPending ? (
          <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
            <ActivityIndicator color={colors.ink} />
          </View>
        ) : !leaves.data || leaves.data.leaves.length === 0 ? (
          <ContentPanel style={styles.empty}>
            <Text style={styles.emptyTitle}>아직 등록한 휴가가 없어요</Text>
            <Text style={styles.emptyCaption}>
              휴가를 등록하면 부대 달력에 함께 표시돼요.
            </Text>
          </ContentPanel>
        ) : (
          <ContentPanel style={styles.leaveList}>
            {leaves.data.leaves.map((l, index) => (
              <View
                key={l.id}
                style={[styles.leaveRow, index > 0 && styles.rowDivider]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${l.title} 자세히 보기`}
                  onPress={() =>
                    router.push({
                      pathname: "/leave/[leaveId]",
                      params: { leaveId: l.id },
                    })
                  }
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <Text style={styles.leaveTitle}>{l.title}</Text>
                  <Text style={styles.leaveDates}>
                    {fmtRange(l.startDate, l.endDate)}
                  </Text>
                  {l.reason ? (
                    <Text style={styles.leaveReason}>{l.reason}</Text>
                  ) : null}
                  <SegmentBadges segments={l.segments} />
                </Pressable>
                <ActionMenu
                  label={`${l.title} 작업`}
                  buttonLabel="휴가 관리"
                  testID={`leave-actions-${l.id}`}
                  actions={[
                    {
                      id: "edit",
                      title: "수정",
                      systemImage: "pencil",
                      onPress: () => setEditing(l),
                    },
                    {
                      id: "delete",
                      title: "삭제",
                      systemImage: "trash",
                      destructive: true,
                      disabled: del.isPending,
                      onPress: () => confirmDelete(l),
                    },
                  ]}
                />
              </View>
            ))}
          </ContentPanel>
        )}
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon="plus"
          variant="prominent"
          tintColor={colors.brand}
          onPress={() => setCreating(true)}
        >
          등록
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

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
  balancePanel: { paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: colors.ink,
    paddingBottom: spacing.sm,
  },
  balanceRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
    paddingVertical: spacing.md,
  },
  rowDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
  balanceLabel: { fontSize: 14, fontWeight: "600", color: colors.ink },
  balanceValue: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  balanceMeta: { fontSize: 11, color: colors.mute, paddingTop: 2 },
  balanceHint: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
    paddingTop: spacing.md,
    fontSize: 11,
    color: colors.mute,
  },
  holdingsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.primaryPale,
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
  detailLink: { fontSize: 13, fontWeight: "700", color: colors.brand },
  empty: {
    padding: spacing.xxxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  emptyCaption: { fontSize: 13, color: colors.body },
  leaveList: { paddingHorizontal: spacing.xl },
  leaveRow: {
    paddingVertical: spacing.xl,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  leaveTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  leaveDates: { fontSize: 14, color: colors.body, marginTop: 2 },
  leaveReason: { fontSize: 12, color: colors.mute, marginTop: 4 },
});
