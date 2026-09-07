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

import { availabilitySignal } from "@leave/shared/availability";
import { buildMonthGrid, isWeekend, WEEKDAYS } from "@leave/shared/calendar";
import { addDays, todayInSeoul, type ISODate } from "@leave/shared/dates";
import { getHoliday } from "@leave/shared/holidays";
import { BALANCE_LABELS } from "@leave/shared/leave";
import {
  cycleColor,
  type RegularOvernightCycle,
} from "@leave/shared/regular-overnight";
import { useAtomValue } from "jotai";
import { useMemo } from "react";
import { Pressable, Text, View } from "react-native";
import {
  GestureDetector,
  type NativeGesture,
} from "react-native-gesture-handler";
import type { Calendar, MyLeaveDay, PersonalEvent } from "@leave/client";
import {
  isDragPressSuppressed,
  noteCalendarPressStart,
  useLeaveChipDrag,
} from "@/components/calendar-drag/use-leave-chip-drag";
import {
  calendarDragPreviewAtom,
  type LeaveDragDay,
} from "@/state/calendar-drag";
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
      if (entry.initials.length < PREVIEW_ATTENDEES)
        entry.initials.push(initial);
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
  /** 내 전역일. 그날 칸에 배지를 달고, 다음 날부터는 주기 표시를 멈춘다. */
  dischargeAt?: ISODate | null;
  personalEvents?: PersonalEvent[];
  /**
   * 달력 목록의 스크롤 제스처. 이게 있어야 내 휴가 칩을 길게 눌러 다른 날짜로
   * 끌 수 있다 — 끄는 동안 목록이 따라 움직이지 않도록 막을 대상이 필요하다.
   */
  dragScrollGesture?: NativeGesture;
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
    dischargeAt,
    personalEvents,
  } = props;
  const styles = useStyles();
  const { colors } = useTheme();
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
  // 한 칸의 높이. 달 블록 높이가 여기서 나오므로 칸은 이 높이에 **고정**이고,
  // 넘치는 내용은 잘린다(styles.cell의 overflow). 예산을 넘겨 칸이 자라면 그 주
  // 아래의 모든 주가 밀려 블록 높이·스냅 위치와 어긋나고, 휴가를 끌 때 손가락
  // 아래 칸을 잘못 짚게 된다.
  //
  // 좁은 창의 최대치는 공휴일 이름 + 내 재원 칩 + 출타 알약 + 주기 선이 다 있는
  // 날로 6+26+11+14+14+3 에 gap 3×4 와 선 아래 여백 4를 더해 90. 여기에 개인 일정
  // 알약이나 제한 알약(각 14+gap 3)까지 겹치는 드문 날은 아래쪽 알약이 잘린다 —
  // 그 정보는 날짜 상세에 그대로 있으므로, 달 전체가 밀리는 쪽보다 낫다.
  // 넓은 창에서는 호출자가 창 높이에 맞춰 더 크게 잡고, 남는 높이에 출타자
  // 미리보기 한 줄(16+3)이 들어간다.
  const cellHeight = props.cellHeight ?? (compact ? 44 : 92);
  // 지금 끌고 있는 휴가의 덧그림. 드래그가 없으면 null이라 아무 비용도 없다.
  const dragPreview = useAtomValue(calendarDragPreviewAtom);

  return (
    <View accessibilityLabel={`${calendar.month} 휴가 계획 달력`}>
      {!hideWeekdays && (
        <View style={styles.weekRow}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[
                styles.weekday,
                (i === 0 || i === 6) && { color: colors.negative },
              ]}
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
            const weekend = isWeekend(cell.date);
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            const unitEvents = cell.inMonth
              ? (calendar.events ?? []).filter(
                  (event) =>
                    event.startDate <= cell.date && cell.date <= event.endDate,
                )
              : [];
            const hasUnitHoliday = unitEvents.some((event) => event.isHoliday);
            const eventLabel = unitEvents.length
              ? `${unitEvents[0]!.title}${unitEvents.length > 1 ? ` +${unitEvents.length - 1}` : ""}`
              : null;
            const calendarLabel = [holiday, eventLabel]
              .filter(Boolean)
              .join(" · ");
            const mine = cell.inMonth ? myLeaveDays?.get(cell.date) : undefined;
            const dragDay = cell.inMonth
              ? dragPreview?.get(cell.date)
              : undefined;
            const personalCount = cell.inMonth
              ? (personalEvents?.filter(
                  (event) =>
                    event.startDate <= cell.date && cell.date <= event.endDate,
                ).length ?? 0)
              : 0;
            const isDischarge =
              cell.inMonth && dischargeAt != null && cell.date === dischargeAt;
            // 전역한 뒤의 주기는 받을 일도 쓸 일도 없어 아예 그리지 않는다.
            const pastDischarge =
              dischargeAt != null && cell.date > dischargeAt;
            const inCycle =
              cell.inMonth &&
              !pastDischarge &&
              currentCycle != null &&
              currentCycle.start <= cell.date &&
              cell.date <= currentCycle.end;
            // 이 날이 속한 정기외박 주기. 칸 아래 얇은 색 선으로 표시한다.
            const cycle =
              cell.inMonth && !pastDischarge
                ? cycles?.find(
                    (c) => c.start <= cell.date && cell.date <= c.end,
                  )
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
                    ? `${dayNum}일${isDischarge ? ", 전역일" : ""}${holiday ? `, ${holiday}` : ""}${
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
                      }${preview ? `, 출타 ${preview.total}명` : ""}${unitEvents.length ? `, 부대 일정 ${unitEvents.map((event) => event.title).join(", ")}` : ""}${personalCount ? `, 개인 일정 ${personalCount}개` : ""}${
                        blocked ? ", 제한 가능 기간" : ""
                      }`
                    : undefined
                }
                onPressIn={noteCalendarPressStart}
                onPress={() => {
                  // 휴가를 옮기고 손을 뗀 순간의 탭은 드래그의 잔상이다.
                  if (isDragPressSuppressed()) return;
                  onSelectDate(cell.date);
                }}
                style={({ pressed }) => [
                  styles.cell,
                  { height: cellHeight },
                  inCycle && { backgroundColor: colors.cycleTint },
                  exceeded && { backgroundColor: colors.negativeTint },
                  // 전역일은 복무에서 한 번뿐이라 주기·초과 배경을 이기고 칸 전체를
                  // 가져간다. cell이 이미 투명 1px 테두리를 갖고 있어 높이는 그대로다.
                  isDischarge && {
                    backgroundColor: colors.primaryPale,
                    borderColor: colors.brand,
                  },
                  // 집어 든 칸은 줄이지 않는다. 길게 누르는 250ms 동안 쪼그라들었다가
                  // 드래그가 시작되며 되돌아오는 깜빡임이 생긴다.
                  pressed &&
                    dragDay?.role !== "origin" && {
                      transform: [{ scale: 0.97 }],
                    },
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
                          (weekend || holiday || hasUnitHoliday) && {
                            color: colors.negative,
                          },
                          exceeded && { color: colors.negativeDeep },
                          (isToday || isSelected) && {
                            color: colors.onPrimary,
                          },
                        ]}
                      >
                        {dayNum}
                      </Text>
                    </View>
                    {/* 전역 배지와 공휴일 이름은 한 자리를 나눠 쓴다 — 아래 칸 높이
                        예산이 꽉 차 있어 줄을 늘리면 그 달 마지막 주가 잘린다. 겹치는
                        날에는 전역이 이기고, 공휴일 이름은 날짜 상세에서 그대로 보인다. */}
                    {!compact && isDischarge ? (
                      <View style={styles.dischargeBadge}>
                        <Text style={styles.dischargeText} numberOfLines={1}>
                          전역
                        </Text>
                      </View>
                    ) : !compact && calendarLabel ? (
                      <Text
                        style={[
                          styles.calendarLabel,
                          (holiday || hasUnitHoliday) && styles.holidayLabel,
                        ]}
                        numberOfLines={1}
                        ellipsizeMode="tail"
                      >
                        {calendarLabel}
                      </Text>
                    ) : null}
                    {/* 내 휴가가 있는 날은 재원 칩을 먼저 깔고, */}
                    {!compact && (mine || dragDay) && (
                      <MyLeaveChip
                        date={cell.date}
                        mine={mine}
                        preview={dragDay}
                        scrollGesture={props.dragScrollGesture ?? null}
                        onTap={() => onSelectDate(cell.date)}
                      />
                    )}
                    {!compact && personalCount > 0 && (
                      <View style={styles.personalPill}>
                        <Text style={styles.personalText}>
                          ◇ 개인{personalCount > 1 ? ` ${personalCount}` : ""}
                        </Text>
                      </View>
                    )}
                    {/* 칸이 넉넉한 창에서만 — 그날 나가는 사람을 이니셜로 미리 본다.
                        시트를 열지 않고도 겹치는 사람을 훑을 수 있게 하는 표시라,
                        숫자(총원)를 함께 적어 색·글자 어느 쪽으로도 읽히게 한다. */}
                    {preview && (
                      <View style={styles.attendeeRow}>
                        {preview.initials.map((initial, index) => (
                          <View key={index} style={styles.attendeeDot}>
                            <Text style={styles.attendeeDotText}>
                              {initial}
                            </Text>
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
                          // 전역일에서 잘린 주기도 뚝 끊기지 않고 둥글게 닫는다.
                          (cell.date === cycle.end || isDischarge) &&
                            styles.cycleBarEnd,
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

/**
 * 내 휴가 한 칸.
 *
 * 저장된 칸(`mine`)과 드래그 미리보기(`preview`) 어느 쪽이 와도 같은 규칙으로
 * 그린다 — 옮기는 중에도 재원 색과 이어붙임이 그대로 보여야 "이 휴가가 저기로
 * 간다"가 읽힌다.
 *
 * 여기서는 길게 누르기로 선택하고, 이후 이동은 달력 루트가 맡는다.
 * 원래 날짜에 `role: "origin"` 항목을 남겨 출발 위치를 흐리게 보여준다.
 */
function MyLeaveChip(props: {
  date: ISODate;
  /** 저장된 내 휴가. 옮겨 갈 자리를 덧그리는 칸에는 없다. */
  mine: MyLeaveDay | undefined;
  preview: LeaveDragDay | undefined;
  scrollGesture: NativeGesture | null;
  /** 칩을 그냥 눌렀을 때 — 칸을 눌렀을 때와 같이 그날을 고른다. */
  onTap: () => void;
}) {
  const styles = useStyles();
  const { colors, balance } = useTheme();
  const gesture = useLeaveChipDrag({
    leaveId: props.mine?.leaveId ?? null,
    status: props.mine?.status ?? null,
    date: props.date,
    scrollGesture: props.scrollGesture,
  });

  // 미리보기가 있으면 그쪽이 이긴다. 원래 자리와 옮길 자리가 겹치는 날에도
  // 마찬가지 — 사용자가 보고 싶은 건 옮긴 뒤의 모습이다.
  const day: MyLeaveDay | LeaveDragDay | undefined =
    props.preview ?? props.mine;
  if (!day) return null;

  const role = props.preview?.role ?? null;
  const conflict = props.preview?.verdict === "conflict";
  const merging = props.preview?.verdict === "merge";
  const saving = props.preview?.phase === "saving";
  const tone = balance[day.key];
  // 겹쳐서 놓을 수 없는 자리는 재원 색을 버리고 경고색으로 그린다.
  const fg = conflict ? colors.negativeDeep : tone.fg;
  const bg = conflict ? colors.negativeBg : tone.bg;

  return (
    <GestureDetector gesture={gesture}>
      {/* 칩이 제 눌림을 직접 받는다. GestureDetector가 붙은 뒤로는 이 뷰의 누름이
          감싸고 있는 날짜 칸의 Pressable에 온전히 전달되지 않아서, 이게 없으면
          휴가가 그려진 자리만 눌러도 아무 일이 없는 죽은 영역이 된다.
          accessibilityRole은 주지 않는다 — 칸이 이미 버튼이라 웹에서 버튼이
          중첩되고, 읽어 줄 내용도 칸의 라벨에 이미 다 들어 있다. */}
      <Pressable
        // 접근성 트리에는 칸 버튼 하나만 남긴다. 칸의 라벨이 이미 "내 연가 희망"까지
        // 읽어 주고, 눌렀을 때 하는 일도 칸과 같다 — 따로 초점을 받을 이유가 없다.
        accessible={false}
        onPressIn={noteCalendarPressStart}
        onPress={() => {
          // 휴가를 옮기고 손을 뗀 순간의 눌림은 드래그의 잔상이다.
          if (isDragPressSuppressed()) return;
          props.onTap();
        }}
        style={[
          styles.myChip,
          { backgroundColor: bg },
          // 색만으로 구분하지 않도록 확정은 실선, 희망은 점선 테두리.
          day.isConfirmed
            ? [styles.chipConfirmed, { borderColor: fg }]
            : [styles.chipTentative, { borderColor: fg }],
          // 이어지는 날은 모서리를 붙여 한 덩어리로 보이게 한다.
          !day.isSegmentStart && styles.chipJoinLeft,
          !day.isSegmentEnd && styles.chipJoinRight,
          role === "origin" && styles.chipLifted,
          role === "target" && styles.chipTarget,
          merging && { borderColor: colors.brand },
          saving && styles.chipSaving,
        ]}
      >
        {day.isSegmentStart && (
          <Text
            style={[styles.myChipText, { color: fg }]}
            numberOfLines={1}
            ellipsizeMode="clip"
          >
            {day.isDraft ? "초안 " : ""}
            {BALANCE_LABELS[day.key]}
          </Text>
        )}
      </Pressable>
    </GestureDetector>
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
    // 그래도 넘치는 드문 날(개인 일정·제한 알약까지 겹칠 때)은 여기서 자른다 —
    // 칸이 자라면 그 주 아래가 통째로 밀려 달 블록 높이와 어긋난다.
    overflow: "hidden",
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
  calendarLabel: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "600",
    color: colors.brand,
    maxWidth: "100%",
    paddingHorizontal: 2,
  },
  holidayLabel: { color: colors.negative },
  // 공휴일 이름과 같은 자리를 쓰지만 전역일은 채운 배지로 세운다. 세로 패딩을 두지
  // 않아 높이가 공휴일 줄(11)과 같고, 그래서 칸 높이 예산이 그대로 유지된다.
  // 채움은 primary가 아니라 brand다 — 칸 배경이 이미 primaryPale이라 primary 배지를
  // 얹으면 초록 위 초록(대비 1.3:1)이 되어 배지 모양이 사라진다.
  dischargeBadge: {
    paddingHorizontal: 5,
    borderRadius: radius.sm,
    backgroundColor: colors.brand,
  },
  dischargeText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
    color: colors.onBrand,
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
  /** 집어 든 자리. 진짜 자리는 옮겨 간 쪽이므로 원래 자리는 뒤로 물린다. */
  chipLifted: { opacity: 0.3, borderStyle: "dashed" },
  /** 놓이게 될 자리. 테두리를 굵혀 이미 저장된 칩과 구분한다. */
  chipTarget: { borderWidth: 2 },
  /** 서버에 보내는 중. 아직 확정이 아니라는 뜻으로 살짝 물린다. */
  chipSaving: { opacity: 0.6 },
  personalPill: {
    minHeight: 14,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.brand,
    justifyContent: "center",
  },
  personalText: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: colors.brand,
  },
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
  attendeeMore: {
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "700",
    color: colors.mute,
  },
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
