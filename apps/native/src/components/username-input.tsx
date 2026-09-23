/**
 * `@`가 앞에 붙은 사용자 이름 입력 한 줄.
 *
 * 사용처: 사용자 이름 설정(`username-field.tsx`), 친구 찾기(`screens/friend-search.tsx`).
 *
 * `@`를 절대 위치로 입력칸 **위에** 겹쳐 두면 안 된다. TextInput은 불투명한
 * 배경을 칠하고 형제 중 나중에 그려지므로 `@`가 그대로 가려진다. 그래서 테두리와
 * 배경은 바깥 칸이 갖고, 그 안에 `@`와 투명한 TextInput을 나란히 놓는다.
 *
 * 그리고 TextInput을 칸 높이(48pt)만큼 키우지 않는다. iOS UITextField는 그 안에서
 * 글자를 가운데보다 한참 아래에 그린다. TextInput은 글자 줄 높이만 차지하고, 바깥
 * 칸의 `alignItems: "center"`가 세로 가운데에 놓는다(`field.tsx`의 `Input`과 같은 방식).
 */

import { useRef } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
} from "react-native";
import { makeStyles, radius, spacing, useColors } from "@/theme";

export function UsernameInput(props: TextInputProps) {
  const styles = useStyles();
  const colors = useColors();
  const input = useRef<TextInput>(null);
  return (
    // 글자가 없는 왼쪽 여백이나 `@`를 눌러도 칸이 열려야 한다 — 예전에는 칸
    // 전체가 TextInput이라 어디를 눌러도 열렸다.
    <Pressable
      accessible={false}
      style={styles.row}
      onPress={() => input.current?.focus()}
    >
      <Text style={styles.at}>@</Text>
      <TextInput
        ref={input}
        placeholderTextColor={colors.mute}
        selectionColor={colors.brand}
        cursorColor={colors.brand}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        {...props}
        style={[styles.input, props.style]}
      />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    // 고정 높이가 아니라 하한이다 — 큰 글씨 설정에서 글자가 잘리지 않게.
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderCurve: "continuous",
  },
  at: { fontSize: 16, fontWeight: "700", color: colors.mute },
  input: {
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 16,
    color: colors.ink,
    // 안드로이드: 기본 글꼴 여백을 꺼서 글자 줄 높이만 차지하게 한다.
    includeFontPadding: false,
  },
}));
