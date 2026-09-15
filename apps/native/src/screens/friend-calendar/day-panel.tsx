/**
 * 친구 달력에서 고른 하루의 상세(네이티브).
 * 사용처: 좁은 창의 바텀시트와 넓은 창의 인스펙터 — 같은 패널을 여백만 바꿔 쓴다.
 *
 * 부대 달력의 날짜 상세(`screens/calendar/day-panel.tsx`)와 같은 어휘를 쓴다 —
 * 머리말 + 큰 날짜, 사람 행, 종류·상태 칩, 기간 줄. 두 달력이 다른 문법으로 말하면
 * 탭을 옮길 때마다 읽는 법을 다시 배워야 한다.
 *
 * 여백은 이 패널이 들고 있다. 담는 그릇(시트·인스펙터)이 여백을 잡으면 시트에서는
 * 카드가 헤더와 양옆에 붙어 버린다 — 부대 달력이 같은 이유로 같은 선택을 했다.
 */

import {
  fmtDateFullK,
  fmtRange,
  fmtRangeTiny,
  getHoliday,
  isConfirmedLeaveStatus,
  LEAVE_KIND_LABELS,
  LEAVE_STATUS_LABELS,
  todayInSeoul,
  type ISODate,
} from "@leave/shared";
import {
  friendDayLeaves,
  type FriendCalendar,
  type FriendDayLeave,
  type PersonalEvent,
} from "@leave/client";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import {
  friendPersonColor,
  friendPersonOutlineColor,
} from "@/components/friend-calendar-scroll";
import {
  makeStyles,
  radius,
  spacing,
  useAppColorScheme,
  useBalanceColors,
} from "@/theme";

