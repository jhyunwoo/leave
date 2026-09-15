/**
 * 버튼 — 웹(Expo Web)용 기본 구현.
 *
 * Metro가 플랫폼별로 파일을 바꿔 끼운다: iOS는 `button.ios.tsx`(SwiftUI),
 * Android는 `button.native.tsx`(Compose), 그 외에는 이 RN 구현.
 * 세 파일의 props가 같아야 화면 코드가 플랫폼을 신경 쓰지 않는다.
 */

import Svg, { Path } from "react-native-svg";
import { type ButtonIcon, buttonIcons } from "./button-icons";

import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { makeStyles, useColors } from "@/theme";

type Variant = "primary" | "secondary" | "tertiary" | "danger" | "ghost";

export function Button(props: {
  title: string | ReactNode;
  onPress: () => void;
  variant?: Variant;
  size?: "md" | "sm";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  /**
   * 부모가 폭을 정한다(예: `flex: 1`로 나눠 가지는 한 줄).
   *
   * 이 구현은 RN이 라벨을 직접 재므로 하는 일이 없다. iOS/Android 구현에서만
   * 뜻이 있다 — 거기서는 `estimateLabelWidth`가 깔아 주는 `minWidth`가 Yoga에서
   * 부모 폭을 이겨, 한 줄에 셋을 넣으면 합이 칸보다 넓어져 카드 밖으로 밀린다.
   * 세 파일의 props는 같아야 하므로 여기서도 받는다.
   */
  flexible?: boolean;
  icon?: ButtonIcon;
  systemImage?: string;
  testID?: string;
}) {
  const styles = useStyles();
  const colors = useColors();
  const variant = props.variant ?? "primary";
  const size = props.size ?? "md";
  const disabled = Boolean(props.disabled || props.loading);
  const foreground =
    variant === "primary"
      ? colors.onPrimary
      : variant === "danger"
        ? colors.negative
        : variant === "ghost"
          ? colors.brand
          : colors.ink;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy: props.loading }}
      disabled={disabled}
      onPress={props.onPress}
      testID={props.testID}
      style={({ pressed }) => [
        styles.button,
        size === "sm" && styles.sm,
        variant === "primary" && styles.primary,
        variant === "secondary" && styles.secondary,
        variant === "tertiary" && styles.tertiary,
        variant === "danger" && styles.danger,
        variant === "ghost" && styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
        props.style,
      ]}
    >
      {props.icon && !props.loading ? (
        <Svg
          width={18}
          height={18}
          viewBox="0 0 24 24"
          fill="none"
          stroke={foreground}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden={true}
          accessible={false}
        >
          <Path d={buttonIcons[props.icon].path} />
        </Svg>
      ) : null}
      {props.loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : typeof props.title === "string" ? (
        <Text style={[styles.label, { color: foreground }]}>{props.title}</Text>
      ) : (
        props.title
      )}
    </Pressable>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  button: {
    flexDirection: "row",
    gap: 8,
    minHeight: 48,
    minWidth: 44,
    paddingHorizontal: 20,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
  },
  sm: { minHeight: 44, paddingHorizontal: 16 },
  primary: { backgroundColor: colors.primary },
  secondary: {
    backgroundColor: colors.canvas,
    borderColor: colors.hairline,
  },
  /* 채움만으로는 모자란다 — 이 변형을 쓰는 두 자리(정기외박·외출 설정 저장)가
     모두 `ContentPanel tone="accent"` 안이고, 그 표면도 primaryPale이라 버튼이
     패널에 그대로 녹아 글자만 남았다. 테두리 한 겹으로 경계를 만든다. */
  tertiary: {
    backgroundColor: colors.primaryPale,
    borderColor: colors.primaryNeutral,
  },
  danger: {
    backgroundColor: colors.canvas,
    borderColor: colors.negative,
  },
  /* 예전에는 배경도 테두리도 없는 글자였다. "닫기"·"선택 해제"처럼 이 변형만 쓰는
     자리에서는 옆에 비교할 버튼이 없어 누를 수 있는 것인지가 드러나지 않았다.
     가장 가벼운 변형이라는 자리는 그대로 두되(글자는 brand), 눌리는 것이라는
     최소한의 껍데기는 갖는다. */
  ghost: {
    backgroundColor: colors.canvas,
    borderColor: colors.hairline,
  },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  label: {
    flexShrink: 1,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
  },
}));
