/**
 * 휴가 한 건의 본문 — 라우트 화면과 태블릿 인스펙터가 함께 쓴다.
 *
 * 사용처: `screens/leave-detail.tsx`(라우트), `screens/leaves.tsx`(넓은 창의
 * 오른쪽 패널).
 *
 * 라우트 오케스트레이션(파라미터 읽기·없는 휴가 처리·툴바·뒤로가기)과 본문을
 * 나눈 이유는 하나다 — 같은 내용을 두 벌로 유지하면 한쪽만 고쳐지기 때문이다.
 * 여기에는 화면 이동이 없고, 스크롤도 담는 쪽이 정한다.
 */

import {
  availabilitySignal,
  cycleForDisplay,
  fmtDateK,
  fmtDateShort,
  fmtRange,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  monthsSpanning,
  type ISODate,
} from "@leave/shared";
import { type ReactNode, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { MyLeave } from "@leave/client";
import {
  useCalendar,
  useCalendarDays,
  useLeaveBalances,
  useMe,
} from "@leave/client";
import { Badge } from "@/components/badge";
import { ContentPanel } from "@/components/content-panel";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { SegmentBadges } from "@/components/segment-badges";
import { makeStyles, radius, spacing, useColors } from "@/theme";
import { DayRoster } from "./calendar/day-roster";

export function LeaveDetailContent(props: {
  leave: MyLeave;
  /** 알림에서 넘어온 날짜. 없으면 첫 초과일 → 시작일 순으로 고른다. */
  focusDate?: ISODate | null;
  /** 화면마다 다른 상단 동작(웹 버튼, 인스펙터의 수정·삭제). */
  header?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  const me = useMe();
  const balances = useLeaveBalances();
  const { leave } = props;
  // 알림에서 온 날짜를 우선 보여준다. 없으면 아래에서 첫 초과일로 채운다.
  const [pickedDate, setPickedDate] = useState<ISODate | null>(
    props.focusDate ?? null,
  );

  const unitId = me.data?.unit?.id ?? null;
  const months = useMemo(
    () => monthsSpanning(leave.startDate, leave.endDate),
    [leave.startDate, leave.endDate],
  );
  const spanDays = useCalendarDays(unitId, months);

  // 이 휴가 기간 안에서 지금도 초과인 날짜들. 알림 이후 남이 계획을 물리면 사라진다.
  const exceededDates = useMemo(
    () =>
      spanDays.days
        .filter(
          (day) =>
            day.exceeded &&
            leave.startDate <= day.date &&
            day.date <= leave.endDate,
        )
        .map((day) => day.date),
    [spanDays.days, leave.startDate, leave.endDate],
  );

  const selectedDate = pickedDate ?? exceededDates[0] ?? leave.startDate;
  const dayCalendar = useCalendar(unitId, selectedDate.slice(0, 7));

  const stat = dayCalendar.data?.days.find((d) => d.date === selectedDate);
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  const blackout = dayCalendar.data?.blackouts.find(
    (b) => b.startDate <= selectedDate && selectedDate <= b.endDate,
  );
  // 달력과 같은 규칙으로 자른다 — 같은 날에 두 화면이 다른 말을 하면 안 된다.
  const cycle = cycleForDisplay(
    balances.data?.regularOvernight ?? null,
    selectedDate,
    me.data?.user.dischargeAt ?? null,
  );

  return (
    <View style={[styles.root, props.style]}>
      {props.header}

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
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { gap: spacing.lg },
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
  // negativeDeep 채움 위에 얹히는 글자. canvas를 쓰면 스킴에 따라 대비가
  // 뒤집혀(다크에서 밝은 분홍 위 어두운 회색) 읽히지 않는다.
  dateChipTextSelected: { color: colors.onNegativeBg },
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
    // danger 톤 패널 위에 얹히므로 경고(노랑) 계열이 아니라 같은 계열을 쓴다.
    color: colors.negativeDeep,
  },
  cycleLine: { fontSize: 12, color: colors.body },
}));
