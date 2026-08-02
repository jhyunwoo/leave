import {
  BALANCE_LABELS,
  fmtDateShort,
  fmtRangeTiny,
  type BalanceKey,
} from "@leave/shared";
import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { LeaveGrantFund, LeaveGrantItem } from "@/api/queries";
import { useDeleteLeaveGrant, useLeaveGrants, useMe } from "@/api/queries";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import {
  confirmGrantDelete,
  LeaveGrantModal,
} from "@/components/leave-grant-modal";
import { RegularOvernightSettings } from "@/components/regular-overnight-settings";
import { StackedBar } from "@/components/stacked-bar";
import { BALANCE_COLORS, colors, radius, spacing, type } from "@/theme";

/** 만기가 이 안으로 다가오면 임박으로 본다. */
const EXPIRING_SOON = 30;
/** 접었을 때 보여줄 지난 주기 수. */
const RECENT_PAST_CYCLES = 2;

type Editing = { grant: LeaveGrantItem } | { newKey: BalanceKey } | null;

export function LeaveGrantsScreen() {
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

  const { totals, funds, regularOvernight } = page.data;
  const cycleKey = funds.find((fund) => fund.cycleScoped)?.key ?? null;
  // 적립분이 있거나 이미 쓴 재원만 카드로 편다. 나머지는 아래 칩으로 둔다.
  const active = funds.filter(
    (fund) => !fund.cycleScoped && (fund.grants.length > 0 || fund.usedDays > 0),
  );
  const empty = funds.filter(
    (fund) =>
      !fund.cycleScoped && fund.grants.length === 0 && fund.usedDays === 0,
  );

  return (
    <>
      <ScrollView
        style={styles.root}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
      >
        <View style={styles.dashboard}>
          <Text style={styles.eyebrow} selectable>
            보유 휴가
          </Text>
          <Text style={styles.headline} selectable>
            남은 휴가 {totals.remainingDays}일
          </Text>
          <Text style={styles.subline} selectable>
            사용 {totals.usedDays}일 · 총 {totals.totalDays}일
          </Text>

          <StackedBar
            segments={[
              { value: totals.usedDays, color: colors.surfaceStrong },
              { value: totals.remainingDays, color: colors.primary },
              { value: totals.expiredDays, color: colors.negativeTint },
            ]}
          />

          <View style={styles.chipRow}>
            {totals.expiredDays > 0 && (
              <View style={[styles.statChip, { backgroundColor: colors.negativeTint }]}>
                <Text style={[styles.statChipText, { color: colors.negativeDeep }]}>
                  소멸 {totals.expiredDays}일
                </Text>
              </View>
            )}
            {totals.upcomingDays > 0 && (
              <View style={[styles.statChip, { backgroundColor: colors.surfaceCard }]}>
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

          {/* 배분 규칙이 보이지 않으면 건별 사용 일수를 믿기 어렵다. */}
          <Text style={styles.rule} selectable>
            만기가 빠른 적립분부터 자동으로 차감돼요.
          </Text>
        </View>

        {active.map((fund) => (
          <FundCard
            key={fund.key}
            fund={fund}
            onAdd={() => setEditing({ newKey: fund.key })}
            onEdit={(grant) => setEditing({ grant })}
            onDelete={(grant) =>
              confirmGrantDelete(grant, () => void del.mutateAsync(grant.id))
            }
          />
        ))}

        {empty.length > 0 && (
          <View style={styles.addCard}>
            <Text style={styles.addTitle} selectable>
              다른 재원 추가
            </Text>
            <View style={styles.chips}>
              {empty.map((fund) => {
                const tone = BALANCE_COLORS[fund.key];
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
          </View>
        )}

        {me.data && me.data.user.branch !== "army" && (
          <View style={{ gap: spacing.lg }}>
            <RegularOvernightSettings config={regularOvernight} />
            <CycleList
              cycles={regularOvernight.cycles}
              expanded={showPastCycles}
              onToggle={() => setShowPastCycles((open) => !open)}
            />
          </View>
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
  const { fund } = props;
  const tone = BALANCE_COLORS[fund.key];

  return (
    <View style={styles.fundCard}>
      <View style={styles.fundHeader}>
        <View style={[styles.chip, { backgroundColor: tone.bg }]}>
          <Text style={[styles.chipText, { color: tone.fg }]}>{fund.label}</Text>
        </View>
        <Text style={styles.fundTotals} selectable>
          잔여 {fund.remainingDays}일 / 총 {fund.totalDays}일
        </Text>
      </View>

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
        title="+ 적립분 추가"
        variant="ghost"
        size="sm"
        onPress={props.onAdd}
      />
    </View>
  );
}

function GrantRow(props: {
  grant: LeaveGrantItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
            {grant.expiresOn ? `만기 ${fmtDateShort(grant.expiresOn)}` : "만기 없음"}
            {grant.usedDays > 0 ? ` · 사용 ${grant.usedDays}일` : ""}
          </Text>
        </View>
        <View style={styles.grantBadges}>
          {expired ? (
            <Badge
              text={grant.unusedDays > 0 ? `소멸 ${grant.unusedDays}일` : "만료됨"}
              kind="negative"
            />
          ) : grant.status === "future" ? (
            <Badge text={`${fmtDateShort(grant.grantedOn!)}부터`} />
          ) : soon ? (
            <Badge text={`D-${grant.daysUntilExpiry} 만료 임박`} kind="negative" />
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
      <View style={styles.grantActions}>
        <Button title="수정" variant="secondary" size="sm" onPress={props.onEdit} />
        <Button title="삭제" variant="danger" size="sm" onPress={props.onDelete} />
      </View>
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
  expanded: boolean;
  onToggle: () => void;
}) {
  if (props.cycles.length === 0) return null;

  const past = props.cycles.filter((cycle) => cycle.state === "past");
  const rest = props.cycles.filter((cycle) => cycle.state !== "past");
  // 14일 주기로 21개월이면 40행이 넘는다. 기본은 최근 지난 주기만 편다.
  const hidden = Math.max(0, past.length - RECENT_PAST_CYCLES);
  const shown = props.expanded ? props.cycles : [...past.slice(-RECENT_PAST_CYCLES), ...rest];

  return (
    <View style={styles.fundCard}>
      <Text style={styles.addTitle} selectable>
        정기외박 주기
      </Text>

      {hidden > 0 && (
        <Pressable accessibilityRole="button" onPress={props.onToggle}>
          <Text style={styles.disclosure}>
            {props.expanded ? "지난 주기 접기" : `지난 주기 ${hidden}개 보기`}
          </Text>
        </Pressable>
      )}

      {shown.map((cycle) => (
        <View
          key={cycle.start}
          style={[
            styles.cycleRow,
            cycle.state === "current" && styles.cycleCurrent,
          ]}
        >
          <View style={[styles.cycleStripe, { backgroundColor: cycle.color }]} />
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
            {cycle.grantDays === 0 ? (
              <Text style={styles.cycleWaiting} selectable>
                첫 적립 대기
              </Text>
            ) : (
              <>
                <Text style={styles.cycleCount} selectable>
                  {cycle.usedDays}/{cycle.grantDays}일
                </Text>
                {cycle.state === "past" && cycle.remainingDays > 0 ? (
                  <Text style={styles.cycleLost} selectable>
                    소멸 {cycle.remainingDays}일
                  </Text>
                ) : (
                  <Text style={styles.cycleRemaining} selectable>
                    잔여 {cycle.remainingDays}일
                  </Text>
                )}
              </>
            )}
          </View>
          {cycle.state === "current" && <Badge text="이번 주기" kind="positive" />}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: 80 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.canvasSoft,
  },

  dashboard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    borderCurve: "continuous",
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
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    borderCurve: "continuous",
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
  grantActions: { gap: spacing.xs },

  addCard: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    borderCurve: "continuous",
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
  disclosure: { fontSize: 13, fontWeight: "600", color: colors.brand },

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
  cycleWaiting: { fontSize: 12, color: colors.mute },
});
