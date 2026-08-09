/**
 * 한 달치 달력 그리드(네이티브).
 *
 * 사용처: calendar-scroll.tsx.
 * 웹의 `MonthCalendar.tsx`와 같은 규칙으로 그린다 — 내 휴가가 있는 날은 재원 칩,
 * 그 밖의 날은 그룹 출타율 신호. 두 앱이 같은 날 같은 색을 보여야 한다.
 */

import {
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
import type { Calendar } from "@leave/client";
import type { MyLeaveDay } from "@leave/client";
import { makeStyles, radius, spacing, useTheme } from "@/theme";

/** 공유 그룹 월 달력. 절대 인원 대신 상태·비율을 기본 표시한다. */
export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
  compact?: boolean;
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
  // 한 칸에 들어갈 수 있는 최대 높이. calendar-scroll의 CELL_H가 이 값에 맞춰져
  // 있고 달 블록 높이가 거기서 나오므로, 내용이 이보다 커지면 아래 주가 잘린다.
  // 최대치는 공휴일 이름 + 내 재원 칩 + 출타 알약 + 주기 선이 다 있는 날로
  // 6+26+11+14+14+3 에 gap 3×4 와 선 아래 여백 4를 더해 90.
  const cellHeight = compact ? 44 : 92;

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
                      }${blocked ? ", 제한 가능 기간" : ""}`
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
