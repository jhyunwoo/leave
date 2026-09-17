/**
 * 바텀시트 — Android용 시스템 구현(@expo/ui).
 * iOS는 `native-bottom-sheet.ios.tsx`, 웹은 `native-bottom-sheet.tsx`로 갈린다.
 */

import { BottomSheet, RNHostView } from "@expo/ui";
import type { ReactElement } from "react";
import { View } from "react-native";
import {
  pinnedSheetHeight,
  type SheetHostSizing,
  type SnapPoint,
} from "./sheet-snap-point";
import { useSheetClosed } from "./use-sheet-closed";

/**
 * Material `ModalBottomSheet`은 디텐트 숫자를 보지 않고 콘텐츠 높이로 커진다. 시트 높이를 콘텐츠에 맞추는
 * 화면이 이 값을 보고 디텐트를 잡는다(`fittedDetentHeight`).
 */
export const SHEET_HOST_SIZING: SheetHostSizing = "content";

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
  // Material `ModalBottomSheet`은 콘텐츠 높이로 커진다 — 시트 높이를 RN 쪽에서
  // 정해 줘야 한다(sheet-snap-point.ts).
  const pinned = pinnedSheetHeight(props.snapPoints, SHEET_HOST_SIZING);

  return (
    <BottomSheet
      isPresented={props.isPresented}
      onDismiss={props.onDismiss}
      snapPoints={props.snapPoints}
      testID={props.testID}
    >
      <RNHostView>
        {pinned === null ? (
          props.children
        ) : (
          <View style={{ height: pinned }}>{props.children}</View>
        )}
      </RNHostView>
    </BottomSheet>
  );
}
