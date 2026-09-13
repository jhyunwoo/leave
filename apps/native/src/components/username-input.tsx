/**
 * `@`가 앞에 붙은 사용자 이름 입력 한 줄.
 *
 * 사용처: 사용자 이름 설정(`username-field.tsx`), 친구 찾기(`screens/friend-search.tsx`).
 *
 * `@`를 절대 위치로 입력칸 **위에** 겹쳐 두면 안 된다. TextInput은 불투명한
 * 배경을 칠하고 형제 중 나중에 그려지므로 `@`가 그대로 가려진다. 그래서 테두리와
 * 배경은 바깥 칸이 갖고, 그 안에 `@`와 투명한 TextInput을 나란히 놓는다.
 *
 * 그리고 한 줄짜리 TextInput에는 세로 padding을 주지 않는다. iOS는 padding을
 * UITextField의 `textContainerInset`으로 넘기는데, 이 값이 이미 세로 가운데로
 * 잡힌 글자 사각형에 다시 적용돼 글자가 padding만큼 아래로 밀린다. 높이는 바깥
 * 칸이 정하고 글자는 가운데 정렬에 맡긴다.
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
    // 칸 전체가 눌리는 영역이 되도록 높이를 채운다.
    alignSelf: "stretch",
    flex: 1,
    minWidth: 0,
    padding: 0,
    fontSize: 16,
    color: colors.ink,
    // 안드로이드: 칸 높이 안에서 글자를 가운데로, 기본 글꼴 여백은 끈다.
    textAlignVertical: "center",
    includeFontPadding: false,
  },
}));
