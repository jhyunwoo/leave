/**
 * 라벨 + 입력 + 힌트/오류를 묶는 폼 필드.
 * 사용처: 로그인·회원가입·그룹 관리 등 네이티브의 모든 폼.
 */

import { useRef, type ReactNode } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
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

export function Input({
  containerStyle,
  ...props
}: TextInputProps & {
  /** 한 줄 입력의 바깥 칸(테두리·배경) 스타일 — 너비 같은 배치 값은 여기로. */
  containerStyle?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const colors = useColors();
  const input = useRef<TextInput>(null);
  const shared = {
    placeholderTextColor: colors.mute,
    selectionColor: colors.brand,
    cursorColor: colors.brand,
  };

  // 여러 줄은 UITextView라 padding이 제대로 먹는다 — 글자는 위에서 시작해야 한다.
  if (props.multiline) {
    return (
      <TextInput
        {...shared}
        {...props}
        style={[styles.box, styles.text, styles.multiline, props.style]}
      />
    );
  }

  // 한 줄 입력은 글자 높이만 한 TextInput을 바깥 칸이 세로 가운데에 놓는다.
  // TextInput 자체를 48pt로 키우면 iOS UITextField가 그 안에서 placeholder와
  // 글자를 가운데보다 한참 아래에 그린다(세로 padding을 0으로 해도 그대로였다).
  // 가운데 정렬을 레이아웃이 맡으면 UIKit의 내부 배치와 상관없이 맞는다.
  return (
    // 글자 줄 밖의 여백을 눌러도 입력이 열려야 한다.
    <Pressable
      accessible={false}
      style={[styles.box, styles.singleLineBox, containerStyle]}
      onPress={() => input.current?.focus()}
    >
      <TextInput
        ref={input}
        {...shared}
        {...props}
        style={[styles.text, styles.singleLine, props.style]}
      />
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  field: { gap: 6 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  hint: { fontSize: 12, color: colors.mute },
  error: { fontSize: 12, fontWeight: "600", color: colors.negativeDeep },
  box: {
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radius.md,
    borderCurve: "continuous",
    paddingHorizontal: spacing.lg,
    // 고정 높이가 아니라 하한이다 — 큰 글씨 설정에서 글자가 잘리지 않게.
    minHeight: 48,
  },
  text: { fontSize: 16, color: colors.ink },
  multiline: { paddingVertical: spacing.md },
  singleLineBox: { justifyContent: "center" },
  singleLine: {
    padding: 0,
    // 안드로이드: 기본 글꼴 여백을 꺼서 글자 줄 높이만 차지하게 한다.
    includeFontPadding: false,
  },
}));
