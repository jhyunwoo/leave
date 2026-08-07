/**
 * 체크박스 — iOS/Android용 시스템 구현(@expo/ui).
 */

import { Checkbox, Host } from "@expo/ui";
import { StyleSheet } from "react-native";
import { colors } from "@/theme";

export function NativeCheckbox(props: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  testID?: string;
}) {
  return (
    <Host seedColor={colors.primary} style={styles.host} testID={props.testID}>
      <Checkbox
        value={props.value}
        onValueChange={props.onValueChange}
        label={props.label}
        testID={props.testID}
      />
    </Host>
  );
}

const styles = StyleSheet.create({
  host: { alignSelf: "stretch", minHeight: 72 },
});
