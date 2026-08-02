import { StyleSheet, View } from "react-native";
import { colors, radius } from "@/theme";

export type BarSegment = { value: number; color: string };

/**
 * 비율을 한 줄로 보여주는 누적 막대. 값이 0인 조각은 그리지 않는다.
 * 복무율을 보여주는 service-progress와 의미가 달라 따로 둔다.
 */
export function StackedBar(props: { segments: BarSegment[] }) {
  const total = props.segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  return (
    <View style={styles.track}>
      {total > 0 &&
        props.segments
          .filter((segment) => segment.value > 0)
          .map((segment, index) => (
            <View
              key={index}
              style={{
                flex: segment.value,
                backgroundColor: segment.color,
              }}
            />
          ))}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 8,
    flexDirection: "row",
    borderRadius: radius.pill,
    overflow: "hidden",
    backgroundColor: colors.surfaceCard,
  },
});
