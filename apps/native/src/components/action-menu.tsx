/**
 * 동작 메뉴 — 웹(Expo Web)용 구현.
 * 네이티브에서는 `action-menu.native.tsx`(시스템 컨텍스트 메뉴)로 바뀐다.
 *
 * `@expo/ui`의 MenuView는 iOS/Android 전용이라 웹에서는 트리거만 그려지고 항목을
 * 눌러도 아무 일이 일어나지 않는다("actions won't fire on this platform" 경고).
 * 그래서 휴가 수정·삭제처럼 메뉴 뒤에만 있는 동작에 웹에서 닿을 수 없었다.
 * 여기서는 같은 항목을 담은 작은 대화상자를 직접 그려 그 구멍을 메운다.
 */

import { useState } from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { makeStyles, radius, spacing } from "@/theme";

export type ActionMenuAction = {
  id: string;
  title: string;
  /** SF Symbol 이름. 시스템 메뉴에서만 쓰고 웹에서는 그리지 않는다. */
  systemImage?: string;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
};

export function ActionMenu(props: {
  label?: string;
  buttonLabel: string;
  actions: ActionMenuAction[];
  testID?: string;
}) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={props.label ?? "작업 더 보기"}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.55 }]}
        testID={props.testID}
      >
        <Text style={styles.label}>{props.buttonLabel}</Text>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        {/*
          배경은 누르면 닫히기만 하는 곳이라 버튼 역할을 주지 않는다. 역할을 주면
          RNW가 <button>으로 그려 항목 <button>이 그 안에 중첩돼 잘못된 HTML이 된다.
          보조기술로 닫는 길은 아래 "취소" 항목이 맡는다.
        */}
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          {/* 카드 안쪽 빈 곳을 눌렀다고 메뉴가 닫히지는 않게 한다. */}
          <View style={styles.card} onStartShouldSetResponder={() => true}>
            <Text style={styles.cardTitle} selectable>
              {props.label ?? "작업 더 보기"}
            </Text>
            {props.actions.map((action) => (
              <Pressable
                key={action.id}
                accessibilityRole="button"
                disabled={action.disabled}
                onPress={() => {
                  // 먼저 닫아야 이 메뉴가 여는 시트와 겹치지 않는다.
                  setOpen(false);
                  action.onPress();
                }}
                style={({ pressed }) => [
                  styles.item,
                  pressed && !action.disabled && styles.itemPressed,
                ]}
              >
                <Text
                  style={[
                    styles.itemLabel,
                    action.destructive && styles.itemDestructive,
                    action.disabled && styles.itemDisabled,
                  ]}
                >
                  {action.title}
                </Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => setOpen(false)}
              style={({ pressed }) => [
                styles.item,
                pressed && styles.itemPressed,
              ]}
            >
              <Text style={styles.cancelLabel}>취소</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  // 트리거는 네이티브와 같은 모양이어야 목록이 플랫폼마다 달라 보이지 않는다.
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
  backdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: spacing.xl,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  card: {
    width: "100%",
    maxWidth: 320,
    padding: spacing.sm,
    borderRadius: radius.xl,
    borderCurve: "continuous",
    backgroundColor: colors.canvas,
  },
  cardTitle: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    fontSize: 12,
    fontWeight: "600",
    color: colors.mute,
  },
  item: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderCurve: "continuous",
    justifyContent: "center",
  },
  itemPressed: { backgroundColor: colors.surfaceCard },
  itemLabel: { fontSize: 16, fontWeight: "600", color: colors.ink },
  itemDestructive: { color: colors.negativeDeep },
  itemDisabled: { color: colors.mute },
  cancelLabel: { fontSize: 16, fontWeight: "600", color: colors.body },
}));
