/**
 * 바텀시트 — iOS/Android용 시스템 구현(@expo/ui).
 */

import { BottomSheet, RNHostView } from "@expo/ui";
import type { ReactElement } from "react";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

export function NativeBottomSheet(props: {
  isPresented: boolean;
  onDismiss: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
  children: ReactElement;
}) {
  return (
    <BottomSheet
      isPresented={props.isPresented}
      onDismiss={props.onDismiss}
      snapPoints={props.snapPoints}
      testID={props.testID}
    >
      <RNHostView>{props.children}</RNHostView>
    </BottomSheet>
  );
}
