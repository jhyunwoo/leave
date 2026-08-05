import MenuView, { type MenuAction } from "@expo/ui/community/menu";
import { Pressable, StyleSheet, Text } from "react-native";
import { colors, radius } from "@/theme";

export function ActionMenu(props: {
  label?: string;
  buttonLabel: string;
  actions: Array<{
    id: string;
    title: string;
    systemImage?: string;
    destructive?: boolean;
    disabled?: boolean;
    onPress: () => void;
  }>;
  testID?: string;
}) {
  const actions: MenuAction[] = props.actions.map((action) => ({
    id: action.id,
    title: action.title,
    image: action.systemImage as MenuAction["image"],
    attributes: {
      destructive: action.destructive,
      disabled: action.disabled,
    },
  }));

  return (
    <MenuView
      actions={actions}
      testID={props.testID}
      onPressAction={({ nativeEvent }) =>
        props.actions
          .find((action) => action.id === nativeEvent.event)
          ?.onPress()
      }
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label ?? "작업 더 보기"}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.55 }]}
      >
        <Text style={styles.label}>{props.buttonLabel}</Text>
      </Pressable>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  trigger: {
    minWidth: 44,
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceCard,
  },
  label: {
    color: colors.ink,
    fontSize: 13,
    fontWeight: "600",
  },
});
