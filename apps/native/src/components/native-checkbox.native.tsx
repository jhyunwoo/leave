/**
 * 체크박스 — iOS/Android용 시스템 구현(@expo/ui).
 */

import { Checkbox, Host } from "@expo/ui";
import { StyleSheet } from "react-native";
import { useTheme } from "@/theme";

export function NativeCheckbox(props: {
  value: boolean;
  onValueChange: (value: boolean) => void;
  label: string;
  testID?: string;
}) {
  // SwiftUI/Compose 호스트에는 확정된 hex를 넘긴다. 스킴이 바뀌면 이 컴포넌트가
  // 다시 렌더되면서 새 값이 내려간다.
  const { colors, scheme } = useTheme();
  return (
    <Host
      colorScheme={scheme}
      seedColor={colors.primary}
      style={styles.host}
      testID={props.testID}
    >
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
