/**
 * 창 크기에 반응하는 레이아웃 기본기 — 크기 클래스와 두세 개의 배치 부품.
 *
 * 사용처: apps/native/src 의 화면들.
 *
 * ## 왜 기기가 아니라 창인가
 *
 * "태블릿인가"를 기기 모델·`Device.deviceType`으로 판단하지 않는다. 판단 근거는
 * 지금 앱이 실제로 차지하고 있는 창의 폭 하나뿐이다. 같은 iPad라도 Split View의
 * 좁은 칸에서는 휴대폰과 같은 폭이고, Stage Manager와 안드로이드 멀티윈도우는
 * 앱이 떠 있는 동안 폭이 계속 바뀐다. 폴더블은 한 기기가 두 크기를 오간다.
 * 창 폭만 보면 이 모든 경우가 하나의 규칙으로 정리된다.
 *
 * `useWindowDimensions()`는 회전·리사이즈에 맞춰 다시 렌더되므로, 크기 클래스는
 * 상태나 이펙트 없이 렌더 중에 바로 계산한다. 이펙트로 상태를 맞추면 리사이즈
 * 도중 한 프레임 동안 옛 레이아웃이 남는다.
 *
 * ## 무엇을 넣지 않았나
 *
 * 화면마다 다른 배치를 여기서 전부 추상화하려 하지 않는다. 반복되는 문제는
 * "주 콘텐츠 + 보조 패널"과 "카드 여러 장을 열로 나누기" 둘뿐이라, 딱 그 둘만
 * 부품으로 만들고 나머지는 각 화면이 크기 클래스를 보고 직접 배치한다.
 */

import { Children, useCallback, useState, type ReactNode } from "react";
import {
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { layout, spacing } from "@/theme";
import {
  resolveWindowSizeClass,
  type WindowSizeClass,
} from "./window-size-class";

export {
  resolveWindowSizeClass,
  type WindowSizeClass,
} from "./window-size-class";

export type AdaptiveLayout = {
  /** 창 폭(논리 px). 화면 폭이 아니라 앱에 주어진 폭이다. */
  width: number;
  height: number;
  sizeClass: WindowSizeClass;
  isCompact: boolean;
  isMedium: boolean;
  isExpanded: boolean;
  /** medium 이상 — 보조 패널을 붙일 수 있는 폭인지. */
  isWide: boolean;
  isLandscape: boolean;
};

/** 지금 창의 크기 클래스와 그로부터 나오는 판단들. */
export function useWindowSizeClass(): AdaptiveLayout {
  const { width, height } = useWindowDimensions();
  const sizeClass = resolveWindowSizeClass(width, height);
  return {
    width,
    height,
    sizeClass,
    isCompact: sizeClass === "compact",
    isMedium: sizeClass === "medium",
    isExpanded: sizeClass === "expanded",
    isWide: sizeClass !== "compact",
    isLandscape: width > height,
  };
}

/**
 * 창이 아니라 **이 컨테이너**의 폭으로 크기 클래스를 정한다.
 *
 * 필요한 이유는 폼 시트 때문이다. RN `Modal`의 `pageSheet`은 iPad에서 창이
 * 아무리 넓어도 가운데 카드 하나(대략 540~700pt)로 뜨는데, `useWindowDimensions`은
 * 그 안에서도 창 전체 폭(예: 1366)을 알려준다. 그 값을 믿고 두 열로 나누면 실제로는
 * 270pt짜리 두 열이 되어 오히려 좁아진다.
 *
 * 재는 동안(첫 프레임)에는 compact로 본다 — 좁은 쪽으로 틀리는 편이 안전하다.
 *
 * 높이는 넘기지 않는다. 여기서 재는 것은 컨테이너의 폭 하나이고, 시트 안에서는
 * 높이가 창 높이와 무관하게 바뀌므로 짧은 변 규칙의 근거가 되지 못한다.
 */
export function useMeasuredSizeClass(): {
  width: number;
  sizeClass: WindowSizeClass;
  isCompact: boolean;
  onLayout: (event: LayoutChangeEvent) => void;
} {
  const [width, setWidth] = useState(0);
  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);
  const sizeClass = width > 0 ? resolveWindowSizeClass(width) : "compact";
  return { width, sizeClass, isCompact: sizeClass === "compact", onLayout };
}

