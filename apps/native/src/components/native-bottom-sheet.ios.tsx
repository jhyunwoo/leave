/**
 * 바텀시트 — iOS용 SwiftUI 시트.
 *
 * `@expo/ui`의 universal `BottomSheet`(=`@expo/ui`의 기본 내보내기)를 그대로 쓰지
 * 않고 `swift-ui` 시트를 직접 얹는다. universal 쪽은 사용자가 손으로 내렸을 때만
 * `onDismiss`를 주고, 코드로 닫은 경우(`isPresented`를 false로)에는 아무것도
 * 알려주지 않는다. iOS는 한 화면에 모달을 하나만 띄울 수 있어서, 시트를 닫고 이어
 * 폼 모달을 띄우려면 "다 닫혔다"는 시점을 알아야 한다.
 *
 * SwiftUI `.sheet(isPresented:onDismiss:)`의 `onDismiss`는 코드로 닫은 경우에도
 * 닫힘이 끝난 뒤 불린다. 그것을 `onClosed`로 내보낸다. 표시 구성(Host·모디파이어)은
 * universal 구현과 같게 맞춰 보이는 모습이 달라지지 않게 했다.
 */

import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui";
import {
  frame,
  padding,
  presentationDetents,
  presentationDragIndicator,
  type ModifierConfig,
  type PresentationDetent,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactElement } from "react";

type SnapPoint = "half" | "full" | { fraction: number } | { height: number };

function toDetent(snapPoint: SnapPoint): PresentationDetent {
  if (snapPoint === "half") return "medium";
  if (snapPoint === "full") return "large";
  return snapPoint;
}

export function NativeBottomSheet(props: {
  isPresented: boolean;
  /** 사용자가 시트를 직접 내렸다. 화면 상태를 닫힘으로 맞추는 용도. */
  onDismiss: () => void;
  /** 시트가 화면에서 사라진 뒤. 코드로 닫은 경우에도 온다. */
  onClosed?: () => void;
  snapPoints?: SnapPoint[];
  testID?: string;
  children: ReactElement;
}) {
  const snapPoints = props.snapPoints ?? [];
  const modifiers: ModifierConfig[] = [
    frame({ maxWidth: Infinity, alignment: "topLeading" }),
    padding({ top: 16, leading: 16, trailing: 16 }),
    presentationDragIndicator("visible"),
  ];
  if (snapPoints.length > 0) {
    modifiers.push(presentationDetents(snapPoints.map(toDetent)));
  }

  return (
    <Host style={{ position: "absolute" }} pointerEvents="none">
      <BottomSheet
        isPresented={props.isPresented}
        onIsPresentedChange={(presented) => {
          if (!presented) props.onDismiss();
        }}
        onDismiss={props.onClosed}
        // 디텐트를 직접 주면 콘텐츠 높이에 맞추지 않는다.
        fitToContents={snapPoints.length === 0}
        testID={props.testID}
      >
        <Group modifiers={modifiers}>
          <RNHostView>{props.children}</RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
