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
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
  type ModifierConfig,
  type PresentationDetent,
} from "@expo/ui/swift-ui/modifiers";
import type { ReactElement } from "react";
import { View } from "react-native";
import { useColors } from "@/theme";
import { pinnedSheetHeight, type SnapPoint } from "./sheet-snap-point";

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
  const colors = useColors();
  const snapPoints = props.snapPoints ?? [];
  // 여백을 SwiftUI 쪽에 두지 않는다. Group에 padding을 걸면 RN 트리가 시트보다
  // 작아지고, 시트가 깎아주는 둥근 모서리 대신 직각 사각형이 시트 안에 얹힌 꼴이
  // 된다. 그 틈으로 시스템 시트 배경이 비쳐 콘텐츠와 시트가 따로 노는 것처럼 보인다.
  // 대신 RN 콘텐츠가 시트를 가득 채우게 두고(시트가 모서리를 알아서 클리핑한다),
  // 드래그 인디케이터 자리는 콘텐츠 '안쪽' 여백(SHEET_GRABBER_INSET)으로 잡는다.
  const fitToContents = snapPoints.length === 0;
  // SwiftUI 시트는 자기 높이를 RN 트리에 내려준다. 못 박지 않는다(sheet-snap-point.ts).
  const pinned = pinnedSheetHeight(props.snapPoints, "detent");
  const modifiers: ModifierConfig[] = [
    frame({
      maxWidth: Infinity,
      // 디텐트를 준 시트는 높이가 이미 정해져 있다. 늘려서 채우지 않으면 RN 트리가
      // 콘텐츠 높이에서 멈춰 시트 아래쪽이 빈 채로 남는다. 콘텐츠 높이에 맞추는
      // 시트(fitToContents)에는 걸면 안 된다 — 시트가 화면 전체로 커진다.
      ...(fitToContents ? null : { maxHeight: Infinity }),
      alignment: "topLeading",
    }),
    presentationDragIndicator("visible"),
    // 시트 자체의 배경을 콘텐츠와 같은 색으로 칠한다.
    //
    // RN 표면은 시트를 끝까지 채우지 못한다 — 시트 안쪽에 아래 안전 영역이 잡혀
    // 있어 표면이 홈 인디케이터 높이(약 34pt)만큼 위에서 끝난다. 예전에는
    // `ignoreSafeArea`로 표면을 시트 바닥까지 끌어내렸는데, 화면 가장자리에서 떠
    // 있는 카드로 그려지는 iOS 26 시트에서는 그 방법이 더는 먹지 않아 바닥에
    // 반투명한 시스템 배경이 그대로 비쳤다.
    //
    // 시트가 표면에 얼마를 내주든 남는 자리가 콘텐츠와 같은 색이면 틈으로 보이지
    // 않는다. `presentationBackground`는 보통의 `background`가 닿지 못하는 시트
    // 크롬(드래그 인디케이터 자리와 안전 영역 여백)까지 칠하므로, OS 판이 시트
    // 모양을 또 바꾸더라도 이 규칙은 그대로 선다.
    presentationBackground(colors.canvasSoft),
  ];
  if (!fitToContents) {
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
        fitToContents={fitToContents}
        testID={props.testID}
      >
        <Group modifiers={modifiers}>
          <RNHostView>
            {pinned === null ? (
              props.children
            ) : (
              <View style={{ height: pinned }}>{props.children}</View>
            )}
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  );
}
