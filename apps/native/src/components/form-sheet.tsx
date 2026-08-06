import type { ReactElement } from "react";
import { Modal, StyleSheet, View } from "react-native";
import { colors } from "@/theme";

/**
 * 입력 폼을 담는 시트.
 *
 * 바텀시트(`NativeBottomSheet`)를 쓰지 않는다. 그쪽은 SwiftUI `.sheet` 안에
 * `RNHostView`로 RN 트리를 얹는 구조라, RN 루트의 높이를 SwiftUI가 측정해
 * Yoga로 되돌려준다. 디텐트가 여러 개면 콘텐츠가 최대 디텐트 기준으로 배치돼
 * RN 루트가 실제로 보이는 시트보다 커지고, 안쪽 ScrollView의 스크롤 범위가
 * 모자라 하단 버튼에 영영 닿지 못한다.
 *
 * RN `Modal`의 `pageSheet`은 RN이 레이아웃을 온전히 소유하므로 `flex: 1` +
 * ScrollView + 고정 푸터가 그대로 동작한다. iOS 폼 시트의 기본 표현이기도 하다.
 * Android에서는 `presentationStyle`이 무시되고 전체 화면 다이얼로그가 된다.
 */
export function FormSheet(props: {
  isPresented: boolean;
  onDismiss: () => void;
  testID?: string;
  children: ReactElement;
}) {
  return (
    <Modal
      visible={props.isPresented}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={props.onDismiss}
      // 스와이프로 내렸을 때도 폼 상태를 닫힌 것으로 맞춘다.
      onDismiss={props.onDismiss}
      testID={props.testID}
    >
      <View style={styles.root}>{props.children}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
});
