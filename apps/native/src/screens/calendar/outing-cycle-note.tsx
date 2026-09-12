/**
 * 고른 날짜의 외출 주기 안내(네이티브).
 *
 * 사용처: 달력 화면의 날짜 상세 — 좁은 창의 시트와 넓은 창의 인스펙터 둘 다.
 *
 * `day-panel.tsx`가 아니라 따로 있는 이유가 있다. DayPanel은 부대 달력 응답을
 * 받아야 그려지는데(출타율·명단), 외출 주기는 부대와 무관하게 내 설정에서만 나온다.
 * 안에 넣으면 부대에 가입하지 않은 사람에게는 이 안내가 통째로 사라진다.
 *
 * 달력 칸의 마커는 주기가 **열리는 날**에만 찍힌다. 여기서는 주기 **안의** 날에도
 * 어느 주기인지와 남은 횟수를 알린다 — 마커가 없는 날에 "이번 달 외출이 몇 번
 * 남았나"를 답할 자리가 여기뿐이다. 웹의 `OutingCycleNote.tsx`와 같은 문구를 쓴다.
 */

import { fmtRangeTiny } from "@leave/shared/calendar";
import type { ISODate } from "@leave/shared/dates";
import {
  balanceLabel,
  OUTING_KINDS,
  type OutingKind,
  type SegmentLike,
} from "@leave/shared/leave";
import {
  outingBalanceKey,
  outingCycleNoteFor,
  outingRemainingDays,
  type OutingConfig,
} from "@leave/shared/outing";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { ContentPanel } from "@/components/content-panel";
import { balanceTone, makeStyles, radius, spacing, useTheme } from "@/theme";

export function OutingCycleNote(props: {
  date: ISODate;
  /** 갈래별 외출 설정. 꺼진 갈래는 주기가 없어 저절로 빠진다. */
  outing: Map<OutingKind, OutingConfig>;
  /** 잔여를 깎는 내 구간 전부. 남은 횟수를 세는 데 쓴다. */
  segments: readonly SegmentLike[];
  dischargeAt?: ISODate | null;
  /** 담는 그릇에 따라 바깥 여백만 바꾼다 — 시트는 스스로, 인스펙터는 열이 잡아준다. */
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const { balance } = useTheme();

  const notes = OUTING_KINDS.map((kind) =>
    outingCycleNoteFor(
      kind,
      props.outing.get(kind),
      props.date,
      props.dischargeAt,
    ),
  ).filter((note) => note !== null);

  if (!notes.length) return null;

  return (
    <ContentPanel style={[styles.card, props.style]}>
      <Text style={styles.heading} selectable>
        외출 주기
      </Text>
      {notes.map((note) => {
        const key = outingBalanceKey(note.kind);
        const tone = balanceTone(balance, key);
        const remaining = outingRemainingDays(
          note.kind,
          note.cycle,
          props.segments,
        );
        return (
          <View key={note.kind} style={styles.row}>
            {/* 달력 마커와 같은 뒤집힌 톤 — 상세에서도 같은 것으로 읽히게 한다. */}
            <View style={[styles.pill, { backgroundColor: tone.fg }]}>
              <Text style={[styles.pillText, { color: tone.bg }]}>
                {balanceLabel(key)}
              </Text>
            </View>
            <Text style={styles.line} selectable>
              {note.isStart
                ? `이 날 ${note.cycle.index}주기가 시작돼요 · ${note.cycle.grantDays}회 적립`
                : `${note.cycle.index}주기 ${fmtRangeTiny(note.cycle.start, note.cycle.end)} 안에 속한 날이에요`}
              {` · 잔여 ${Math.max(remaining, 0)}회`}
            </Text>
          </View>
        );
      })}
    </ContentPanel>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: { padding: spacing.md, gap: spacing.xs },
  heading: { color: colors.ink, fontSize: 13, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  pill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 10, fontWeight: "700" },
  line: { flex: 1, color: colors.body, fontSize: 12, lineHeight: 17 },
}));
