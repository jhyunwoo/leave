/**
 * 친구의 전역·다음 휴가 D-day 두 칸.
 *
 * 사용처: 친구 탭 목록 카드(`screens/friends.tsx`), 친구 프로필
 * (`screens/user-profile.tsx`). 문구와 비공개·없음의 구분은 `@leave/client`가
 * 정한다 — 웹 친구 화면·프로필과 같은 말을 해야 한다.
 */
import {
  friendDischargeDday,
  friendNextLeaveDday,
  type Friend,
} from "@leave/client";
import { Text, View } from "react-native";
import { makeStyles, radius, spacing } from "@/theme";

export function FriendDdays({
  friend,
  today,
}: {
  friend: Friend;
  today: string;
}) {
  const styles = useStyles();
  const items = [
    ["discharge", friendDischargeDday(friend, today)],
    ["leave", friendNextLeaveDday(friend, today)],
  ] as const;
  return (
    <View style={styles.ddays}>
      {items.map(([key, item]) => (
        <View
          key={key}
          style={styles.dday}
          accessible
          accessibilityLabel={`${friend.name} ${item.spoken}`}
          testID={`friend-dday-${key}`}
        >
          <Text style={styles.ddayLabel}>{item.label}</Text>
          <Text
            style={[styles.ddayValue, item.muted && styles.ddayMuted]}
            numberOfLines={1}
          >
            {item.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  ddays: { flexDirection: "row", gap: spacing.sm },
  dday: {
    flex: 1,
    minWidth: 0,
    gap: 2,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
  },
  ddayLabel: { fontSize: 12, fontWeight: "600", color: colors.mute },
  ddayValue: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.ink,
    fontVariant: ["tabular-nums"],
  },
  ddayMuted: { fontSize: 15, color: colors.mute },
}));
