/**
 * 한 달치 달력 그리드(네이티브).
 *
 * 사용처: calendar-scroll.tsx.
 * 웹의 `MonthCalendar.tsx`와 같은 규칙으로 그린다 — 내 휴가가 있는 날은 재원 칩,
 * 그 밖의 날은 그룹 출타율 신호. 두 앱이 같은 날 같은 색을 보여야 한다.
 *
 * 칸 높이는 호출자가 정한다(`cellHeight`). 넓은 창에서는 한 달이 화면을 꽉 채우도록
 * 칸이 커지고, 남는 높이만큼 그날 함께 나가는 사람을 칸 안에 미리 보여준다
 * (`showAttendees`) — 달력에서 시트를 열지 않고도 "그날 누가 나가는지"를 훑을 수
 * 있어야 계획이 빨라진다.
 */

import {
  addDays,
  availabilitySignal,
  BALANCE_LABELS,
  buildMonthGrid,
  cycleColor,
  getHoliday,
  todayInSeoul,
  WEEKDAYS,
  type ISODate,
  type RegularOvernightCycle,
} from "@leave/shared";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import type { Calendar, MyLeaveDay } from "@leave/client";
import { makeStyles, radius, spacing, useTheme } from "@/theme";

/** 칸 안에 미리 보여줄 출타자 수. 넘치면 "+N"으로 접는다. */
const PREVIEW_ATTENDEES = 3;

/** 날짜 → 그날 출타하는 사람들의 이니셜과 총원. 칸 미리보기에만 쓴다. */
function buildAttendeePreview(
  attendees: Calendar["attendees"],
): Map<string, { initials: string[]; total: number }> {
  const byDate = new Map<string, { initials: string[]; total: number }>();
  for (const attendee of attendees) {
    const initial = attendee.name.slice(0, 1).toUpperCase();
    // 휴가 한 건은 보통 며칠이라 날짜별로 펼쳐도 양이 크지 않다. 달 밖의 날짜는
    // 그리지 않으므로 여기서 잘라내지 않아도 렌더 비용에 영향이 없다.
    for (
      let date = attendee.startDate;
      date <= attendee.endDate;
      date = addDays(date, 1)
    ) {
      const entry = byDate.get(date);
      if (!entry) {
        byDate.set(date, { initials: [initial], total: 1 });
        continue;
      }
      entry.total += 1;
      if (entry.initials.length < PREVIEW_ATTENDEES) entry.initials.push(initial);
    }
  }
  return byDate;
}

