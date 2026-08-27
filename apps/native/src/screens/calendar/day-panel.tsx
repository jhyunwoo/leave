/**
 * 달력에서 고른 하루의 요약 패널(네이티브).
 * 출타율·공휴일·제한 기간을 알리고 그날의 출타 명단(day-roster.tsx)과
 * 내 개인 일정을 보여준다.
 */

import {
  availabilitySignal,
  fmtDateK,
  fmtRangeTiny,
  getHoliday,
  type ISODate,
  type RegularOvernightCycle,
} from "@leave/shared";
import {
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type { Calendar, PersonalEvent, UnitEvent } from "@leave/client";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { makeStyles, radius, spacing } from "@/theme";
import { DayRoster } from "./day-roster";

/**
 * 아래 두 동작 버튼 사이 간격.
 *
 * iOS 버튼은 SwiftUI 호스트라 자기 RN 레이아웃 상자보다 큰 캡슐을 그린다. 상자는
 * 호스트가 스스로 잰 크기(변형에 따라 24~43pt)인데 그려지는 캡슐은 48pt여서,
 * 부모의 gap 16pt이 화면에서는 1pt 남짓으로 보인다 — 두 버튼이 붙어 버린다.
 * iOS에서만 그 차이만큼 더 벌려 다른 항목 사이와 같은 여백으로 보이게 한다.
 */
const ACTION_GAP = Platform.OS === "ios" ? spacing.xxl : spacing.lg;

export function DayPanel(props: {
  calendar: Calendar;
  date: ISODate;
  onAddLeave: () => void;
  onAddPersonalEvent?: () => void;
  /** 부대 관리자에게만 제공되는 부대 일정 추가 동작. */
  onAddUnitEvent?: () => void;
  /** 이 날이 속한 달의 내 개인 일정. 그 중 이 날에 걸친 것만 보여준다. */
  personalEvents?: readonly PersonalEvent[];
  /** 개인 일정 줄을 눌러 그 일정으로 갈 수 있게 한다. */
  onOpenPersonalEvent?: (eventId: string) => void;
  /** 부대 관리자라면 부대 일정 줄을 눌러 수정 화면으로 간다. */
  onOpenUnitEvent?: (eventId: string) => void;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
  /** 내 전역일. 이 날이 전역일이면 한 줄로 알린다. */
  dischargeAt?: ISODate | null;
  /** 명단의 내 계획 행을 눌러 그 휴가로 갈 수 있게 한다. */
  onOpenLeave?: (leaveId: string) => void;
  /** 담는 그릇에 따라 여백만 바꾼다 — 시트는 넉넉하게, 인스펙터는 좁게. */
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const exceeded = stat?.exceeded ?? false;
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  const holiday = getHoliday(date);
  const blackout = calendar.blackouts.find(
    (b) => b.startDate <= date && date <= b.endDate,
  );
  // 하루짜리든 여러 날에 걸친 일정이든 이 날에 걸쳐 있으면 보여준다.
  const dayEvents = (props.personalEvents ?? []).filter(
    (event) => event.startDate <= date && date <= event.endDate,
  );
  const unitDayEvents = (calendar.events ?? []).filter(
    (event) => event.startDate <= date && date <= event.endDate,
  );
  const isUnitHoliday = unitDayEvents.some((event) => event.isHoliday);

  return (
    <View style={[styles.card, props.style]}>
      <Text style={styles.eyebrow}>선택한 날짜</Text>
      <Text style={[styles.date, isUnitHoliday && styles.unitHolidayDate]}>
        {fmtDateK(date)}
      </Text>
      {date === props.dischargeAt && (
        <Text style={styles.discharge}>전역일</Text>
      )}
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

      {props.cycle && (
        <Text style={styles.cycleLine}>
          정기외박 {props.cycle.index}주기{" "}
          {fmtRangeTiny(props.cycle.start, props.cycle.end)} 안에 속한 날이에요.
        </Text>
      )}

      {unitDayEvents.length > 0 && (
        <View style={styles.unitEventList}>
          <Text style={styles.unitEventHeading} selectable>
            부대 일정 {unitDayEvents.length}건
          </Text>
          {unitDayEvents.map((event) => (
            <UnitEventRow
              key={event.id}
              event={event}
              onOpen={props.onOpenUnitEvent}
            />
          ))}
        </View>
      )}

      <DayRoster
        attendees={calendar.attendees}
        date={date}
        myUserId={props.myUserId}
        onOpenLeave={props.onOpenLeave}
      />

      {dayEvents.length > 0 && (
        <View style={styles.personalList}>
          <Text style={styles.personalHeading} selectable>
            내 개인 일정 {dayEvents.length}건
          </Text>
          {dayEvents.map((event) => (
            <PersonalEventRow
              key={event.id}
              event={event}
              onOpen={props.onOpenPersonalEvent}
            />
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <Button title="이 날부터 휴가 등록" onPress={props.onAddLeave} />
        {props.onAddPersonalEvent ? (
          <Button
            title="이 날에 개인 일정 추가"
            variant="secondary"
            onPress={props.onAddPersonalEvent}
          />
        ) : null}
        {props.onAddUnitEvent ? (
          <Button
            title="이 날에 부대 일정 추가"
            variant="secondary"
            onPress={props.onAddUnitEvent}
          />
        ) : null}
      </View>
    </View>
  );
}

function UnitEventRow(props: {
  event: UnitEvent;
  onOpen?: (eventId: string) => void;
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
  const meta = [event.isHoliday ? "휴일" : "평일", span, time]
    .filter(Boolean)
    .join(" · ");
  const open = props.onOpen;
  const Row = open ? Pressable : View;
  return (
    <Row
      {...(open
        ? {
            accessibilityRole: "button" as const,
            accessibilityLabel: `부대 일정 ${event.title} 수정`,
            onPress: () => open(event.id),
          }
        : {})}
      style={[
        styles.unitEventRow,
        event.isHoliday && styles.unitHolidayEventRow,
      ]}
    >
      <Text
        selectable
        style={[
          styles.unitEventTitle,
          event.isHoliday && styles.unitHolidayEventText,
        ]}
      >
        {event.title}
      </Text>
      <Text
        selectable
        style={[
          styles.unitEventMeta,
          event.isHoliday && styles.unitHolidayEventText,
        ]}
      >
        {meta}
      </Text>
      {event.details ? (
        <Text selectable style={styles.unitEventDetails}>
          {event.details}
        </Text>
      ) : null}
    </Row>
  );
}

/**
 * 개인 일정 한 줄. 누르면 그 일정으로 간다(달력 화면이 넘겨줄 때만).
 * 시간이 없는 일정은 하루 종일로 보고 시간 대신 기간만 적는다.
 */
function PersonalEventRow(props: {
  event: PersonalEvent;
  onOpen?: (eventId: string) => void;
}) {
  const styles = useStyles();
  const { event } = props;
  const time = event.startTime
    ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
    : null;
  const span =
    event.startDate === event.endDate
      ? null
      : fmtRangeTiny(event.startDate, event.endDate);
  const meta = [span, time].filter(Boolean).join(" · ");
  const open = props.onOpen;
  const Row = open ? Pressable : View;
  return (
    <Row
      {...(open
        ? {
            accessibilityRole: "button" as const,
            accessibilityLabel: `개인 일정 ${event.title} 자세히 보기`,
            onPress: () => open(event.id),
          }
        : {})}
      style={styles.personalRow}
    >
      <Text style={styles.personalTitle} numberOfLines={2}>
        ◇ {event.title}
      </Text>
      {meta ? <Text style={styles.personalMeta}>{meta}</Text> : null}
    </Row>
  );
}

const useStyles = makeStyles(({ colors }) => ({
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
  discharge: {
    fontSize: 13,
    fontWeight: "700",
    color: colors.brand,
    marginTop: -8,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    flexWrap: "wrap",
  },
  exceededText: { fontSize: 12, fontWeight: "600", color: colors.negativeDeep },
  emptyCaption: { fontSize: 12, color: colors.mute },
  blackoutCard: { padding: spacing.lg, gap: spacing.xs },
  blackoutTitle: {
    fontSize: 14,
    fontWeight: "700",
    // danger 톤 패널 위에 얹히므로 경고(노랑) 계열이 아니라 같은 계열을 쓴다.
    color: colors.negativeDeep,
  },
  cycleLine: { fontSize: 12, color: colors.body, marginTop: -spacing.sm },
  unitHolidayDate: { color: colors.negative },
  unitEventList: { gap: spacing.sm },
  unitEventHeading: { fontSize: 14, fontWeight: "600", color: colors.ink },
  unitEventRow: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: colors.hairline,
    backgroundColor: colors.surfaceCard,
    padding: spacing.md,
    gap: 3,
  },
  unitHolidayEventRow: {
    borderColor: colors.negative,
    backgroundColor: colors.negativeTint,
  },
  unitEventTitle: { fontSize: 14, fontWeight: "700", color: colors.ink },
  unitEventMeta: { fontSize: 12, fontWeight: "600", color: colors.body },
  unitHolidayEventText: { color: colors.negativeDeep },
  unitEventDetails: { fontSize: 12, lineHeight: 18, color: colors.body },
  personalList: { gap: spacing.sm },
  personalHeading: { fontSize: 14, fontWeight: "600", color: colors.ink },
  personalRow: {
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.surfaceCard,
    padding: spacing.md,
    gap: 2,
  },
  personalTitle: { fontSize: 14, fontWeight: "600", color: colors.ink },
  personalMeta: { fontSize: 12, color: colors.mute },
  actions: { gap: ACTION_GAP },
}));
