import {
  BALANCE_LABELS,
  fmtDateK,
  fmtRange,
  fmtRangeTiny,
  getHoliday,
  segmentBalanceKey,
  segmentOnDate,
  type ISODate,
  type RegularOvernightCycle,
} from "@leave/shared";
import { StyleSheet, Text, View } from "react-native";
import type { Calendar } from "@/api/queries";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

export function DayPanel(props: {
  calendar: Calendar;
  date: ISODate;
  onAddLeave: () => void;
  /** 내 사용자 id. 내 휴가를 맨 위로 올려 강조한다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const dayLeaves = calendar.leaves
    .filter((l) => l.startDate <= date && date <= l.endDate)
    .sort((a, b) =>
      a.userId === props.myUserId ? -1 : b.userId === props.myUserId ? 1 : 0,
    );
  const exceeded = stat?.exceeded ?? false;
  const holiday = getHoliday(date);
  // 이 날 더 나갈 수 있는 인원. 초과한 날은 음수가 되므로 0에서 끊는다.
  const remaining = stat ? Math.max(stat.allowed - stat.count, 0) : 0;

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>선택한 날짜</Text>
      <Text style={styles.date}>{fmtDateK(date)}</Text>
      {holiday && <Text style={styles.holiday}>{holiday}</Text>}

      {stat && (
        <View style={styles.statusRow}>
          <Badge
            text={`출타 ${stat.count}명 / 허용 ${stat.allowed}명`}
            kind={exceeded ? "negative" : "positive"}
          />
          <Badge
            text={remaining > 0 ? `잔여 ${remaining}명` : "잔여 없음"}
            kind="neutral"
          />
          {exceeded && (
            <Text style={styles.exceededText}>최대 출타 인원 초과</Text>
          )}
        </View>
      )}

      {props.cycle && (
        <Text style={styles.cycleLine}>
          정기외박 {props.cycle.index}주기{" "}
          {fmtRangeTiny(props.cycle.start, props.cycle.end)} 안에 속한 날이에요.
        </Text>
      )}

      {dayLeaves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>이 날은 아무도 휴가가 아니에요.</Text>
          <Text style={styles.emptyCaption}>가장 먼저 휴가를 잡아보세요.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {dayLeaves.map((l) => {
            // 이제 날짜별 재원을 알 수 있으므로 그날 해당하는 재원만 보여준다.
            const segment = segmentOnDate(l.segments, date);
            const key = segment ? segmentBalanceKey(segment) : null;
            const tone = key ? BALANCE_COLORS[key] : null;
            const mine = l.userId === props.myUserId;
            return (
              <View
                key={l.id}
                style={[styles.leaveRow, mine && styles.myLeaveRow]}
              >
                <Avatar name={l.userName} imageKey={l.userProfileImageKey} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.leaveUserRow}>
                    <Text style={styles.leaveUser}>
                      {l.userRankLabel} {l.userName}
                      {mine ? " (나)" : ""}
                    </Text>
                    {key && tone && (
                      <View
                        style={[styles.typeChip, { backgroundColor: tone.bg }]}
                      >
                        <Text style={[styles.typeChipText, { color: tone.fg }]}>
                          {BALANCE_LABELS[key]}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.leaveMeta}>
                    {l.title} · {fmtRange(l.startDate, l.endDate)}
                  </Text>
                  {l.reason ? (
                    <Text style={styles.leaveReason}>{l.reason}</Text>
                  ) : null}
                </View>
              </View>
            );
          })}
        </View>
      )}

      <Button title="이 날부터 휴가 등록" onPress={props.onAddLeave} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.canvas,
    borderRadius: radius.xl,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: "500",
    letterSpacing: 0,
    color: colors.mute,
  },
  date: { fontSize: 24, fontWeight: "600", color: colors.ink, marginTop: -8 },
  holiday: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.negative,
    marginTop: -8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  exceededText: { fontSize: 12, fontWeight: "600", color: colors.negativeDeep },
  empty: {
    backgroundColor: colors.canvasSoft,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: { fontSize: 14, color: colors.body },
  emptyCaption: { fontSize: 12, color: colors.mute },
  cycleLine: { fontSize: 12, color: colors.body, marginTop: -spacing.sm },
  leaveRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  myLeaveRow: {
    backgroundColor: colors.primaryPale,
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  leaveUserRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  leaveUser: { fontSize: 14, fontWeight: "600", color: colors.ink },
  typeChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  typeChipText: { fontSize: 10, fontWeight: "700" },
  leaveMeta: { fontSize: 12, color: colors.mute, marginTop: 1 },
  leaveReason: { fontSize: 12, color: colors.body, marginTop: 2 },
});