/** 공유 그룹 월 달력. 절대 인원 대신 상태·비율을 기본 표시한다. */
export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  compact?: boolean;
  /** 한 칸의 높이. 스크롤 달력이 창 높이에 맞춰 계산해 넘긴다. */
  cellHeight?: number;
  /** 칸 안에 그날 출타자 이니셜을 미리 보여준다. 높이가 넉넉할 때만 켠다. */
  showAttendees?: boolean;
  /** 스크롤 달력처럼 요일 헤더를 위에서 한 번만 그릴 때 true. */
  hideWeekdays?: boolean;
  /** 날짜 → 내 휴가 재원. 있으면 출타율 대신 재원 칩을 그린다. */
  myLeaveDays?: Map<ISODate, MyLeaveDay>;
  /** 이 달과 겹치는 정기외박 주기들. 각 날짜 아래에 주기별 색 선을 깐다. */
  cycles?: RegularOvernightCycle[];
  /** 오늘이 속한 정기외박 주기. 해당 날짜 칸에 옅은 배경을 깐다. */
  currentCycle?: RegularOvernightCycle | null;
}) {
  const {
    calendar,
    selectedDate,
    onSelectDate,
    compact,
    hideWeekdays,
    myLeaveDays,
    cycles,
    currentCycle,
  } = props;
  const styles = useStyles();
  const { colors, balance } = useTheme();
  const today = todayInSeoul();
  const weeks = useMemo(() => buildMonthGrid(calendar.month), [calendar.month]);
  const statByDate = useMemo(
    () => new Map(calendar.days.map((d) => [d.date, d])),
    [calendar.days],
  );
  const showAttendees = props.showAttendees ?? false;
  // 미리보기를 끈 크기에서는 아예 만들지 않는다 — 휴대폰에서 쓰지 않을 표를
  // 달마다 만들면 스크롤 중에 그만큼 손해다.
  const attendeePreview = useMemo(
    () =>
      showAttendees
        ? buildAttendeePreview(calendar.attendees)
        : new Map<string, { initials: string[]; total: number }>(),
    [showAttendees, calendar.attendees],
  );
  // 한 칸에 들어갈 수 있는 최대 높이. 달 블록 높이가 여기서 나오므로, 내용이
  // 이보다 커지면 아래 주가 잘린다. 좁은 창의 최대치는 공휴일 이름 + 내 재원 칩
  // + 출타 알약 + 주기 선이 다 있는 날로 6+26+11+14+14+3 에 gap 3×4 와 선 아래
  // 여백 4를 더해 90. 넓은 창에서는 호출자가 창 높이에 맞춰 더 크게 잡고,
  // 남는 높이에 출타자 미리보기 한 줄(16+3)이 들어간다.
  const cellHeight = props.cellHeight ?? (compact ? 44 : 92);

  return (
    <View accessibilityLabel={`${calendar.month} 휴가 계획 달력`}>
      {!hideWeekdays && (
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[styles.weekday, i === 0 && { color: colors.negative }]}
            >
              {w}
            </Text>
          ))}
        </View>
      )}
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.weekRow}>
          {week.map((cell) => {
            const stat = cell.inMonth ? statByDate.get(cell.date) : undefined;
            const signal = stat
              ? availabilitySignal(stat.count, stat.allowed)
              : null;
            const exceeded = signal?.key === "exceeded";
            // 블랙아웃은 출타율과 무관하게 제한될 수 있는 날이다.
            const blocked = stat?.blocked ?? false;
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const dayNum = Number(cell.date.slice(8));
            const sunday = new Date(cell.date).getUTCDay() === 0;
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            const mine = cell.inMonth ? myLeaveDays?.get(cell.date) : undefined;
            const inCycle =
              cell.inMonth &&
              currentCycle != null &&
              currentCycle.start <= cell.date &&
              cell.date <= currentCycle.end;
            const tone = mine ? balance[mine.key] : null;
            // 이 날이 속한 정기외박 주기. 칸 아래 얇은 색 선으로 표시한다.
            const cycle = cell.inMonth
              ? cycles?.find((c) => c.start <= cell.date && cell.date <= c.end)
              : undefined;
            const preview =
              cell.inMonth && showAttendees
                ? attendeePreview.get(cell.date)
                : undefined;

            return (
              <Pressable
                key={cell.date}
                disabled={!cell.inMonth}
                accessibilityRole="button"
                accessibilityLabel={
                  cell.inMonth
                    ? `${dayNum}일${holiday ? `, ${holiday}` : ""}${
                        cycle ? `, 정기외박 ${cycle.index}주기` : ""
                      }${
                        mine
                          ? `, 내 ${BALANCE_LABELS[mine.key]} ${
                              mine.isDraft
                                ? "초안"
                                : mine.isConfirmed
                                  ? "확정"
                                  : "희망"
                            }`
                          : ""
                      }, ${
                        signal?.percent == null
                          ? "출타 기준 미설정"
                          : `출타율 ${signal.percent}퍼센트, ${signal.label}`
                      }${preview ? `, 출타 ${preview.total}명` : ""}${
                        blocked ? ", 제한 가능 기간" : ""
                      }`
                    : undefined
                }
                onPress={() => onSelectDate(cell.date)}
                style={({ pressed }) => [
                  styles.cell,
                  { minHeight: cellHeight },
                  inCycle && { backgroundColor: colors.cycleTint },
                  exceeded && { backgroundColor: colors.negativeTint },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}
              >
                {cell.inMonth && (
                  <>
                    <View
                      style={[
                        styles.dayNumWrap,
                        isToday && styles.todayWrap,
                        isSelected && styles.selectedWrap,
                      ]}
                    >
                      <Text
                        style={[
                          styles.dayNum,
                          (sunday || holiday) && { color: colors.negative },
                          exceeded && { color: colors.negativeDeep },
                          (isToday || isSelected) && {
                            color: colors.onPrimary,
                          },
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </View>
                    {!compact && holiday && (
                      <Text
                        style={styles.holiday}
                        numberOfLines={1}
                        ellipsizeMode="clip"
                      >
                        {holiday}
                      </Text>
                    )}
                    {/* 내 휴가가 있는 날은 재원 칩을 먼저 깔고, */}
                    {!compact && mine && tone && (
                      <View
                        style={[
                          styles.myChip,
                          { backgroundColor: tone.bg },
                          // 색만으로 구분하지 않도록 확정은 실선, 희망은 점선 테두리.
                          mine.isConfirmed
                            ? [styles.chipConfirmed, { borderColor: tone.fg }]
                            : [styles.chipTentative, { borderColor: tone.fg }],
                          // 이어지는 날은 모서리를 붙여 한 덩어리로 보이게 한다.
                          !mine.isSegmentStart && styles.chipJoinLeft,
                          !mine.isSegmentEnd && styles.chipJoinRight,
                        ]}
                      >
                        {mine.isSegmentStart && (
                          <Text
                            style={[styles.myChipText, { color: tone.fg }]}
                            numberOfLines={1}
                            ellipsizeMode="clip"
                          >
                            {mine.isDraft ? "초안 " : ""}
                            {BALANCE_LABELS[mine.key]}
                          </Text>
                        )}
                      </View>
                    )}
                    {/* 칸이 넉넉한 창에서만 — 그날 나가는 사람을 이니셜로 미리 본다.
                        시트를 열지 않고도 겹치는 사람을 훑을 수 있게 하는 표시라,
                        숫자(총원)를 함께 적어 색·글자 어느 쪽으로도 읽히게 한다. */}
                    {preview && (
                      <View style={styles.attendeeRow}>
                        {preview.initials.map((initial, index) => (
                          <View key={index} style={styles.attendeeDot}>
                            <Text style={styles.attendeeDotText}>{initial}</Text>
                          </View>
                        ))}
                        {preview.total > preview.initials.length && (
                          <Text style={styles.attendeeMore}>
                            +{preview.total - preview.initials.length}
                          </Text>
                        )}
                      </View>
                    )}
                    {/* 서버의 절대 인원은 셀에서 드러내지 않고 상태·비율만 보여준다. */}
                    {!compact && blocked && (
                      <View style={styles.blockedPill}>
                        <Text style={styles.blockedText}>제한</Text>
                      </View>
                    )}
                    {!compact && signal && (
                      <View
                        style={[
                          styles.countPill,
                          signal.percent === 0 && styles.countPillEmpty,
                          signal.key === "near" && styles.countPillNear,
                          exceeded && {
                            backgroundColor: colors.negativeBg,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.countText,
                            signal.percent === 0 && { color: colors.mute },
                            // 노란 채움 위에 얹히므로 warningContent가 아니라
                            // 전용 대비색을 쓴다(다크에서 노랑 위 노랑이 된다).
                            signal.key === "near" && {
                              color: colors.onWarning,
                            },
                            exceeded && { color: colors.onNegativeBg },
                            isSelected && {
                              color: exceeded
                                ? colors.negativeDeep
                                : colors.inkDeep,
                            },
                          ]}
                        >
                          {signal.percent == null
                            ? signal.label
                            : `${signal.label} ${signal.percent}%`}
                        </Text>
                      </View>
                    )}
                    {/* 주기 표시선 — 같은 주기는 같은 색으로 이어져 한 줄처럼 보인다. */}
                    {cycle && (
                      <View
                        style={[
                          styles.cycleBar,
                          { backgroundColor: cycleColor(cycle.index) },
                          cell.date === cycle.start && styles.cycleBarStart,
                          cell.date === cycle.end && styles.cycleBarEnd,
                        ]}
                      />
                    )}
                  </>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  weekRow: { flexDirection: "row", gap: 2, marginBottom: 2 },
  weekday: {
    flex: 1,
    textAlign: "center",
    fontSize: 12,
    fontWeight: "600",
    color: colors.mute,
    paddingVertical: spacing.sm,
  },
  cell: {
    flex: 1,
    alignItems: "center",
    paddingTop: 6,
    // 최대 구성(공휴일+재원 칩+출타 알약)이 cellHeight 안에 들어가야 해서
    // 아래 요소들은 lineHeight·minHeight를 명시해 높이를 고정해 둔다.
    gap: 3,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: "transparent",
    backgroundColor: "transparent",
  },
  dayNumWrap: {
    minWidth: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  todayWrap: { backgroundColor: colors.primary },
  selectedWrap: { backgroundColor: colors.ink },
  dayNum: { fontSize: 14, fontWeight: "600", color: colors.ink },
  holiday: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    color: colors.negative,
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  countPill: {
    minHeight: 14,
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
  },
  countPillEmpty: { backgroundColor: "transparent" },
  blockedPill: {
    minHeight: 14,
    justifyContent: "center",
    paddingHorizontal: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.warning,
  },
  blockedText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "700",
    // blockedPill이 warning 채움이라 그 위 글자는 onWarning을 쓴다.
    color: colors.onWarning,
  },
  countPillNear: { backgroundColor: colors.warning },
  countText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "600",
    color: colors.inkDeep,
  },
  myChip: {
    alignSelf: "stretch",
    marginHorizontal: 1,
    minHeight: 14,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
  },
  chipConfirmed: { borderWidth: 1, borderStyle: "solid" },
  chipTentative: { borderWidth: 1, borderStyle: "dashed" },
  chipJoinLeft: {
    marginLeft: -2,
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
  },
  chipJoinRight: {
    marginRight: -2,
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },
  myChipText: { fontSize: 10, lineHeight: 12, fontWeight: "700" },
  attendeeRow: {
    height: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  attendeeDot: {
    width: 16,
    height: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  attendeeDotText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: colors.body,
  },
  attendeeMore: { fontSize: 9, lineHeight: 11, fontWeight: "700", color: colors.mute },
  cycleBar: {
    alignSelf: "stretch",
    // 칸 사이 간격(2)만큼 밖으로 빼 같은 주기의 날들이 끊기지 않게 잇는다.
    marginHorizontal: -2,
    marginTop: "auto",
    marginBottom: 4,
    height: 3,
    // 주기 경계만 알아보면 되는 보조 표시라, 날짜·재원 칩보다 뒤로 물린다.
    opacity: 0.35,
  },
  cycleBarStart: {
    marginLeft: 2,
    borderTopLeftRadius: radius.pill,
    borderBottomLeftRadius: radius.pill,
  },
  cycleBarEnd: {
    marginRight: 2,
    borderTopRightRadius: radius.pill,
    borderBottomRightRadius: radius.pill,
  },
}));
