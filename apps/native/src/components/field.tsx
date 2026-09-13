/**
 * 라벨 + 입력 + 힌트/오류를 묶는 폼 필드.
 * 사용처: 로그인·회원가입·그룹 관리 등 네이티브의 모든 폼.
 */

import type { ReactNode } from "react";
import {
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { makeStyles, radius, spacing, useColors } from "@/theme";

export function Field(props: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      {props.children}
      {props.error ? (
        <Text style={styles.error}>{props.error}</Text>
      ) : props.hint ? (
        <Text style={styles.hint}>{props.hint}</Text>
      ) : null}
    </View>
  );
}

export function Input(props: TextInputProps) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <TextInput
      placeholderTextColor={colors.mute}
      selectionColor={colors.brand}
      cursorColor={colors.brand}
      {...props}
      style={[
        styles.input,
        props.multiline ? styles.multiline : styles.singleLine,
        props.style,
      ]}
    />
  );
}

const useStyles = makeStyles(({ colors }) => ({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 12, color: colors.mute },
  error: { fontSize: 12, fontWeight: "600", color: colors.negativeDeep },
  input: {
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: spacing.lg,
    fontSize: 16,
    color: colors.ink,
    minHeight: 48,
  },
  // 한 줄 입력에는 세로 padding을 주지 않는다. iOS는 padding을 UITextField의
  // `textContainerInset`으로 넘기는데, 그 값이 이미 세로 가운데로 잡힌 글자
  // 사각형에 다시 적용돼 글자가 padding만큼 아래로 밀린다(RCTUITextField의
  // `textRectForBounds:`). 높이는 `minHeight`가 잡고 글자는 가운데 정렬에 맡긴다.
  singleLine: {
    paddingVertical: 0,
    // 안드로이드: 칸 높이 안에서 글자를 가운데로, 기본 글꼴 여백은 끈다.
    textAlignVertical: "center",
    includeFontPadding: false,
  },
  // 여러 줄은 UITextView라 padding이 제대로 먹는다 — 글자는 위에서 시작해야 한다.
  multiline: { paddingVertical: spacing.md },
}));
