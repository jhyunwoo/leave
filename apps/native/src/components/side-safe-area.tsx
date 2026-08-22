/**
 * 화면의 좌우를 그 화면 자신의 안전 영역 안으로 들여놓는다.
 * 사용처: 탭 안쪽 스택들의 `screenLayout`.
 *
 * ## 왜 창이 아니라 화면의 안전 영역인가
 *
 * iPad에서 탭바가 사이드바로 바뀌면(`(tabs)/_layout.tsx`의 `sidebarAdaptable`)
 * UIKit은 사이드바를 콘텐츠 **위에** 띄우고, 가려지는 폭만큼을 그 화면 뷰의
 * 안전 영역 왼쪽에 더한다. 콘텐츠 자체는 창 전체 폭 그대로 남으므로, 이 값을
 * 쓰지 않으면 화면 왼쪽 끝이 사이드바 밑에 깔려 보이지 않는다.
 *
 * 그런데 그 값은 `react-native-safe-area-context`의 `useSafeAreaInsets()`로는
 * 볼 수 없다. 그 훅이 재는 것은 앱 루트 뷰, 곧 **창**의 안전 영역인데
 * (expo-router가 SafeAreaProvider를 트리 맨 위에 한 번만 둔다), 사이드바는 창이
 * 아니라 탭 컨트롤러가 품은 자식 뷰에만 영향을 준다. 창 기준으로는 왼쪽 여백이
 * 0이라 아무 일도 일어나지 않는다. 그래서 화면 뷰(RNSScreen)의 안전 영역을
 * 직접 읽는 react-native-screens의 SafeAreaView를 쓴다.
 *
 * 위·아래는 건드리지 않는다. 헤더 아래 시작점은 스택이 이미 잡아주고, 스크롤
 * 화면들은 `contentInsetAdjustmentBehavior="automatic"`으로 시스템 바를 피한다.
 * 그 조정이 좌우를 비워두는 것도 같은 이유다 — UIScrollView는 스크롤하는 축의
 * 안전 영역만 반영하므로, 세로로만 스크롤하는 화면은 좌우 여백을 무시한다.
 *
 * 덤으로 가로 방향 노치(iPhone 가로 화면)도 같은 경로로 함께 해결된다.
 */

import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-screens/experimental";

/** 좌우 두 변만 맞춘다. 위·아래는 스택과 스크롤뷰가 이미 처리한다. */
const SIDE_EDGES = { left: true, right: true } as const;

export function SideSafeArea(props: { children: ReactNode }) {
  return (
    <SafeAreaView edges={SIDE_EDGES} style={styles.fill}>
      {props.children}
    </SafeAreaView>
  );
}

/**
 * 스택의 모든 화면에 한 번에 거는 `screenLayout` 값.
 *
 * 화면마다 라우트 파일에서 감싸지 않고 스택 레이아웃에 한 줄로 두면, 나중에
 * 그 탭에 화면을 더해도 규칙이 저절로 따라간다.
 */
export function sideSafeAreaScreenLayout(props: { children: ReactNode }) {
  return <SideSafeArea>{props.children}</SideSafeArea>;
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
