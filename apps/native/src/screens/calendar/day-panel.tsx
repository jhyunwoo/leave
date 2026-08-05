import {
  availabilitySignal,
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
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

export function DayPanel(props: {
  calendar: Calendar;
  date: ISODate;
  onAddLeave: () => void;
  /** 이전 응답과의 호출 호환용. 서버는 이제 내 일정 상세만 내려준다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const dayLeaves = calendar.leaves.filter(
    (leave) => leave.startDate <= date && date <= leave.endDate,
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
            {blackout.reason ??
              "관리자가 등록한 기간입니다."}{" "}
            출타율과 무관하게 지휘관이 휴가를 제한할 수 있어요.
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

      {dayLeaves.length === 0 ? (
        <ContentPanel tone="grouped" style={styles.empty}>
          <Text style={styles.emptyTitle}>공유된 계획이 아직 없어요.</Text>
          <Text style={styles.emptyCaption}>
            내 계획을 먼저 시뮬레이션해보세요.
          </Text>
        </ContentPanel>
      ) : (
        <View style={{ gap: spacing.md }}>
          <ContentPanel tone="grouped" style={styles.anonymousSummary}>
            <Text style={styles.anonymousTitle}>
              다른 참여자는 집계로만 표시
            </Text>
            <Text style={styles.emptyCaption}>
              사회적 압력을 줄이기 위해 이름·계급·일정 상세·사유는 내려받지
              않아요.
            </Text>
          </ContentPanel>
          {dayLeaves.map((l) => {
            // 이제 날짜별 재원을 알 수 있으므로 그날 해당하는 재원만 보여준다.
            const segment = segmentOnDate(l.segments, date);
            const key = segment ? segmentBalanceKey(segment) : null;
            const tone = key ? BALANCE_COLORS[key] : null;
            return (
              <View key={l.id} style={[styles.leaveRow, styles.myLeaveRow]}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.leaveUserRow}>
                    <Text style={styles.leaveUser}>내 계획</Text>
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
                    {fmtRange(l.startDate, l.endDate)}
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
  anonymousSummary: { padding: spacing.lg, gap: spacing.xs },
  blackoutCard: { padding: spacing.lg, gap: spacing.xs },
  blackoutTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.warningContent,
  },
  anonymousTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
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
});
