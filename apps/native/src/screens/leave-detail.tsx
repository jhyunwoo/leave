/**
 * 휴가 상세 화면(네이티브).
 * 구간별 재원과 기간, 그 기간의 그룹 출타 현황을 함께 보여주고 수정·삭제를 제공한다.
 */

import {
  availabilitySignal,
  cycleFor,
  fmtDateK,
  fmtDateShort,
  fmtRange,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  monthsSpanning,
  type ISODate,
} from "@leave/shared";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  useCalendar,
  useCalendarDays,
  useDeleteLeave,
  useLeaveBalances,
  useMe,
  useMyLeaves,
} from "@leave/client";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { LeaveFormModal } from "@/components/leave-form-modal";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { SegmentBadges } from "@/components/segment-badges";
import { colors, layout, radius, spacing } from "@/theme";
import { DayRoster } from "./calendar/day-roster";

/**
 * 내 휴가 한 건의 상세.
 *
 * 알림에서 들어오면 `date`로 어느 초과일 때문에 왔는지가 함께 넘어온다.
 * 알림이 들고 있는 leaveId는 초과를 유발한 "남의" 휴가라 이동에 쓸 수 없다 —
 * 알림 화면이 초과일을 덮는 내 휴가를 먼저 찾아 이 화면으로 넘긴다.
 */
