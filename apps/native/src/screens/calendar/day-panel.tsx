/**
 * 달력에서 고른 하루의 요약 패널(네이티브).
 * 출타율·공휴일·제한 기간을 알리고 그날의 출타 명단(day-roster.tsx)을 보여준다.
 */

import {
  availabilitySignal,
  fmtDateK,
  fmtRangeTiny,
  getHoliday,
  type ISODate,
  type RegularOvernightCycle,
} from "@leave/shared";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { Calendar } from "@leave/client";
import { Badge } from "@/components/badge";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { OfficialDisclaimer } from "@/components/official-disclaimer";
import { makeStyles, spacing } from "@/theme";
import { DayRoster } from "./day-roster";

export function DayPanel(props: {
  calendar: Calendar;
  date: ISODate;
  onAddLeave: () => void;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
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

  return (
    <View style={[styles.card, props.style]}>
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

      <DayRoster
        attendees={calendar.attendees}
        date={date}
        myUserId={props.myUserId}
      />

      <Button title="이 날부터 휴가 등록" onPress={props.onAddLeave} />
    </View>
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
}));
