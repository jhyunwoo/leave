/**
 * 사용법 투어의 무대 (네이티브) — 장면 하나를 끝없이 돌리는 모션 그래픽.
 *
 * 사용처: `screens/onboarding/index.tsx`(사용법 단계에서 히어로 자리를 대신한다).
 *
 * 웹의 `pages/onboarding/TourStage.tsx`와 같은 그림이다. 좌표·색·시간표가 전부
 * `@leave/shared`의 onboarding-tour 모듈에서 오고, 자세는 같은 샘플러
 * (`sampleTourPose`)로 얻는다. 여기서 좌표나 시간을 직접 만지면 두 앱이 갈라진다.
 *
 * 움직임은 UI 스레드에서 돈다. 장면마다 시계(shared value) 하나를 0→1로 반복해
 * 돌리고, 노드는 그 시계로 자기 자세를 `interpolate`한다. 샘플러는 워크릿이 아니라
 * UI 스레드에서 직접 부를 수 없으므로, 마운트할 때 JS 쪽에서 한 바퀴를 촘촘히
 * 샘플링해 표로 넘긴다(`trackOf`). 키프레임 시점도 표에 넣어 "같은 시점의 두 키"
 * 같은 순간 이동이 뭉개지지 않게 한다.
 *
 * 그림은 장식이라 접근성 트리에서 감춘다. 같은 내용을 아래 패널이 글로 말한다.
 */

import {
  TOUR_BACKDROP,
  TOUR_CANVAS,
  TOUR_ICONS,
  TOUR_PALETTE,
  sampleTourPose,
  tourAnimatedProps,
  type TourNode,
  type TourOrigin,
  type TourPose,
  type TourScene,
  type TourWeight,
} from "@leave/shared";
import { memo, useEffect, useState } from "react";
import { Text, type TextStyle, type ViewStyle } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path } from "react-native-svg";
import { makeStyles, useAppColorScheme } from "@/theme";

/** 한 바퀴를 몇 칸으로 샘플링하는가. 7초 남짓한 장면에서 한 칸이 40ms 안쪽이다. */
const SAMPLES = 180;

const ORIGIN: Record<TourOrigin, string> = {
  center: "center center",
  left: "left center",
  right: "right center",
  top: "center top",
  bottom: "center bottom",
};

const WEIGHT: Record<TourWeight, TextStyle["fontWeight"]> = {
  500: "500",
  600: "600",
  700: "700",
  800: "800",
  900: "900",
};

type Track = {
  input: number[];
  output: Partial<Record<keyof TourPose, number[]>>;
};

const tracks = new WeakMap<TourNode, Track | null>();

/** 노드 한 바퀴의 자세 표. 장면 데이터는 상수라 노드마다 한 번만 만든다. */
function trackOf(node: TourNode): Track | null {
  const cached = tracks.get(node);
  if (cached !== undefined) return cached;
  const props = tourAnimatedProps(node.keys);
  let track: Track | null = null;
  if (props.length > 0) {
    const times = new Set<number>();
    for (let i = 0; i <= SAMPLES; i++) times.add(i / SAMPLES);
    for (const key of node.keys ?? []) {
      times.add(key.at);
      // 같은 시점에 값이 바뀌는 키(순간 이동)는 바로 뒤 한 점을 더 찍어 둔다.
      times.add(Math.min(key.at + 1e-4, 1));
    }
    const input = [...times].sort((a, b) => a - b);
    const output: Track["output"] = {};
    for (const prop of props) output[prop] = [];
    for (const at of input) {
      const pose = sampleTourPose(node.keys, at);
      for (const prop of props) output[prop]?.push(pose[prop]);
    }
    track = { input, output };
  }
  tracks.set(node, track);
  return track;
}

type Palette = (typeof TOUR_PALETTE)["light"];