export function FriendDayPanel(props: {
  date: ISODate;
  calendar?: FriendCalendar;
  events: readonly PersonalEvent[];
  onAdd: () => void;
  onEdit: (event: PersonalEvent) => void;
  /** 담는 그릇에 따라 여백만 바꾼다 — 시트는 넉넉하게, 인스펙터는 좁게. */
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { date } = props;
  const leaves = friendDayLeaves(props.calendar, date);
  const personalEvents = props.events.filter(
    (event) => event.startDate <= date && date <= event.endDate,
  );
  const holiday = getHoliday(date);
  const people = new Set(leaves.map((leave) => leave.userId)).size;
  const outings = leaves.filter((leave) => leave.kind === "outing").length;

  return (
    <View style={[styles.panel, props.style]}>
      <View>
        <Text style={styles.eyebrow}>선택한 날짜</Text>
        <Text style={styles.date} selectable>
          {fmtDateFullK(date)}
        </Text>
        <View style={styles.dateTags}>
          {date === todayInSeoul() ? (
            <Text style={styles.today}>오늘</Text>
          ) : null}
          {holiday ? <Text style={styles.holiday}>{holiday}</Text> : null}
        </View>
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>공유 휴가</Text>
          {people > 0 ? (
            <Text style={styles.sectionCount}>
              {people}명{outings > 0 ? ` · 외출 ${outings}` : ""}
            </Text>
          ) : null}
        </View>
        {leaves.length ? (
          leaves.map((leave) => <LeaveRow key={leave.leaveId} leave={leave} />)
        ) : (
          <ContentPanel tone="grouped" style={styles.empty}>
            <Text style={styles.emptyTitle}>이 날 나가는 사람이 없어요.</Text>
            <Text style={styles.emptyCaption}>
              친구가 공유한 휴가와 내 휴가만 보여요.
            </Text>
          </ContentPanel>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>개인 일정</Text>
            <Text style={styles.sectionCaption}>나만 볼 수 있어요</Text>
          </View>
          <Button
            icon="plus"
            title="추가"
            variant="secondary"
            size="sm"
            onPress={props.onAdd}
          />
        </View>
        {personalEvents.length ? (
          personalEvents.map((event) => (
            <PersonalEventRow
              key={event.id}
              event={event}
              onPress={() => props.onEdit(event)}
            />
          ))
        ) : (
          <ContentPanel tone="grouped" style={styles.empty}>
            <Text style={styles.emptyTitle}>이 날의 개인 일정이 없어요.</Text>
          </ContentPanel>
        )}
      </View>
    </View>
  );
}

/**
 * 출타 한 줄 — 누구인지, 무엇으로(휴가·외출), 어떤 상태로, 언제부터 언제까지.
 *
 * 예전에는 이름과 "공유 휴가" 한 줄뿐이라, 정작 알고 싶은 "그래서 언제 나와 있는가"에
 * 답하지 못했다. 달력을 다시 훑어 색 이니셜이 이어진 칸을 눈으로 세야 했다.
 */
function LeaveRow(props: { leave: FriendDayLeave }) {
  const styles = useStyles();
  const balance = useBalanceColors();
  const scheme = useAppColorScheme();
  const { leave } = props;
  const name = leave.isViewer ? "나" : leave.name;
  const color = friendPersonColor(leave.userId);
  const confirmed = isConfirmedLeaveStatus(leave.status);
  const outing = leave.kind === "outing";
  const tone = outing ? balance.outing : null;
  // 이니셜도 격자와 같은 말을 한다 — 외출은 속이 비어 있다.
  const outline = outing
    ? friendPersonOutlineColor(leave.userId, scheme)
    : null;
  const span =
    leave.totalDays === 1
      ? fmtRange(leave.startDate, leave.endDate)
      : `${fmtRange(leave.startDate, leave.endDate)} · ${leave.totalDays}일 중 ${leave.dayIndex}일째`;
  // 하루짜리(외출)는 기간 줄이 이미 그날 하루라고 말한다 — 출발·복귀를 덧붙이지 않는다.
  const mark =
    leave.totalDays === 1
      ? null
      : leave.isFirstDay
        ? "이 날 출발"
        : leave.isLastDay
          ? "이 날 복귀"
          : null;

  return (
    <View
      style={[styles.row, { borderLeftColor: color }]}
      accessibilityLabel={`${name}, ${LEAVE_KIND_LABELS[leave.kind]}, ${LEAVE_STATUS_LABELS[leave.status]}, ${fmtRange(leave.startDate, leave.endDate)}`}
    >
      <View
        style={[
          styles.initial,
          outline
            ? { borderColor: outline, borderWidth: 1.5 }
            : { backgroundColor: color },
        ]}
      >
        <Text style={[styles.initialText, outline ? { color: outline } : null]}>
          {name.slice(0, 1)}
        </Text>
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowTitleLine}>
          <Text style={styles.rowName} numberOfLines={1}>
            {name}
          </Text>
          <View
            style={[
              styles.kindChip,
              tone ? { backgroundColor: tone.bg } : styles.leaveChip,
            ]}
          >
            <Text
              style={[styles.kindChipText, tone ? { color: tone.fg } : null]}
            >
              {LEAVE_KIND_LABELS[leave.kind]}
            </Text>
          </View>
          <View style={[styles.statusChip, confirmed && styles.confirmedChip]}>
            <Text
              style={[
                styles.statusChipText,
                confirmed && styles.confirmedChipText,
              ]}
            >
              {LEAVE_STATUS_LABELS[leave.status]}
            </Text>
          </View>
        </View>
        <Text style={styles.rowMeta}>{span}</Text>
        {mark ? <Text style={styles.rowMark}>{mark}</Text> : null}
      </View>
    </View>
  );
}

/** 개인 일정 한 줄. 누르면 편집으로 간다. 시간이 없으면 하루 종일로 읽는다. */
function PersonalEventRow(props: {
  event: PersonalEvent;
  onPress: () => void;
}) {
  const styles = useStyles();
  const { event } = props;
  const time = event.startTime
    ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
    : "하루 종일";
  const span =
    event.startDate === event.endDate
      ? null
      : fmtRangeTiny(event.startDate, event.endDate);
  const meta = [span, time].filter(Boolean).join(" · ");

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`개인 일정 ${event.title} 수정`}
      style={({ pressed }) => [
        styles.row,
        styles.personalRow,
        pressed && styles.pressed,
      ]}
      onPress={props.onPress}
    >
      <View style={styles.diamond} />
      <View style={styles.rowBody}>
        <Text style={styles.rowName} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.rowMeta}>{meta}</Text>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  panel: { padding: spacing.xl, gap: spacing.xl },
  eyebrow: { fontSize: 12, fontWeight: "500", color: colors.mute },
  date: { fontSize: 24, fontWeight: "600", color: colors.ink },
  dateTags: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  today: { fontSize: 13, fontWeight: "700", color: colors.brand },
  holiday: { fontSize: 13, fontWeight: "600", color: colors.negative },
  section: { gap: spacing.sm },
  sectionHeader: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  sectionHeading: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: spacing.sm,
    flexShrink: 1,
  },
  sectionTitle: { fontSize: 17, fontWeight: "700", color: colors.ink },
  sectionCaption: { fontSize: 12, color: colors.mute },
  sectionCount: { fontSize: 13, fontWeight: "600", color: colors.body },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderLeftWidth: 4,
    borderLeftColor: colors.brand,
    backgroundColor: colors.surfaceCard,
  },
  // 개인 일정은 사람 색이 없다. 색 띠 대신 옅은 테두리로 카드와 구분한다.
  personalRow: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.72 },
  /** 격자 칸·범례와 같은 사람 색을 쓴다 — 상세가 달력의 어느 표시인지 이어 준다. */
  initial: {
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  initialText: { color: "white", fontSize: 12, fontWeight: "900" },
  diamond: {
    width: 12,
    height: 12,
    marginHorizontal: 8,
    borderWidth: 2,
    borderColor: colors.brand,
    transform: [{ rotate: "45deg" }],
  },
  rowBody: { flex: 1, minWidth: 0, gap: 3 },
  rowTitleLine: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    flexWrap: "wrap",
  },
  rowName: { fontSize: 15, fontWeight: "700", color: colors.ink },
  kindChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
  },
  leaveChip: { backgroundColor: colors.primaryPale },
  kindChipText: { fontSize: 10, fontWeight: "700", color: colors.inkDeep },
  // 확정만 채움 없이 brand 테두리로 도드라지게 한다 — 희망·신청함과 반드시 갈려야 한다.
  statusChip: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
  },
  statusChipText: { fontSize: 10, fontWeight: "600", color: colors.mute },
  confirmedChip: { borderColor: colors.brand },
  confirmedChipText: { color: colors.brand },
  rowMeta: { fontSize: 12, color: colors.body },
  rowMark: { fontSize: 12, fontWeight: "700", color: colors.brand },
  empty: { padding: spacing.lg, gap: 4 },
  emptyTitle: { fontSize: 14, color: colors.body },
  emptyCaption: { fontSize: 12, color: colors.mute },
}));
