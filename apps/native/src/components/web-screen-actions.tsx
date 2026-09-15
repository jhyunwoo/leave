/**
 * 화면의 주요 동작 버튼 줄 — 웹(Expo Web) 전용.
 *
 * expo-router의 `Stack.Toolbar`는 iOS/Android에서만 그려진다. 웹에서는 툴바가
 * 통째로 사라져 등록·수정·삭제처럼 툴바에만 두었던 동작에 닿을 방법이 없어진다.
 * 그래서 웹에서만 같은 동작을 본문 맨 위에 버튼 줄로 놓는다. 네이티브에서는
 * 아무것도 그리지 않는다 — 그쪽은 툴바가 이미 같은 일을 한다.
 *
 * 화면은 `Stack.Toolbar`와 이 컴포넌트를 나란히 두고 같은 핸들러를 넘기면 된다.
 */

import { View } from "react-native";
import { makeStyles, spacing } from "@/theme";
import type { ButtonIcon } from "./button-icons";
import { Button } from "./button";

export type WebScreenAction = {
  id: string;
  title: string;
  icon?: ButtonIcon;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  testID?: string;
};

export function WebScreenActions(props: { actions: WebScreenAction[] }) {
  const styles = useStyles();
  if (process.env.EXPO_OS !== "web") return null;

  return (
    <View style={styles.row}>
      {props.actions.map((action) => (
        <Button
          key={action.id}
          icon={action.icon}
          title={action.title}
          onPress={action.onPress}
          variant={action.variant ?? "secondary"}
          size="sm"
          disabled={action.disabled}
          testID={action.testID}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    gap: spacing.sm,
  },
}));
