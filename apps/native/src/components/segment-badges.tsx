/**
 * 휴가 한 건이 어떤 재원을 며칠씩 썼는지 보여주는 배지 줄.
 * 사용처: 내 휴가 목록, 휴가 상세, 하루 출타 명단.
 */

import { BALANCE_LABELS, fmtRangeTiny, segmentBalanceKey } from "@leave/shared";
import { StyleSheet, Text, View } from "react-native";
import type { MyLeave } from "@leave/client";
import { BALANCE_COLORS, radius, spacing } from "@/theme";

/** 휴가 한 건이 어떤 재원을 며칠씩 썼는지 보여주는 배지 줄. */
export function SegmentBadges(props: { segments: MyLeave["segments"] }) {
  return (
    <View style={styles.badges}>
      {props.segments.map((segment) => {
        const key = segmentBalanceKey(segment);
        const tone = BALANCE_COLORS[key];
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

const styles = StyleSheet.create({
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
});