/** 크기 클래스별 보조 패널 폭. compact에서는 패널을 붙이지 않는다. */
export function inspectorWidth(sizeClass: WindowSizeClass): number {
  return sizeClass === "expanded"
    ? layout.inspector.expanded
    : layout.inspector.medium;
}

/** 크기 클래스별 요약 사이드 컬럼 폭. */
export function sideColumnWidth(sizeClass: WindowSizeClass): number {
  return sizeClass === "expanded"
    ? layout.sideColumn.expanded
    : layout.sideColumn.medium;
}

/**
 * 주 콘텐츠 + 보조 패널.
 *
 * compact이거나 `collapsed`면 보조 패널을 아예 그리지 않고 주 콘텐츠만 남긴다 —
 * 좁은 창에서는 각 화면이 시트·푸시 같은 좁은 창의 관례로 같은 정보를 보여준다.
 *
 * 보조 패널은 폭을 고정하고 주 콘텐츠가 남는 폭을 가져간다. 반대로 하면 달력처럼
 * 폭이 곧 정보량인 콘텐츠가 창이 커질수록 손해를 본다.
 */
export function SplitPane(props: {
  primary: ReactNode;
  inspector: ReactNode;
  sizeClass: WindowSizeClass;
  /** 보조 패널을 접는다(선택된 대상이 없는 등). */
  collapsed?: boolean;
  /** 보조 패널을 왼쪽에 둔다. 목차·요약 성격일 때. */
  side?: "leading" | "trailing";
  width?: number;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const showInspector = props.sizeClass !== "compact" && !props.collapsed;
  const paneWidth = props.width ?? inspectorWidth(props.sizeClass);
  const gap = props.gap ?? spacing.lg;

  if (!showInspector) {
    return <View style={[{ flex: 1 }, props.style]}>{props.primary}</View>;
  }

  const inspector = (
    <View key="inspector" style={{ width: paneWidth }}>
      {props.inspector}
    </View>
  );
  const primary = (
    <View key="primary" style={{ flex: 1, minWidth: 0 }}>
      {props.primary}
    </View>
  );

  return (
    <View style={[{ flex: 1, flexDirection: "row", gap }, props.style]}>
      {props.side === "leading" ? [inspector, primary] : [primary, inspector]}
    </View>
  );
}

/** 크기 클래스별 열 수. 빠진 클래스는 그보다 좁은 쪽 값을 물려받는다. */
export type GridColumns = Partial<Record<WindowSizeClass, number>>;

function columnsFor(columns: GridColumns, sizeClass: WindowSizeClass): number {
  const compact = columns.compact ?? 1;
  const medium = columns.medium ?? compact;
  const expanded = columns.expanded ?? medium;
  if (sizeClass === "expanded") return Math.max(1, expanded);
  if (sizeClass === "medium") return Math.max(1, medium);
  return Math.max(1, compact);
}

/**
 * 카드 여러 장을 크기 클래스에 따라 여러 열로 나눈다.
 *
 * 퍼센트 basis 대신 자식을 행 단위로 잘라 각 칸에 `flex: 1`을 준다. RN의 `gap`은
 * 퍼센트 폭에 더해지는 값이라, `flexBasis: 50%` + gap 조합은 항상 조금씩 넘친다.
 * 마지막 행이 덜 찼으면 빈 칸을 채워 열 정렬이 흐트러지지 않게 한다 — 한 장만
 * 남았다고 그 카드가 두 배로 넓어지면 옆 열과 크기가 어긋나 보인다.
 */
export function ResponsiveGrid(props: {
  children: ReactNode;
  columns: GridColumns;
  sizeClass: WindowSizeClass;
  gap?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const gap = props.gap ?? spacing.lg;
  const items = Children.toArray(props.children).filter(Boolean);
  const columns = columnsFor(props.columns, props.sizeClass);

  if (columns === 1) {
    return <View style={[{ gap }, props.style]}>{items}</View>;
  }

  const rows: ReactNode[][] = [];
  for (let i = 0; i < items.length; i += columns) {
    rows.push(items.slice(i, i + columns));
  }

  return (
    <View style={[{ gap }, props.style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: "row", gap }}>
          {row.map((child, columnIndex) => (
            <View key={columnIndex} style={{ flex: 1, minWidth: 0 }}>
              {child}
            </View>
          ))}
          {/* 덜 찬 마지막 행의 빈 칸. 내용이 없으므로 접근성 트리에도 안 잡힌다. */}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={`filler-${index}`} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
