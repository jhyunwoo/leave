/**
 * 하루의 출타 명단(네이티브).
 * 사용처: 달력의 하루 패널, 휴가 상세 화면.
 * 초안은 서버가 애초에 내려주지 않으므로 여기에 나타나지 않는다.
 */

import {
  BALANCE_LABELS,
  fmtRange,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  segmentBalanceKey,
  segmentOnDate,
  type ISODate,
} from "@leave/shared";
import { StyleSheet, Text, View } from "react-native";
import type { Calendar } from "@leave/client";
import { Avatar } from "@/components/avatar";
import { ContentPanel } from "@/components/content-panel";
import { BALANCE_COLORS, colors, radius, spacing } from "@/theme";

/**
 * 하루의 출타 명단. 날짜 상세 시트와 휴가 상세 화면이 함께 쓴다.
 *
 * 명단에는 내 일정도 함께 들어 있다. 초안은 서버가 애초에 내려주지 않는다.
 */
export function DayRoster(props: {
  attendees: Calendar["attendees"];
  date: ISODate;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
}) {
  const { date } = props;
  const dayAttendees = props.attendees.filter(
    (attendee) => attendee.startDate <= date && date <= attendee.endDate,
  );

  if (dayAttendees.length === 0) {
    return (
      <ContentPanel tone="grouped" style={styles.empty}>
        <Text style={styles.emptyTitle}>이 날 출타 예정인 사람이 없어요.</Text>
        <Text style={styles.emptyCaption}>
          내 계획을 먼저 시뮬레이션해보세요.
        </Text>
      </ContentPanel>
    );
  }

  return (
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
                  <View style={[styles.typeChip, { backgroundColor: tone.bg }]}>
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
  );
}

const styles = StyleSheet.create({
  empty: {
    padding: spacing.xl,
    alignItems: "center",
    gap: 4,
  },
  emptyTitle: { fontSize: 14, color: colors.body },
  emptyCaption: { fontSize: 12, color: colors.mute },
  rosterTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
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
