/**
 * 내 휴가 화면(네이티브) — 잔여와 계획을 한자리에서 본다.
 *
 * 다가오는 일정과 지난 일정을 나누고, 재원별 잔여 요약과 보유 휴가로 가는 길을 준다.
 *
 * ## 창 폭에 따라 열이 늘어난다
 *
 *   compact  : 지금까지처럼 한 줄로 쌓는다(잔여 → 재원 → 목록).
 *   medium   : [잔여·재원] | [휴가 목록] 두 열. 스크롤 없이 "얼마 있고 뭘 잡아
 *              뒀는지"를 동시에 본다.
 *   expanded : [잔여·재원] | [목록] | [고른 휴가 상세] 세 열. 목록에서 고르면
 *              화면을 떠나지 않고 오른쪽에서 상세를 읽는다.
 *
 * 세 번째 열은 `/leave/[leaveId]` 라우트와 같은 본문(`LeaveDetailContent`)을
 * 쓴다. 딥링크·푸시·좁은 창은 여전히 라우트로 들어오고, 넓은 창에서만 그 본문이
 * 자리를 옮긴다.
 */

import { fmtRange } from "@leave/shared/calendar";
import {
  LEAVE_KIND_LABELS,
  LEAVE_KINDS,
  type LeaveKind,
} from "@leave/shared/leave";
import { Stack, useRouter } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Text,
  View,
} from "react-native";
import type { MyLeave } from "@leave/client";
import {
  nextLeaveCountdowns,
  partitionMyLeavesByKind,
  summarizeHoldings,
  useDeleteLeave,
  useLeaveBalances,
  useMyLeaves,
} from "@leave/client";
import {
  sideColumnWidth,
  useMeasuredSizeClass,
  useWindowSizeClass,
} from "@/adaptive";
import { ActionMenu } from "@/components/action-menu";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { LeaveStatusControl } from "@/components/leave-status-control";
import { LazyLeaveFormModal } from "@/components/lazy-leave-form-modal";
import { NextLeaveCard } from "@/components/next-leave-card";
import { NativeSegmentedControl } from "@/components/segmented-control";
import { SegmentBadges } from "@/components/segment-badges";
import { WebScreenActions } from "@/components/web-screen-actions";
import { confirmAction } from "@/lib/dialog";
import { useActiveGate, useServiceTicker } from "@/lib/service-progress-clock";
import { useRefresh } from "@/lib/use-refresh";
import { layout, makeStyles, radius, spacing, useColors } from "@/theme";
import { LeaveDetailContent } from "./leave-detail-content";

