import { fmtDateK, fmtRange, getHoliday, type ISODate } from "@leave/shared";
import { StyleSheet, Text, View } from "react-native";
import type { Calendar } from "@/api/queries";
import { Avatar } from "@/components/avatar";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { colors, radius, spacing } from "@/theme";

export function DayPanel(props: {
  calendar: Calendar;
  date: ISODate;
  onAddLeave: () => void;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const dayLeaves = calendar.leaves.filter(
    (l) => l.startDate <= date && date <= l.endDate,
  );
  const exceeded = stat?.exceeded ?? false;
  const holiday = getHoliday(date);

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
          {exceeded && (
            <Text style={styles.exceededText}>최대 출타 인원 초과</Text>
          )}
        </View>
      )}

      {dayLeaves.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>이 날은 아무도 휴가가 아니에요.</Text>
          <Text style={styles.emptyCaption}>가장 먼저 휴가를 잡아보세요.</Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }}>
          {dayLeaves.map((l) => (
            <View key={l.id} style={styles.leaveRow}>
              <Avatar name={l.userName} imageKey={l.userProfileImageKey} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.leaveUser}>
                  {l.userRankLabel} {l.userName}
                </Text>
                <Text style={styles.leaveMeta}>
                  {l.title} · {fmtRange(l.startDate, l.endDate)}
                </Text>
                {l.reason ? (
                  <Text style={styles.leaveReason}>{l.reason}</Text>
                ) : null}
              </View>
            </View>
          ))}
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
  statusRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
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
  leaveRow: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  leaveUser: { fontSize: 14, fontWeight: "600", color: colors.ink },
  leaveMeta: { fontSize: 12, color: colors.mute, marginTop: 1 },
  leaveReason: { fontSize: 12, color: colors.body, marginTop: 2 },
});
