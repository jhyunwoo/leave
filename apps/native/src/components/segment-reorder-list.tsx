/**
 * 꾹 눌러 드래그로 순서를 바꾸는 세로 목록.
 *
 * 사용처: 휴가 등록/수정 시트의 휴가 종류 목록(`leave-form-modal.tsx`).
 *
 * 목록이 짧고(최대 30, 보통 2~4) 행 높이가 제각각이라 가상화가 필요 없다.
 * 그래서 FlatList 계열 라이브러리를 들이는 대신 달력 칩 드래그와 같은 방식으로
 * 직접 그린다 — 자리 계산은 `segment-reorder.ts`에 떼어 두고 테스트한다.
 *
 * 잡힌 행만 손가락을 따라가고, 나머지는 비켜서기만 한다. 두 축을 나누면 매 프레임
 * 하는 일이 transform 하나씩뿐이라 레이아웃이 다시 돌지 않는다.
 *
 * ## 쓰기는 전부 이 컴포넌트가 한다
 *
 * 공유 값(`useSharedValue`)을 자식에게 넘겨 자식이 고치게 하면
 * `react-hooks/immutability`가 막는다 — prop으로 받은 것을 고치는 일이기 때문이다.
 * 규칙을 끄는 대신 방향을 뒤집었다: 공유 값은 여기서 만들고 여기서만 고치며,
 * 자식은 읽어서 그리기만 한다. 제스처가 부르는 것도 여기서 만든 워클릿이다.
 */

import * as Haptics from "expo-haptics";
import { useCallback, type ReactNode } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { reorderTargetIndex, shiftForIndex } from "./segment-reorder";

/**
 * 집었다고 인정하는 시간. 달력 칩 드래그와 같은 값으로 맞춘다 —
 * 한 앱 안에서 "꾹 누르기"의 길이가 자리마다 다르면 손이 헷갈린다.
 */
const LONG_PRESS_MS = 250;

/** 비켜서는 행의 애니메이션. 손가락보다 느리면 어디로 떨어질지 안 보인다. */
const SHIFT_MS = 140;

/** 자식이 읽기만 하는 값들. 고치는 것은 부모뿐이다(위 머리주석). */
type DragView = {
  activeIndex: SharedValue<number>;
  targetIndex: SharedValue<number>;
  dragY: SharedValue<number>;
  heights: SharedValue<number[]>;
};

export function SegmentReorderList(props: {
  items: readonly ReactNode[];
  onReorder: (from: number, to: number) => void;
  /** 드래그 중에는 바깥 스크롤을 꺼야 목록과 시트가 같이 움직이지 않는다. */
  onDragActiveChange?: (active: boolean) => void;
  testID?: string;
}) {
  const activeIndex = useSharedValue(-1);
  const targetIndex = useSharedValue(-1);
  const dragY = useSharedValue(0);
  const heights = useSharedValue<number[]>([]);
  const view: DragView = { activeIndex, targetIndex, dragY, heights };

  const { onReorder, onDragActiveChange } = props;

  const announceStart = useCallback(() => {
    if (process.env.EXPO_OS === "ios") void Haptics.selectionAsync();
    onDragActiveChange?.(true);
  }, [onDragActiveChange]);

  const commit = useCallback(
    (from: number, to: number) => {
      onDragActiveChange?.(false);
      if (from !== to) {
        if (process.env.EXPO_OS === "ios") {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        onReorder(from, to);
      }
    },
    [onReorder, onDragActiveChange],
  );

  const beginDrag = (index: number) => {
    "worklet";
    activeIndex.value = index;
    targetIndex.value = index;
    dragY.value = 0;
    runOnJS(announceStart)();
  };

  const moveDrag = (index: number, translationY: number) => {
    "worklet";
    dragY.value = translationY;
    targetIndex.value = reorderTargetIndex(heights.value, index, translationY);
  };

  const endDrag = (index: number) => {
    "worklet";
    // 내가 잡은 드래그가 아니면 남의 상태를 지우지 않는다.
    if (activeIndex.value !== index) return;
    const to = targetIndex.value;
    activeIndex.value = -1;
    targetIndex.value = -1;
    dragY.value = 0;
    runOnJS(commit)(index, to);
  };

  const measure = (index: number, height: number) => {
    const next = [...heights.value];
    next[index] = height;
    heights.value = next;
  };

  return (
    <View testID={props.testID}>
      {props.items.map((item, index) => (
        <ReorderRow
          key={index}
          index={index}
          view={view}
          onBegin={beginDrag}
          onMove={moveDrag}
          onEnd={endDrag}
          onMeasure={measure}
        >
          {item}
        </ReorderRow>
      ))}
    </View>
  );
}

function ReorderRow(props: {
  index: number;
  view: DragView;
  onBegin: (index: number) => void;
  onMove: (index: number, translationY: number) => void;
  onEnd: (index: number) => void;
  onMeasure: (index: number, height: number) => void;
  children: ReactNode;
}) {
  const { index, view, onBegin, onMove, onEnd } = props;
  const { activeIndex, targetIndex, dragY, heights } = view;

  const gesture = Gesture.Pan()
    .activateAfterLongPress(LONG_PRESS_MS)
    // 세로 이동만 본다. 가로로 그으면 시트를 닫는 동작과 싸운다.
    .failOffsetX([-24, 24])
    .onStart(() => onBegin(index))
    .onUpdate((event) => onMove(index, event.translationY))
    // onEnd는 취소된 제스처에서 울리지 않는다. 어느 쪽으로 끝나든 상태를
    // 되돌려야 하므로 onFinalize 한 곳에서만 정리한다.
    .onFinalize(() => onEnd(index));

  const animatedStyle = useAnimatedStyle(() => {
    if (activeIndex.value === -1) {
      return { transform: [{ translateY: 0 }], zIndex: 0, opacity: 1 };
    }
    if (activeIndex.value === index) {
      return {
        transform: [{ translateY: dragY.value }],
        // 잡힌 행은 남은 행 위로 떠야 어디에 있는지 보인다.
        zIndex: 2,
        opacity: 0.96,
      };
    }
    const shift = shiftForIndex(
      index,
      activeIndex.value,
      targetIndex.value,
      heights.value[activeIndex.value] ?? 0,
    );
    return {
      transform: [{ translateY: withTiming(shift, { duration: SHIFT_MS }) }],
      zIndex: 0,
      opacity: 1,
    };
  });

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        style={animatedStyle}
        onLayout={(event) =>
          props.onMeasure(index, event.nativeEvent.layout.height)
        }
      >
        {props.children}
      </Animated.View>
    </GestureDetector>
  );
}