export function LeavesScreen() {
  const styles = useStyles();
  const colors = useColors();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const { width: contentWidth, onLayout } = useMeasuredSizeClass();
  // 요약과 상세를 뺀 목록에도 최소 400pt를 남긴다.
  const canShowDetail = !isCompact && contentWidth >= 1200;
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const refresh = useRefresh(leaves, balances);
  // 열이 여럿인 레이아웃에서는 어디를 당겨도 되도록 각 열에 같은 컨트롤을 단다.
  const refreshControl = (
    <RefreshControl
      refreshing={refresh.refreshing}
      onRefresh={refresh.onRefresh}
      tintColor={colors.mute}
    />
  );
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);
  // 넓은 창에서만 쓰는 선택. 라우트가 아니라 화면 안의 선택이라 뒤로가기를
  // 만들지 않는다 — 목록에서 항목을 훑는 동안 히스토리가 쌓이면 안 된다.
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
  const router = useRouter();
  const active = useActiveGate();
  const now = useServiceTicker(active, 1_000);

  const holdings = summarizeHoldings(balances.data?.balances);
  /** 만료·소멸처럼 눈에 띄어야 하는 것만 경고 색으로. 계획은 경고가 아니다. */
  const holdingsWarning = [
    holdings.expiringSoon > 0 ? `만료 임박 ${holdings.expiringSoon}일` : null,
    holdings.expired > 0 ? `소멸 ${holdings.expired}일` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const visibleBalances = (balances.data?.balances ?? []).filter(
    (item) =>
      item.totalDays > 0 ||
      item.usedDays > 0 ||
      item.remainingDays > 0 ||
      item.expiredDays > 0,
  );

  const myLeaves = leaves.data?.leaves ?? [];
  // 탭은 화면 안의 사적인 필터다 — 선택한 휴가와 마찬가지로 라우트로 만들지 않는다.
  const [kind, setKind] = useState<LeaveKind>("leave");
  const byKind = partitionMyLeavesByKind(leaves.data?.leaves);
  const sections = byKind[kind];
  const kindTotal = byKind[kind].upcoming.length + byKind[kind].past.length;
  // 휴가와 외출을 따로 센다. 셀 것이 없는 쪽 카드는 그리지 않는다.
  const { leave: nextLeave, outing: nextOuting } = nextLeaveCountdowns(
    leaves.data?.leaves,
    new Date(now),
  );
  // 선택해 둔 휴가가 사라졌으면(삭제·기간 변경) 선택도 함께 비운다. 갈래로 거르지
  // 않은 myLeaves에서 찾으므로 탭을 바꿔도 상세 열은 그대로 남는다 — 의도다.
  const selectedLeave =
    myLeaves.find((leave) => leave.id === selectedLeaveId) ?? null;

  const confirmDelete = async (leave: MyLeave) => {
    const confirmed = await confirmAction({
      title: "휴가 삭제",
      message: `"${leave.title}" 휴가를 삭제할까요?`,
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!confirmed) return;
    await del.mutateAsync(leave.id);
    if (selectedLeaveId === leave.id) setSelectedLeaveId(null);
  };

  /**
   * 목록에서 한 건을 연다. 상세를 붙일 열이 있으면 그 자리에서 바꾸고, 없으면
   * 지금까지처럼 라우트로 민다.
   */
  const openLeave = (leave: MyLeave) => {
    if (canShowDetail) {
      setSelectedLeaveId((current) => (current === leave.id ? null : leave.id));
      return;
    }
    router.push({
      pathname: "/leave/[leaveId]",
      params: { leaveId: leave.id },
    });
  };

  const balanceColumn = (
    <View style={styles.stack}>
      {/* 잔여가 아직 안 왔다고 D-day까지 사라지면 안 된다 — 이 카드들이 기대는 것은
          myLeaves 하나뿐이라 balances 조건 바깥에 둔다. */}
      {nextLeave ? (
        <NextLeaveCard
          countdown={nextLeave}
          kind="leave"
          onPress={() => openLeave(nextLeave.leave)}
        />
      ) : null}
      {nextOuting ? (
        <NextLeaveCard
          countdown={nextOuting}
          kind="outing"
          onPress={() => openLeave(nextOuting.leave)}
        />
      ) : null}
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
                남은 휴가 {holdings.remaining}일
              </Text>
              {holdings.planned > 0 ? (
                <Text style={styles.holdingsHint} selectable>
                  계획 {holdings.planned}일
                </Text>
              ) : null}
              {holdingsWarning ? (
                <Text style={styles.holdingsMeta} selectable>
                  {holdingsWarning}
                </Text>
              ) : holdings.planned === 0 ? (
                <Text style={styles.holdingsHint} selectable>
                  만기 기한과 정기외박 주기를 관리해요
                </Text>
              ) : null}
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
                    {item.cycleScoped ? "이번 주기 · " : ""}총 {item.totalDays}
                    일 · 사용 {item.usedToDateDays}일
                    {item.plannedDays > 0
                      ? ` · 계획 ${item.plannedDays}일`
                      : ""}
                    {item.expiredDays > 0
                      ? ` · 만료 ${item.expiredDays}일`
                      : ""}
                  </Text>
                </View>
                <Text style={styles.balanceValue} selectable>
                  {item.remainingAsOfTodayDays}일
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
    </View>
  );

  const renderLeaveRow = (l: MyLeave, index: number) => {
    const selected = canShowDetail && l.id === selectedLeave?.id;
    return (
      <View
        key={l.id}
        style={[
          styles.leaveRow,
          index > 0 && styles.rowDivider,
          // 색만으로 선택을 알리지 않도록 왼쪽에 굵은 표시선을 함께 둔다.
          selected && styles.leaveRowSelected,
        ]}
      >
        <View style={styles.leaveMainRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={canShowDetail ? { selected } : undefined}
            accessibilityLabel={`${l.title} 자세히 보기`}
            onPress={() => openLeave(l)}
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
                onPress: () => void confirmDelete(l),
              },
            ]}
          />
        </View>
        <LeaveStatusControl leave={l} />
      </View>
    );
  };

  const leaveList = (
    <View style={styles.stack}>
      {leaves.isPending ? (
        <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : myLeaves.length === 0 ? (
        <ContentPanel style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 등록한 휴가가 없어요</Text>
          <Text style={styles.emptyCaption}>
            휴가를 등록하면 부대 달력에 함께 표시돼요.
          </Text>
        </ContentPanel>
      ) : (
        <>
          <NativeSegmentedControl
            values={LEAVE_KINDS}
            labels={LEAVE_KIND_LABELS}
            value={kind}
            onValueChange={setKind}
            testID="my-leaves-kind"
          />
          {kindTotal === 0 ? (
            <ContentPanel style={styles.empty}>
              <Text style={styles.emptyTitle}>
                등록한 {LEAVE_KIND_LABELS[kind]} 기록이 없어요
              </Text>
              <Text style={styles.emptyCaption}>
                다른 탭에서 나머지 출타를 볼 수 있어요.
              </Text>
            </ContentPanel>
          ) : (
            <>
              {sections.upcoming.length > 0 ? (
                <ContentPanel style={styles.leaveList}>
                  <Text style={styles.sectionTitle} selectable>
                    다가오는 {LEAVE_KIND_LABELS[kind]}{" "}
                    {sections.upcoming.length}건
                  </Text>
                  {sections.upcoming.map(renderLeaveRow)}
                </ContentPanel>
              ) : null}
              {sections.past.length > 0 ? (
                <ContentPanel style={styles.leaveList}>
                  <Text style={styles.sectionTitle} selectable>
                    지난 {LEAVE_KIND_LABELS[kind]} {sections.past.length}건
                  </Text>
                  {sections.past.map(renderLeaveRow)}
                </ContentPanel>
              ) : null}
            </>
          )}
        </>
      )}
    </View>
  );

  const detailColumn = selectedLeave ? (
    <LeaveDetailContent
      leave={selectedLeave}
      header={
        <View style={styles.detailHeader}>
          <Text style={styles.detailHeaderTitle} numberOfLines={1}>
            휴가 상세
          </Text>
          <Button
            title="닫기"
            variant="ghost"
            size="sm"
            onPress={() => setSelectedLeaveId(null)}
          />
        </View>
      }
    />
  ) : (
    <ContentPanel style={styles.detailEmpty}>
      <Text style={styles.emptyTitle}>휴가를 골라주세요</Text>
      <Text style={styles.emptyCaption}>
        목록에서 한 건을 고르면 기간·구간과 그 기간의 그룹 출타 현황을 여기서 볼
        수 있어요.
      </Text>
    </ContentPanel>
  );

  return (
    <>
      {isCompact ? (
        <ScrollView
          style={styles.root}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={styles.content}
          refreshControl={refreshControl}
        >
          <WebHeader onCreate={() => setCreating(true)} />
          {balanceColumn}
          {leaveList}
        </ScrollView>
      ) : (
        <View style={styles.root}>
          <View style={styles.columns} onLayout={onLayout}>
            {/* 열마다 스크롤을 따로 소유한다. 잔여를 보려고 목록을 끝까지
                내릴 필요가 없어야 넓은 화면을 쓰는 뜻이 있다.

                고정 폭은 ScrollView가 아니라 감싸는 View에 준다. RN Web은
                ScrollView 바깥 컨테이너에 flex-grow:1을 강제로 붙여, style로
                준 width가 growth에 밀려 다른 값으로 자란다(칼럼 3개가 각자
                지정한 폭 + 남는 폭/3만큼 넓어져 가운데 목록이 쪼그라드는
                형태로 나타났다). View는 그 규칙이 없어 폭이 그대로 지켜진다. */}
            <View style={{ width: sideColumnWidth(sizeClass) }}>
              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.columnContent}
                showsVerticalScrollIndicator={false}
                refreshControl={refreshControl}
              >
                <WebHeader onCreate={() => setCreating(true)} />
                {balanceColumn}
              </ScrollView>
            </View>

            <View style={{ flex: 1, minWidth: 0 }}>
              <ScrollView
                contentInsetAdjustmentBehavior="automatic"
                contentContainerStyle={styles.columnContent}
                refreshControl={refreshControl}
              >
                {leaveList}
              </ScrollView>
            </View>

            {canShowDetail && selectedLeave ? (
              <View style={styles.detailColumn}>
                <ScrollView
                  contentInsetAdjustmentBehavior="automatic"
                  contentContainerStyle={styles.columnContent}
                  showsVerticalScrollIndicator={false}
                >
                  {detailColumn}
                </ScrollView>
              </View>
            ) : null}
          </View>
        </View>
      )}

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
        <LazyLeaveFormModal
          visible
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={(result) => {
            // 세 번째 열이 지금 보여주던 휴가를 수정한 경우에만 따라간다. 편집 대상은
            // 목록 행의 메뉴에서 고르므로 선택과 무관한 행을 고쳤을 땐 건드리지 않는다.
            if (
              editing &&
              selectedLeaveId === editing.id &&
              result.leave.id !== editing.id
            ) {
              setSelectedLeaveId(result.leave.id);
            }
          }}
        />
      )}
    </>
  );
}

