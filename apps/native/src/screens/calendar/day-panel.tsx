import {
  availabilitySignal,
  BALANCE_LABELS,
  fmtDateK,
  fmtRange,
  fmtRangeTiny,
  getHoliday,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
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
import { ContentPanel } from "@/components/content-panel";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

export function DayPanel(props: {
  calendar: Calendar;
  date: ISODate;
  onAddLeave: () => void;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  // 명단에는 내 일정도 함께 들어 있다. 초안은 서버가 애초에 내려주지 않는다.
  const dayAttendees = calendar.attendees.filter(
    (attendee) => attendee.startDate <= date && date <= attendee.endDate,
  );
  const exceeded = stat?.exceeded ?? false;
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  const holiday = getHoliday(date);
  const blackout = calendar.blackouts.find(
    (b) => b.startDate <= date && date <= b.endDate,
  );

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>선택한 날짜</Text>
      <Text style={styles.date}>{fmtDateK(date)}</Text>
      {holiday && <Text style={styles.holiday}>{holiday}</Text>}

      {stat && (
        <View style={styles.statusRow}>
          <Badge
            text={
              signal?.percent == null
                ? "기준 미설정"
                : `${signal.label} ${signal.percent}%`
            }
            kind={exceeded ? "negative" : "positive"}
          />
          {exceeded && <Text style={styles.exceededText}>참고 기준 초과</Text>}
        </View>
      )}

      {blackout ? (
        <ContentPanel tone="danger" style={styles.blackoutCard}>
          <Text selectable style={styles.blackoutTitle}>
            제한 가능 기간
          </Text>
          <Text selectable style={styles.emptyCaption}>
            {blackout.reason ?? "관리자가 등록한 기간입니다."} 출타율과 무관하게
            지휘관이 휴가를 제한할 수 있어요.
          </Text>
        </ContentPanel>
      ) : null}

      <OfficialDisclaimer />

      {props.cycle && (
        <Text style={styles.cycleLine}>
          정기외박 {props.cycle.index}주기{" "}
          {fmtRangeTiny(props.cycle.start, props.cycle.end)} 안에 속한 날이에요.
        </Text>
      )}

      {dayAttendees.length === 0 ? (
        <ContentPanel tone="grouped" style={styles.empty}>
          <Text style={styles.emptyTitle}>
            이 날 출타 예정인 사람이 없어요.
          </Text>
          <Text style={styles.emptyCaption}>
            내 계획을 먼저 시뮬레이션해보세요.
          </Text>
        </ContentPanel>
      ) : (
        <View style={{ gap: spacing.md }}>
          <Text style={styles.rosterTitle} selectable>
            이 날 출타 {dayAttendees.length}명
          </Text>
          {dayAttendees.map((attendee) => {
            // 날짜별 재원을 알 수 있으므로 그날 해당하는 재원만 보여준다.
            const segment = segmentOnDate(attendee.segments, date);
            const key = segment ? segmentBalanceKey(segment) : null;
            const tone = key ? BALANCE_COLORS[key] : null;
            const isMine = attendee.userId === props.myUserId;
            return (
              <View
                key={attendee.leaveId}
                style={[styles.leaveRow, isMine && styles.myLeaveRow]}
              >
                <Avatar name={attendee.name} size={36} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.leaveUserRow}>
                    <Text style={styles.leaveUser} numberOfLines={1}>
                      {isMine
                        ? "내 계획"
                        : `${attendee.rankLabel} ${attendee.name}`}
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
                    {!isConfirmedLeaveStatus(attendee.status) && (
                      <View style={styles.statusChip}>
                        <Text style={styles.statusChipText}>
                          {LEAVE_STATUS_LABELS[attendee.status]}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.leaveMeta}>
                    {fmtRange(attendee.startDate, attendee.endDate)}
                  </Text>
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
    padding: spacing.xl,
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: { fontSize: 14, color: colors.body },
  emptyCaption: { fontSize: 12, color: colors.mute },
  rosterTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  blackoutCard: { padding: spacing.lg, gap: spacing.xs },
  blackoutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.warningContent,
  },
  cycleLine: { fontSize: 12, color: colors.body, marginTop: -spacing.sm },
  // 명단 행은 내 것이든 아니든 같은 크기여야 한다. 배경색만 달라진다.
  leaveRow: {
    flexDirection: "row",
    gap: spacing.md,
    alignItems: "center",
    borderRadius: radius.lg,
    padding: spacing.sm,
    marginHorizontal: -spacing.sm,
  },
  myLeaveRow: { backgroundColor: colors.primaryPale },
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
  // 확정이 아닌 계획(희망·신청함)만 상태를 덧붙여 확정과 헷갈리지 않게 한다.
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  statusChipText: { fontSize: 10, fontWeight: "600", color: colors.mute },
  leaveMeta: { fontSize: 12, color: colors.mute, marginTop: 1 },
});
