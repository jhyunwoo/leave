/**
 * 보유 휴가 화면(네이티브) — 재원별 적립분과 정기외박 주기를 관리한다.
 *
 * "며칠 남았는가"만 보여주면 왜 그 숫자인지 알 수 없다. 언제 얼마가 부여됐고
 * 언제 만료되는지를 적립분 단위로 펼쳐, 사용자가 직접 장부를 맞출 수 있게 한다.
 *
 * 넓은 창에서는 왼쪽에 합계를 고정하고 오른쪽에 재원별 카드를 편다. 재원 카드는
 * 서로 비교하려고 보는 것이라, 한 줄로 쌓아 두면 위아래로 스크롤하며 숫자를
 * 외워야 한다. 주기 설정과 주기 목록은 아래에서 두 열로 나뉜다.
 */

import { fmtDateShort, fmtRangeTiny, type BalanceKey } from "@leave/shared";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { LeaveGrantFund, LeaveGrantItem } from "@leave/client";
import { useDeleteLeaveGrant, useLeaveGrants, useMe } from "@leave/client";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ActionMenu } from "@/components/action-menu";
import { ContentPanel } from "@/components/content-panel";
import {
  confirmGrantDelete,
  LeaveGrantModal,
} from "@/components/leave-grant-modal";
import { OutingSettings } from "@/components/outing-settings";
import { RegularOvernightSettings } from "@/components/regular-overnight-settings";
import { StackedBar } from "@/components/stacked-bar";
import {
  ResponsiveGrid,
  sideColumnWidth,
  useWindowSizeClass,
} from "@/adaptive";
import {
  balanceTone,
  layout,
  makeStyles,
  radius,
  spacing,
  type,
  useBalanceColors,
  useColors,
} from "@/theme";

/** 만기가 이 안으로 다가오면 임박으로 본다. */
const EXPIRING_SOON = 30;
/** 접었을 때 보여줄 지난 주기 수. */
const RECENT_PAST_CYCLES = 2;

type Editing = { grant: LeaveGrantItem } | { newKey: BalanceKey } | null;

