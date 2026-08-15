/**
 * 바텀시트 — 웹(Expo Web)용 구현.
 * 입력 폼에는 이걸 쓰지 않는다(이유는 form-sheet.tsx 주석 참고).
 * 짧은 선택지 표시처럼 높이가 콘텐츠에 좌우되지 않는 경우에만 쓴다.
 */

import { BottomSheet } from "@expo/ui/community/bottom-sheet";
import type { ReactElement } from "react";
import { View } from "react-native";
import { useSheetClosed } from "./use-sheet-closed";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

export function NativeBottomSheet(props: {
  isPresented: boolean;
  /** 사용자가 시트를 직접 내렸다. 화면 상태를 닫힘으로 맞추는 용도. */
  onDismiss: () => void;
  /** 시트가 닫힌 뒤. 코드로 닫은 경우에도 온다(useSheetClosed 주석 참고). */
  onClosed?: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
  children: ReactElement;
}) {
  useSheetClosed(props.isPresented, props.onClosed);

  if (!props.isPresented) return null;

  const snapPoints = props.snapPoints?.map((point) => {
    if (point === "half") return "50%";
    if (point === "full") return "100%";
    if ("fraction" in point) return `${point.fraction * 100}%`;
    return point.height;
  });

  return (
    <BottomSheet
      onDismiss={props.onDismiss}
      onClose={props.onDismiss}
      enablePanDownToClose
      snapPoints={snapPoints}
    >
      <View style={{ flex: 1 }} testID={props.testID}>
        {props.children}
      </View>
    </BottomSheet>
  );
}