/** 웹에는 네이티브 툴바가 없으므로 제목과 등록 버튼을 본문 맨 위에 둔다. */
function WebHeader(props: { onCreate: () => void }) {
  const styles = useStyles();
  if (process.env.EXPO_OS !== "web") return null;
  return (
    <View style={styles.webHeader}>
      <Text style={styles.webTitle}>내 휴가</Text>
      <WebScreenActions
        actions={[
          {
            id: "create",
            icon: "calendarAdd" as const,
            title: "휴가 등록",
            variant: "primary",
            onPress: props.onCreate,
            testID: "leaves-create",
          },
        ]}
      />
    </View>
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
  /** 넓은 창의 열 배치. 상한을 둬 초대형 창에서 줄이 무한히 길어지지 않게 한다. */
  columns: {
    flex: 1,
    flexDirection: "row",
    gap: spacing.lg,
    width: "100%",
    maxWidth: layout.workspaceContent,
    alignSelf: "center",
    paddingHorizontal: spacing.lg,
  },
  columnContent: {
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  detailColumn: { width: layout.inspector.expanded },
  stack: { gap: spacing.lg },
  webHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
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
  detailEmpty: { padding: spacing.xl, gap: spacing.sm },
  emptyTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  emptyCaption: { fontSize: 13, lineHeight: 20, color: colors.body },
  // 첫 줄이 카드 위 경계에 붙지 않도록 제목 위 여백을 둔다. 아래쪽은 마지막
  // 행의 paddingVertical이 이미 받쳐 준다.
  leaveList: { paddingHorizontal: spacing.xl, paddingTop: spacing.lg },
  leaveRow: {
    paddingVertical: spacing.xl,
    gap: spacing.md,
    // 선택 표시선이 들어올 자리를 미리 비워 둬 행이 흔들리지 않게 한다.
    borderLeftWidth: 3,
    borderLeftColor: "transparent",
    paddingLeft: spacing.sm,
    marginLeft: -spacing.sm - 3,
  },
  leaveRowSelected: {
    borderLeftColor: colors.brand,
    backgroundColor: colors.primaryPale,
  },
  leaveMainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.lg,
  },
  leaveTitle: { fontSize: 18, fontWeight: "600", color: colors.ink },
  leaveDates: { fontSize: 14, color: colors.body, marginTop: 2 },
  leaveReason: { fontSize: 12, color: colors.mute, marginTop: 4 },
  detailHeader: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailHeaderTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: "700",
    color: colors.ink,
  },
}));
