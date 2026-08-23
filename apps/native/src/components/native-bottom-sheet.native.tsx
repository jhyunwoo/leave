/**
 * 바텀시트 — Android용 시스템 구현(@expo/ui).
 * iOS는 `native-bottom-sheet.ios.tsx`, 웹은 `native-bottom-sheet.tsx`로 갈린다.
 */

import { BottomSheet, RNHostView } from "@expo/ui";
import type { ReactElement } from "react";
import { View } from "react-native";
import { pinnedSheetHeight, type SnapPoint } from "./sheet-snap-point";
import { useSheetClosed } from "./use-sheet-closed";

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
  const pinned = pinnedSheetHeight(props.snapPoints);

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
          // 시트 높이를 RN 쪽에도 못 박는다(pinnedSheetHeight 주석 참고).
          <View style={{ height: pinned }}>{props.children}</View>
        )}
      </RNHostView>
    </BottomSheet>
  );
}
