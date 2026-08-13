/**
 * 온보딩 선택 카드 — 군종·계급·그룹 선택이 모두 이 한 가지 모양을 쓴다.
 *
 * 사용처: `screens/onboarding/*`.
 *
 * 한 화면에 질문이 하나뿐이라 선택지를 크게 그릴 여유가 생겼다. 예전 온보딩은
 * 좁은 세그먼트 컨트롤이라 군종을 고르는 게 설정을 만지는 느낌이었는데,
 * 카드로 키우면 엠블럼과 복무기간까지 같이 보여줄 수 있다.
 */

import * as Haptics from "expo-haptics";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import type { EmblemShape } from "@leave/shared";
import { makeStyles, motion, radius, spacing, useColors } from "@/theme";

/** date-picker와 같은 규칙 — iOS에서만 선택 햅틱을 준다. */
function selectionFeedback() {
  if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
}

export function ChoiceCard(props: {
  label: string;
  caption?: string;
  selected?: boolean;
  /** 군종 카드에만 있는 상징. 48×48 좌표계 패스. */
  emblem?: readonly EmblemShape[];
  /** 선택지가 아니라 행동일 때(그룹 만들기 등)는 radio가 아니라 button으로 읽힌다. */
  asButton?: boolean;
  wide?: boolean;
  badge?: ReactNode;
  onPress: () => void;
  testID?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const selected = Boolean(props.selected);

  return (
    <Pressable
      accessibilityRole={props.asButton ? "button" : "radio"}
      // radio는 selected가 아니라 checked로 읽힌다. 그리고 RN Web은
      // accessibilityState만으로는 aria-checked를 내보내지 않는다 —
      // native-checkbox와 같은 이유로 두 벌을 다 준다.
      accessibilityState={props.asButton ? undefined : { checked: selected }}
      aria-checked={props.asButton ? undefined : selected}
      accessibilityLabel={
        props.caption ? `${props.label}, ${props.caption}` : props.label
      }
      onPress={() => {
        selectionFeedback();
        props.onPress();
      }}
      testID={props.testID}
      style={({ pressed }) => [
        styles.card,
        props.wide && styles.wide,
        selected && styles.selected,
        pressed && { transform: [{ scale: motion.pressScale }] },
      ]}
    >
      {props.emblem ? (
        <Svg viewBox="0 0 48 48" width={44} height={44}>
          {props.emblem.map((shape, i) => (
            <Path
              key={i}
              d={shape.d}
              fill={
                shape.mode === "fill"
                  ? selected
                    ? colors.brand
                    : colors.mute
                  : "none"
              }
              stroke={
                shape.mode === "stroke"
                  ? selected
                    ? colors.brand
                    : colors.mute
                  : "none"
              }
              strokeWidth={shape.width ?? 0}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={shape.opacity ?? 1}
            />
          ))}
        </Svg>
      ) : null}
      <View style={props.wide ? styles.wideText : styles.centerText}>
        <Text style={styles.label}>{props.label}</Text>
        {props.caption ? (
          <Text style={styles.caption}>{props.caption}</Text>
        ) : null}
      </View>
      {props.badge}
    </Pressable>
  );
}

/** "자동 계산"처럼 카드 안에 붙는 작은 표시. */
export function ChoiceBadge(props: { label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{props.label}</Text>
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  card: {
    flex: 1,
    minHeight: 108,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.lg,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
  },
  wide: {
    flexDirection: "row",
    minHeight: 0,
    alignItems: "flex-start",
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  selected: {
    borderColor: colors.positive,
    backgroundColor: colors.primaryPale,
  },
  centerText: { alignItems: "center", gap: 2 },
  wideText: { flex: 1, gap: 2 },
  label: { fontSize: 16, fontWeight: "700", color: colors.ink },
  caption: { fontSize: 12, color: colors.mute },
  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.primary,
  },
  badgeText: { fontSize: 11, fontWeight: "700", color: colors.onPrimary },
}));