export function LeaveGrantsScreen() {
  const styles = useStyles();
  const colors = useColors();
  const balance = useBalanceColors();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const page = useLeaveGrants();
  const me = useMe();
  const del = useDeleteLeaveGrant();
  const [editing, setEditing] = useState<Editing>(null);
  const [showPastCycles, setShowPastCycles] = useState(false);

  if (page.isPending || !page.data) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.ink} />
      </View>
    );
  }

  const { totals, funds, regularOvernight, outing } = page.data;
  const cycleKey = funds.find((fund) => fund.cycleScoped)?.key ?? null;
  // 앞으로 받을 주기 몫도 남은 휴가에 들어가 있다. 지금 쓸 수 있는 양과 다르므로 밝혀 둔다.
  const upcomingCycleDays = regularOvernight.cycles
    .filter((cycle) => cycle.state === "future")
    .reduce((sum, cycle) => sum + cycle.remainingAsOfTodayDays, 0);
  // 막대는 "총량 = 사용 + (계획 + 자유)" 로 쪼갠다. 계획분은 남은 휴가에서 빠지지 않고
  // 그 안에 잡혀 있을 뿐이라 초록 안쪽을 옅은 색으로 나눈다.
  const plannedBar = Math.min(
    totals.plannedDays,
    totals.remainingAsOfTodayDays,
  );
  const freeBar = totals.remainingAsOfTodayDays - plannedBar;
  // 적립분이 있거나 이미 쓴 재원만 카드로 편다. 나머지는 아래 칩으로 둔다.
  const active = funds.filter(
    (fund) =>
      !fund.cycleScoped && (fund.grants.length > 0 || fund.usedDays > 0),
  );
  const empty = funds.filter(
    (fund) =>
      !fund.cycleScoped && fund.grants.length === 0 && fund.usedDays === 0,
  );

  const summary = (
    <ContentPanel tone="accent" style={styles.dashboard}>
      <Text style={styles.eyebrow} selectable>
        보유 휴가
      </Text>
      <Text style={styles.headline} selectable>
        남은 휴가 {totals.remainingAsOfTodayDays}일
      </Text>
      {/* 남은 일수는 오늘까지 다녀온 몫만 뺀다. 계획은 아직 통장에서 빠지지 않는다. */}
      <Text style={styles.subline} selectable>
        사용 {totals.usedToDateDays}일
        {totals.plannedDays > 0 ? ` · 계획 ${totals.plannedDays}일` : ""} · 총{" "}
        {totals.totalDays}일
      </Text>

      <StackedBar
        segments={[
          { value: totals.usedToDateDays, color: colors.surfaceStrong },
          // 계획분은 아직 남은 휴가 안에 있다 — 초록을 쪼개 "잡아둔 몫"으로 보여준다.
          { value: plannedBar, color: colors.primaryNeutral },
          { value: freeBar, color: colors.primary },
          // negativeTint는 다크에서 막대 트랙(surfaceCard)과 명도가 거의
          // 같아 소멸분이 사라진다. 채도 있는 negative로 올린다.
          { value: totals.expiredDays, color: colors.negative },
        ]}
      />

      <View style={styles.chipRow}>
        {totals.expiredDays > 0 && (
          <View
            style={[styles.statChip, { backgroundColor: colors.negativeTint }]}
          >
            <Text style={[styles.statChipText, { color: colors.negativeDeep }]}>
              소멸 {totals.expiredDays}일
            </Text>
          </View>
        )}
        {totals.upcomingDays > 0 && (
          <View
            style={[styles.statChip, { backgroundColor: colors.surfaceCard }]}
          >
            <Text style={[styles.statChipText, { color: colors.body }]}>
              예정 {totals.upcomingDays}일
            </Text>
          </View>
        )}
      </View>

      {totals.unattributedDays > 0 && (
        <Text style={styles.warning} selectable>
          적립분으로 설명되지 않는 사용 {totals.unattributedDays}일이 있어요.
          적립분을 확인해주세요.
        </Text>
      )}

      {upcomingCycleDays > 0 && (
        <Text style={styles.rule} selectable>
          전역까지 받을 정기외박 {upcomingCycleDays}일이 남은 휴가에 들어
          있어요.
        </Text>
      )}

      {/* 배분 규칙이 보이지 않으면 건별 사용 일수를 믿기 어렵다. */}
      <Text style={styles.rule} selectable>
        만기가 빠른 적립분부터 자동으로 차감돼요.
      </Text>
    </ContentPanel>
  );

  const fundCards = (
    <ResponsiveGrid
      sizeClass={sizeClass}
      // 적립분 행이 길어 좁은 열에서는 만기·사용이 두 줄로 접힌다. 두 열은
      // 실제로 넉넉한 expanded에서만 편다.
      columns={{ compact: 1, medium: 1, expanded: 2 }}
    >
      {active.map((fund) => (
        <FundCard
          key={fund.key}
          fund={fund}
          onAdd={() => setEditing({ newKey: fund.key })}
          onEdit={(grant) => setEditing({ grant })}
          onDelete={(grant) =>
            void confirmGrantDelete(grant, () => void del.mutateAsync(grant.id))
          }
        />
      ))}
      {empty.length > 0 ? (
        <ContentPanel style={styles.addCard}>
          <Text style={styles.addTitle} selectable>
            다른 재원 추가
          </Text>
          <View style={styles.chips}>
            {empty.map((fund) => {
              const tone = balanceTone(balance, fund.key);
              return (
                <Pressable
                  key={fund.key}
                  accessibilityRole="button"
                  accessibilityLabel={`${fund.label} 적립분 추가`}
                  onPress={() => setEditing({ newKey: fund.key })}
                  style={[styles.chip, { backgroundColor: tone.bg }]}
                >
                  <Text style={[styles.chipText, { color: tone.fg }]}>
                    + {fund.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ContentPanel>
      ) : null}
    </ResponsiveGrid>
  );

  // 육군도 분기마다 정기외박을 운영한다 — 군종으로 가리지 않는다.
  const overnight = me.data ? (
    <ResponsiveGrid
      sizeClass={sizeClass}
      columns={{ compact: 1, medium: 1, expanded: 2 }}
    >
      <RegularOvernightSettings
        branch={me.data.user.branch}
        config={regularOvernight}
      />
      <CycleList
        cycles={regularOvernight.cycles}
        carryOver={regularOvernight.carryOver}
        expanded={showPastCycles}
        onToggle={() => setShowPastCycles((open) => !open)}
      />

      {/* 외출은 위 총합에 들어가지 않는다 — 일이 아니라 횟수라서 "남은 휴가 N일"에
          더하면 없는 휴가를 있다고 말하게 된다. 그래서 제 단위로 따로 그린다. */}
      <OutingSettings branch={me.data.user.branch} funds={outing} />
    </ResponsiveGrid>
  ) : null;

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
      >
        {isCompact ? (
          <>
            {summary}
            {fundCards}
            {overnight}
          </>
        ) : (
          <>
            {/* 합계는 왼쪽에 고정하고 재원 카드를 오른쪽에 편다 — 총량을 보면서
                어느 재원이 그 숫자를 만들었는지 짚을 수 있어야 한다. */}
            <View style={styles.topRow}>
              <View style={{ width: sideColumnWidth(sizeClass) }}>
                {summary}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>{fundCards}</View>
            </View>
            {overnight}
          </>
        )}
      </ScrollView>

      {editing && (
        <LeaveGrantModal
          visible
          editing={"grant" in editing ? editing.grant : null}
          initialKey={"newKey" in editing ? editing.newKey : undefined}
          lockedKey={cycleKey}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function FundCard(props: {
  fund: LeaveGrantFund;
  onAdd: () => void;
  onEdit: (grant: LeaveGrantItem) => void;
  onDelete: (grant: LeaveGrantItem) => void;
}) {
  const styles = useStyles();
  const balance = useBalanceColors();
  const { fund } = props;
  const tone = balanceTone(balance, fund.key);

  return (
    <ContentPanel style={styles.fundCard}>
      <View style={styles.fundHeader}>
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.chipText, { color: tone.fg }]}>
            {fund.label}
          </Text>
        </View>
        <Text style={styles.fundTotals} selectable>
          잔여 {fund.remainingAsOfTodayDays}일 / 총 {fund.totalDays}일
        </Text>
      </View>

      {/* 잔여에는 아직 다녀오지 않은 계획이 들어 있다 — 얼마가 잡혀 있는지 밝혀 둔다. */}
      {fund.plannedDays > 0 && (
        <Text style={styles.fundPlanned} selectable>
          이 중 {fund.plannedDays}일은 앞으로 갈 계획으로 잡혀 있어요.
        </Text>
      )}

      {fund.unattributedDays > 0 && (
        <Text style={styles.warning} selectable>
          설명되지 않는 사용 {fund.unattributedDays}일
        </Text>
      )}

      {fund.grants.length === 0 ? (
        <Text style={styles.fundEmpty} selectable>
          적립분이 없는데 {fund.usedDays}일을 썼어요.
        </Text>
      ) : (
        fund.grants.map((grant) => (
          <GrantRow
            key={grant.id}
            grant={grant}
            onEdit={() => props.onEdit(grant)}
            onDelete={() => props.onDelete(grant)}
          />
        ))
      )}

      <Button
        icon="plus"
        title="적립분 추가"
        variant="ghost"
        size="sm"
        onPress={props.onAdd}
      />
    </ContentPanel>
  );
}

function GrantRow(props: {
  grant: LeaveGrantItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const styles = useStyles();
  const { grant } = props;
  const expired = grant.status === "expired";
  const soon =
    grant.status === "active" &&
    grant.daysUntilExpiry !== null &&
    grant.daysUntilExpiry <= EXPIRING_SOON;

  return (
    <View style={[styles.grantRow, expired && styles.grantExpired]}>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <View style={styles.grantTop}>
          <Text style={styles.grantDays} selectable>
            {grant.days}일
          </Text>
          <Text style={styles.grantMeta} selectable>
            {grant.expiresOn
              ? `만기 ${fmtDateShort(grant.expiresOn)}`
              : "만기 없음"}
            {/* 다녀온 몫과 잡아둔 계획을 나눠 적어야 위의 잔여와 셈이 맞는다. */}
            {grant.usedToDateDays > 0
              ? ` · 사용 ${grant.usedToDateDays}일`
              : ""}
            {grant.usedDays > grant.usedToDateDays
              ? ` · 계획 ${grant.usedDays - grant.usedToDateDays}일`
              : ""}
          </Text>
        </View>
        <View style={styles.grantBadges}>
          {expired ? (
            <Badge
              text={
                grant.unusedDays > 0 ? `소멸 ${grant.unusedDays}일` : "만료됨"
              }
              kind="negative"
            />
          ) : grant.status === "future" ? (
            <Badge text={`${fmtDateShort(grant.grantedOn!)}부터`} />
          ) : soon ? (
            <Badge
              text={`D-${grant.daysUntilExpiry} 만료 임박`}
              kind="negative"
            />
          ) : (
            <Badge text="사용 가능" kind="positive" />
          )}
        </View>
        {grant.note ? (
          <Text style={styles.grantNote} selectable>
            {grant.note}
          </Text>
        ) : null}
      </View>
      <ActionMenu
        label="적립분 작업"
        buttonLabel="적립분 관리"
        actions={[
          {
            id: "edit",
            title: "수정",
            systemImage: "pencil",
            onPress: props.onEdit,
          },
          {
            id: "delete",
            title: "삭제",
            systemImage: "trash",
            destructive: true,
            onPress: props.onDelete,
          },
        ]}
      />
    </View>
  );
}

function CycleList(props: {
  cycles: {
    index: number;
    start: string;
    end: string;
    grantDays: number;
    usedDays: number;
    remainingDays: number;
    state: "past" | "current" | "future";
    color: string;
  }[];
  /** 켜면 지난 주기의 남은 몫이 사라지지 않고 누적 잔여로 합쳐진다. */
  carryOver: boolean;
  expanded: boolean;
  onToggle: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  if (props.cycles.length === 0) return null;

  const past = props.cycles.filter((cycle) => cycle.state === "past");
  const rest = props.cycles.filter((cycle) => cycle.state !== "past");
  // 14일 주기로 21개월이면 40행이 넘는다. 기본은 최근 지난 주기만 편다.
  const hidden = Math.max(0, past.length - RECENT_PAST_CYCLES);
  const shown = props.expanded
    ? props.cycles
    : [...past.slice(-RECENT_PAST_CYCLES), ...rest];

  // 이월 중에는 주기별 잔여의 합이 곧 지금 쓸 수 있는 몫이다(cycleRemainingDays 주석).
  // 아직 오지 않은 주기 몫은 "앞으로 받을" 것이라 여기서 뺀다.
  const pooled = props.cycles
    .filter((cycle) => cycle.state !== "future")
    .reduce((total, cycle) => total + cycle.remainingDays, 0);

  return (
    <ContentPanel style={styles.fundCard}>
      <Text style={styles.addTitle} selectable>
        정기외박 주기
      </Text>
      {props.carryOver && (
        <Text style={styles.cycleDates} selectable>
          누적 잔여 {pooled}일
        </Text>
      )}

      {/* 웹의 같은 자리(LeaveGrantsPage)와 마찬가지로 테두리를 가진 작은 버튼이다.
          예전에는 brand 색 글자 한 줄이라 주기 목록의 설명문과 구분되지 않았다. */}
      {hidden > 0 && (
        <Button
          title={
            props.expanded ? "지난 주기 접기" : `지난 주기 ${hidden}개 보기`
          }
          variant="secondary"
          size="sm"
          onPress={props.onToggle}
          style={styles.disclosure}
        />
      )}

      {shown.map((cycle) => (
        <View
          key={cycle.start}
          style={[
            styles.cycleRow,
            cycle.state === "current" && styles.cycleCurrent,
          ]}
        >
          <View
            style={[styles.cycleStripe, { backgroundColor: cycle.color }]}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={[
                styles.cycleTitle,
                cycle.state !== "current" && { color: colors.body },
              ]}
              selectable
            >
              {cycle.index}주기
            </Text>
            <Text style={styles.cycleDates} selectable>
              {fmtRangeTiny(cycle.start, cycle.end)}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end", gap: 2 }}>
            <Text style={styles.cycleCount} selectable>
              {cycle.usedDays}/{cycle.grantDays}일
            </Text>
            {cycle.state === "past" && !props.carryOver ? (
              cycle.remainingDays > 0 ? (
                <Text style={styles.cycleLost} selectable>
                  소멸 {cycle.remainingDays}일
                </Text>
              ) : (
                <Text style={styles.cycleRemaining} selectable>
                  잔여 {cycle.remainingDays}일
                </Text>
              )
            ) : props.carryOver && cycle.remainingDays < 0 ? (
              // 이월분까지 당겨 쓴 주기. 음수를 그대로 보여주면 읽히지 않는다.
              <Text style={styles.cycleRemaining} selectable>
                이월분 {-cycle.remainingDays}일 사용
              </Text>
            ) : (
              <Text style={styles.cycleRemaining} selectable>
                {props.carryOver && cycle.state === "past" ? "이월" : "잔여"}{" "}
                {cycle.remainingDays}일
              </Text>
            )}
          </View>
          {cycle.state === "current" && (
            <Badge text="이번 주기" kind="positive" />
          )}
        </View>
      ))}
    </ContentPanel>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: 80,
  },
  topRow: { flexDirection: "row", gap: spacing.lg, alignItems: "flex-start" },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvasSoft,
  },

  dashboard: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  eyebrow: {
    color: colors.brand,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.7,
  },
  headline: {
    ...type.screenTitle,
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  subline: {
    fontSize: 14,
    color: colors.body,
    fontVariant: ["tabular-nums"],
    paddingBottom: spacing.xs,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  statChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  statChipText: { fontSize: 12, fontWeight: "700" },
  warning: { fontSize: 12, fontWeight: "600", color: colors.negativeDeep },
  rule: { fontSize: 12, color: colors.mute, paddingTop: spacing.xs },

  fundCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  fundHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  fundTotals: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.body,
    fontVariant: ["tabular-nums"],
  },
  fundEmpty: { fontSize: 12, color: colors.mute },
  fundPlanned: { fontSize: 12, color: colors.mute },

  grantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
  },
  grantExpired: { opacity: 0.55 },
  grantTop: { flexDirection: "row", alignItems: "baseline", gap: spacing.sm },
  grantDays: {
    fontSize: 17,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  grantMeta: { fontSize: 12, color: colors.mute, flexShrink: 1 },
  grantBadges: { flexDirection: "row", gap: spacing.xs, paddingTop: 2 },
  grantNote: { fontSize: 12, color: colors.mute, paddingTop: 2 },

  addCard: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  addTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
  },
  chipText: { fontSize: 13, fontWeight: "600" },
  disclosure: { alignSelf: "flex-start" },

  cycleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    borderCurve: "continuous",
  },
  cycleCurrent: { backgroundColor: colors.primaryPale },
  cycleStripe: { width: 3, alignSelf: "stretch", borderRadius: radius.pill },
  cycleTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  cycleDates: { fontSize: 12, color: colors.mute },
  cycleCount: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  cycleRemaining: { fontSize: 11, color: colors.mute },
  cycleLost: { fontSize: 11, fontWeight: "600", color: colors.negativeDeep },
}));
