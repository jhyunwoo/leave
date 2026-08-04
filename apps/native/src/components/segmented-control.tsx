import SegmentedControl from "@expo/ui/community/segmented-control";
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
  host: { minHeight: 36, justifyContent: "center" },
  control: { minHeight: 34 },
});
