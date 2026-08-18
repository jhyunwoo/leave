/**
 * 네이티브 세그먼트 컨트롤 래퍼.
 * 사용처: 휴가 등록 폼의 계획 상태 선택, 목록 화면의 필터 전환.
 * 값 배열과 라벨 표를 분리해, 화면은 내부 값 그대로 다루고 표기만 바꿀 수 있다.
 */

import { SegmentedControl } from "@expo/ui/community/segmented-control";
import { StyleSheet, View } from "react-native";

export function NativeSegmentedControl<T extends string>(props: {
  values: readonly T[];
  labels: Record<T, string>;
  value: T;
  onValueChange: (value: T) => void;
  testID?: string;
}) {
  const selectedIndex = Math.max(0, props.values.indexOf(props.value));
  return (
    <View style={styles.host}>
      <SegmentedControl
        values={props.values.map((value) => props.labels[value])}
        selectedIndex={selectedIndex}
        onChange={({ nativeEvent }) => {
          const next = props.values[nativeEvent.selectedSegmentIndex];
          if (next) props.onValueChange(next);
        }}
        testID={props.testID}
        style={styles.control}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  host: { minHeight: 44, justifyContent: "center" },
  control: { minHeight: 44 },
});