export function LeaveDetailScreen() {
  const { leaveId, date } = useLocalSearchParams<{
    leaveId: string;
    date?: string;
  }>();
  const router = useRouter();
  const me = useMe();
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState(false);
  // 알림에서 온 날짜를 우선 보여준다. 없으면 아래에서 첫 초과일로 채운다.
  const [pickedDate, setPickedDate] = useState<ISODate | null>(date ?? null);

  const leave = myLeaves.data?.leaves.find((l) => l.id === leaveId) ?? null;
  const unitId = me.data?.unit?.id ?? null;

  const months = useMemo(
    () => (leave ? monthsSpanning(leave.startDate, leave.endDate) : []),
    [leave],
  );
  const spanDays = useCalendarDays(unitId, months);

  // 이 휴가 기간 안에서 지금도 초과인 날짜들. 알림 이후 남이 계획을 물리면 사라진다.
  const exceededDates = useMemo(() => {
    if (!leave) return [];
    return spanDays.days
      .filter(
        (day) =>
          day.exceeded &&
          leave.startDate <= day.date &&
          day.date <= leave.endDate,
      )
      .map((day) => day.date);
  }, [spanDays.days, leave]);

  const selectedDate =
    pickedDate ?? exceededDates[0] ?? leave?.startDate ?? null;
  // 휴가를 못 찾으면 볼 날짜도 없다. unitId를 비워 빈 달 조회가 나가지 않게 한다.
  const dayCalendar = useCalendar(
    selectedDate ? unitId : null,
    selectedDate ? selectedDate.slice(0, 7) : "",
  );

  if (myLeaves.isPending) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }

  // 알림을 받은 뒤 계획을 지웠거나 기간을 바꾼 경우.
  if (!leave || !selectedDate) {
    return (
      <View style={[styles.center, { padding: spacing.xl }]}>
        <ContentPanel style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>휴가를 찾을 수 없어요</Text>
          <Text style={styles.emptyBody}>
            이미 삭제했거나 기간을 바꾼 계획일 수 있어요.
          </Text>
          <Button title="돌아가기" onPress={() => router.back()} />
        </ContentPanel>
      </View>
    );
  }

  const stat = dayCalendar.data?.days.find((d) => d.date === selectedDate);
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  const blackout = dayCalendar.data?.blackouts.find(
    (b) => b.startDate <= selectedDate && selectedDate <= b.endDate,
  );
  const cycle = cycleFor(balances.data?.regularOvernight ?? null, selectedDate);

  const confirmDelete = () => {
    Alert.alert("휴가 삭제", `"${leave.title}" 휴가를 삭제할까요?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        // 삭제하면 이 화면이 가리킬 대상이 사라지므로 목록으로 되돌아간다.
        onPress: () => {
          void (async () => {
            try {
              await del.mutateAsync(leave.id);
              router.back();
            } catch {
              Alert.alert("삭제하지 못했어요", "잠시 후 다시 시도해주세요.");
            }
          })();
        },
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
        <ContentPanel style={styles.panel}>
          <Text style={styles.leaveTitle} selectable>
            {leave.title}
          </Text>
          <Text style={styles.leaveDates} selectable>
            {fmtRange(leave.startDate, leave.endDate)}
          </Text>
          {leave.reason ? (
            <Text style={styles.leaveReason} selectable>
              {leave.reason}
            </Text>
          ) : null}
          {!isConfirmedLeaveStatus(leave.status) && (
            <View style={styles.statusChip}>
              <Text style={styles.statusChipText}>
                {LEAVE_STATUS_LABELS[leave.status]}
              </Text>
            </View>
          )}
          <SegmentBadges segments={leave.segments} />
        </ContentPanel>

        <ContentPanel style={styles.panel}>
          <Text style={styles.sectionTitle} selectable>
            최대 출타 인원 초과
          </Text>
          {spanDays.isPending ? (
            <ActivityIndicator color={colors.ink} />
          ) : exceededDates.length === 0 ? (
            <Text style={styles.sectionCaption} selectable>
              지금은 이 휴가 기간에 초과된 날짜가 없어요. 다른 사람이 계획을
              바꾸면 알림을 받은 뒤에도 해소될 수 있어요.
            </Text>
          ) : (
            <>
              <Text style={styles.sectionCaption} selectable>
                날짜를 고르면 그날 함께 나가는 사람을 볼 수 있어요.
              </Text>
              <View style={styles.dateRow}>
                {exceededDates.map((d) => (
                  <Pressable
                    key={d}
                    accessibilityRole="button"
                    accessibilityState={{ selected: d === selectedDate }}
                    accessibilityLabel={`${fmtDateShort(d)} 상세 보기`}
                    onPress={() => setPickedDate(d)}
                    style={[
                      styles.dateChip,
                      d === selectedDate && styles.dateChipSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dateChipText,
                        d === selectedDate && styles.dateChipTextSelected,
                      ]}
                    >
                      {fmtDateShort(d)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </ContentPanel>

        <ContentPanel style={styles.panel}>
          <Text style={styles.eyebrow} selectable>
            선택한 날짜
          </Text>
          <Text style={styles.date} selectable>
            {fmtDateK(selectedDate)}
          </Text>
          {stat && (
            <View style={styles.statusRow}>
              <Badge
                text={
                  signal?.percent == null
                    ? "기준 미설정"
                    : `${signal.label} ${signal.percent}%`
                }
                kind={stat.exceeded ? "negative" : "positive"}
              />
              <Text style={styles.statLine} selectable>
                {stat.count}명 / 기준 {stat.allowed}명
              </Text>
            </View>
          )}
          {blackout ? (
            <ContentPanel tone="danger" style={styles.blackoutCard}>
              <Text selectable style={styles.blackoutTitle}>
                제한 가능 기간
              </Text>
              <Text selectable style={styles.sectionCaption}>
                {blackout.reason ?? "관리자가 등록한 기간입니다."} 출타율과
                무관하게 지휘관이 휴가를 제한할 수 있어요.
              </Text>
            </ContentPanel>
          ) : null}
          {cycle && (
            <Text style={styles.cycleLine} selectable>
              정기외박 {cycle.index}주기 {fmtRangeTiny(cycle.start, cycle.end)}{" "}
              안에 속한 날이에요.
            </Text>
          )}
          <OfficialDisclaimer />
          {dayCalendar.data ? (
            <DayRoster
              attendees={dayCalendar.data.attendees}
              date={selectedDate}
              myUserId={me.data?.user.id}
            />
          ) : (
            <View style={{ padding: spacing.xxl, alignItems: "center" }}>
              <ActivityIndicator color={colors.ink} />
            </View>
          )}
        </ContentPanel>
      </ScrollView>

      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon="pencil" onPress={() => setEditing(true)}>
          수정
        </Stack.Toolbar.Button>
        <Stack.Toolbar.Button
          icon="trash"
          disabled={del.isPending}
          onPress={confirmDelete}
        >
          삭제
        </Stack.Toolbar.Button>
      </Stack.Toolbar>

      {editing && (
        <LeaveFormModal
          visible
          editing={leave}
          onClose={() => setEditing(false)}
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
  center: {
    flex: 1,
    backgroundColor: colors.canvasSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyCard: {
    padding: spacing.xxl,
    gap: spacing.lg,
    maxWidth: 420,
    width: "100%",
  },
  emptyTitle: { fontSize: 24, fontWeight: "900", color: colors.ink },
  emptyBody: { fontSize: 15, lineHeight: 22, color: colors.body },
  panel: { padding: spacing.xl, gap: spacing.md },
  leaveTitle: { fontSize: 22, fontWeight: "700", color: colors.ink },
  leaveDates: { fontSize: 15, color: colors.body, marginTop: -spacing.sm },
  leaveReason: { fontSize: 13, color: colors.mute },
  statusChip: {
    alignSelf: "flex-start",
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  statusChipText: { fontSize: 10, fontWeight: "600", color: colors.mute },
  sectionTitle: { fontSize: 15, fontWeight: "700", color: colors.ink },
  sectionCaption: { fontSize: 12, lineHeight: 18, color: colors.mute },
  dateRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.xs },
  dateChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.negativeTint,
  },
  dateChipSelected: { backgroundColor: colors.negativeDeep },
  dateChipText: { fontSize: 13, fontWeight: "600", color: colors.negativeDeep },
  dateChipTextSelected: { color: colors.canvas },
  eyebrow: { fontSize: 12, fontWeight: "500", color: colors.mute },
  date: { fontSize: 20, fontWeight: "600", color: colors.ink, marginTop: -8 },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  statLine: { fontSize: 12, color: colors.body },
  blackoutCard: { padding: spacing.lg, gap: spacing.xs },
  blackoutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.warningContent,
  },
  cycleLine: { fontSize: 12, color: colors.body },
});