const TourNodeView = memo(function TourNodeView(props: {
  node: TourNode;
  k: number;
  clock: SharedValue<number>;
  palette: Palette;
}) {
  const { node, k, clock, palette } = props;
  const track = trackOf(node);

  const animated = useAnimatedStyle(() => {
    if (!track) return {};
    const t = clock.value;
    const read = (prop: keyof TourPose, fallback: number) => {
      const values = track.output[prop];
      return values ? interpolate(t, track.input, values) : fallback;
    };
    const scale = read("scale", 1);
    return {
      opacity: read("opacity", 1),
      transform: [
        { translateX: read("x", 0) * k },
        { translateY: read("y", 0) * k },
        { rotate: `${read("rotate", 0)}deg` },
        { scaleX: scale * read("sx", 1) },
        { scaleY: scale * read("sy", 1) },
      ],
    };
  });

  const frame: ViewStyle = {
    position: "absolute",
    left: node.x * k,
    top: node.y * k,
    width: node.w * k,
    height: node.h * k,
    transformOrigin: ORIGIN[node.origin ?? "center"],
  };

  if (node.kind === "box")
    return (
      <Animated.View
        style={[
          frame,
          {
            backgroundColor: node.fill ? palette[node.fill] : undefined,
            borderColor: node.stroke ? palette[node.stroke] : undefined,
            borderWidth: node.stroke ? 1.5 : 0,
            borderRadius: (node.radius ?? 0) * k,
            borderCurve: "continuous",
            boxShadow: node.shadow
              ? "0 10px 26px rgba(14, 15, 12, 0.18), 0 2px 6px rgba(14, 15, 12, 0.1)"
              : undefined,
          },
          animated,
        ]}
      />
    );

  if (node.kind === "icon")
    return (
      <Animated.View style={[frame, animated]}>
        <Svg
          width={node.w * k}
          height={node.h * k}
          viewBox="0 0 24 24"
          fill="none"
          stroke={palette[node.color]}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {TOUR_ICONS[node.icon].map((d) => (
            <Path key={d} d={d} />
          ))}
        </Svg>
      </Animated.View>
    );

  return (
    <Animated.View
      style={[
        frame,
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent:
            node.align === "center"
              ? "center"
              : node.align === "right"
                ? "flex-end"
                : "flex-start",
        },
        animated,
      ]}
    >
      {/* 줄임표로 자르지 않는다 — 글꼴 폭이 웹과 조금 달라도 글자가 상자를 살짝
          넘칠 뿐 잘리지 않게 둔다. */}
      <Text
        allowFontScaling={false}
        style={{
          flexShrink: 0,
          fontSize: node.size * k,
          fontWeight: WEIGHT[node.weight ?? 600],
          color: palette[node.color],
          letterSpacing: -0.01 * node.size * k,
          fontVariant: ["tabular-nums"],
          includeFontPadding: false,
        }}
      >
        {node.text}
      </Text>
    </Animated.View>
  );
});

export function TourStage(props: {
  scene: TourScene;
  /** 무대를 옆으로 쓸었을 때. 1이면 다음 장면, -1이면 이전 장면. */
  onSwipe?: (direction: 1 | -1) => void;
}) {
  const { scene, onSwipe } = props;
  const styles = useStyles();
  const scheme = useAppColorScheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const clock = useSharedValue(reduced ? scene.poster : 0);
  const k = width / TOUR_CANVAS.width;

  useEffect(() => {
    if (reduced) {
      clock.value = scene.poster;
      return;
    }
    clock.value = 0;
    clock.value = withRepeat(
      withTiming(1, { duration: scene.duration, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(clock);
  }, [scene, reduced, clock]);

  // 세로 스크롤과 다투지 않도록 가로로 분명히 움직였을 때만 잡는다.
  const swipe = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-24, 24])
    .failOffsetY([-14, 14])
    .onEnd((event) => {
      if (!onSwipe || Math.abs(event.translationX) < 48) return;
      onSwipe(event.translationX < 0 ? 1 : -1);
    });

  const palette = TOUR_PALETTE[scheme];
  return (
    <GestureDetector gesture={swipe}>
      <Animated.View
        style={[
          styles.frame,
          {
            height: width
              ? (width * TOUR_CANVAS.height) / TOUR_CANVAS.width
              : undefined,
            backgroundColor: TOUR_BACKDROP[scheme][scene.backdrop],
            // 장면이 바뀌면 바탕색이 흘러가듯 옮겨 칠해진다.
            transitionProperty: "backgroundColor",
            transitionDuration: 480,
          },
        ]}
        onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        testID="onboarding-tour-stage"
      >
        {width > 0 ? (
          <Animated.View
            key={scene.id}
            entering={reduced ? undefined : FadeIn.duration(360)}
            style={styles.canvas}
          >
            {scene.nodes.map((node) => (
              <TourNodeView
                key={node.id}
                node={node}
                k={k}
                clock={clock}
                palette={palette}
              />
            ))}
          </Animated.View>
        ) : null}
      </Animated.View>
    </GestureDetector>
  );
}

const useStyles = makeStyles(() => ({
  frame: {
    width: "100%",
    aspectRatio: TOUR_CANVAS.width / TOUR_CANVAS.height,
    borderRadius: 26,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  canvas: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0 },
}));
