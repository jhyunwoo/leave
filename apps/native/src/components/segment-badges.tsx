/**
 * 휴가 한 건이 어떤 재원을 며칠씩 썼는지 보여주는 배지 줄.
 * 사용처: 내 휴가 목록, 휴가 상세, 하루 출타 명단.
 */

import { fmtRangeTiny } from "@leave/shared/calendar";
import { BALANCE_LABELS, segmentBalanceKey } from "@leave/shared/leave";
import { Text, View } from "react-native";
import type { MyLeave } from "@leave/client";
import { makeStyles, radius, spacing, useBalanceColors } from "@/theme";

/** 휴가 한 건이 어떤 재원을 며칠씩 썼는지 보여주는 배지 줄. */
export function SegmentBadges(props: { segments: MyLeave["segments"] }) {
  const styles = useStyles();
  const balance = useBalanceColors();
  return (
    <View style={styles.badges}>
      {props.segments.map((segment) => {
        const key = segmentBalanceKey(segment);
        const tone = balance[key];
        return (
          <View
            key={`${key}-${segment.startDate}`}
            style={[styles.badge, { backgroundColor: tone.bg }]}
          >
            <Text style={[styles.badgeText, { color: tone.fg }]} selectable>
              {BALANCE_LABELS[key]}{" "}
              {fmtRangeTiny(segment.startDate, segment.endDate)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
    paddingTop: spacing.sm,
  },
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  badgeText: { fontSize: 11, fontWeight: "600" },
}));
