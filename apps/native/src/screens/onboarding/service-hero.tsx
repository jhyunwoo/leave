/**
 * 온보딩 히어로 — 답변에 따라 자라나는 복무 타임라인 (네이티브).
 *
 * 사용처: `screens/onboarding/index.tsx`.
 *
 * 웹의 `pages/onboarding/ServiceHero.tsx`와 같은 그림이다. 좌표·색·엠블럼 패스가
 * 전부 `@leave/shared`의 onboarding 모듈에서 오므로 두 앱이 픽셀 단위로 같은
 * 구성을 그린다. 여기서 좌표를 직접 만지면 그 대응이 깨진다.
 *
 * 애니메이션만 플랫폼이 다르다. 웹은 CSS 전환, 여기서는 Reanimated로 SVG의
 * opacity·strokeDashoffset·cx를 UI 스레드에서 굴린다.
 *
 * 그림은 순수 장식이라 접근성 트리에서 통째로 감춘다. D-day·진행률은 옆의 질문
 * 화면이 글로 다시 말한다.
 */

import {
  BRANCH_ACCENT,
  BRANCH_EMBLEM,
  HERO_LAYOUT,
  HERO_TRACK,
  HERO_TRACK_LENGTH,
  HERO_VIEWBOX,
  heroGeometry,
  heroLayerState,
  type Branch,
  type HeroLayer,
  type HeroLayerState,
  type ISODate,
  type OnboardingStepId,
} from "@leave/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { View } from "react-native";
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  G,
  Line,
  Path,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import { makeStyles, useAppColorScheme, useColors } from "@/theme";

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedLine = Animated.createAnimatedComponent(Line);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** 웹의 `.is-present`(0.62)와 같은 값이어야 두 앱의 옅기가 같다. */
const LAYER_OPACITY: Record<HeroLayerState, number> = {
  hidden: 0,
  present: 0.62,
  active: 1,
};

/** 레이어 하나를 감싸 등장·퇴장 불투명도를 굴린다. */
function Layer(props: { state: HeroLayerState; children: ReactNode }) {
  const reduced = useReducedMotion();
  const target = LAYER_OPACITY[props.state];
  const opacity = useSharedValue(target);

  useEffect(() => {
    opacity.value = reduced ? target : withTiming(target, { duration: 420 });
  }, [target, reduced, opacity]);

  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));
  return <AnimatedG animatedProps={animatedProps}>{props.children}</AnimatedG>;
}

/**
 * 숫자가 굴러가는 카운터. 웹 히어로의 `useRolling`과 같은 곡선을 쓴다.
 *
 * SVG 텍스트는 내용이 prop이 아니라 children이라 Reanimated로 UI 스레드에서
 * 굴릴 수 없다. 640ms 한 번뿐인 전환이라 JS 상태로 처리한다.
 */
function useRolling(target: number, enabled: boolean): number {
  const reduced = useReducedMotion();
  const animate = enabled && !reduced;
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const frameRef = useRef(0);

  useEffect(() => {
    // 굴리지 않을 때는 상태를 건드리지 않는다. 효과 본문에서 곧장 setState를
    // 부르면 렌더가 한 번 더 도는데, 아래에서 목표값을 그대로 돌려주면 된다.
    if (!animate) {
      fromRef.current = target;
      return;
    }
    const from = fromRef.current;
    if (from === target) return;
    const startedAt = Date.now();
    const step = () => {
      const t = Math.min((Date.now() - startedAt) / 640, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = target;
    };
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [target, animate]);

  return animate ? value : target;
}

/** 진행선: dashoffset을 줄여 좌에서 우로 차오른다. */
function ProgressLine(props: { progress: number; color: string }) {
  const reduced = useReducedMotion();
  const target = HERO_TRACK_LENGTH * (1 - props.progress);
  const offset = useSharedValue(target);

  useEffect(() => {
    offset.value = reduced ? target : withTiming(target, { duration: 700 });
  }, [target, reduced, offset]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: offset.value,
  }));

  return (
    <AnimatedLine
      x1={HERO_TRACK.x1}
      y1={HERO_TRACK.y}
      x2={HERO_TRACK.x2}
      y2={HERO_TRACK.y}
      stroke={props.color}
      strokeWidth={6}
      strokeLinecap="round"
      strokeDasharray={HERO_TRACK_LENGTH}
      animatedProps={animatedProps}
    />
  );
}

/** 현재 위치 표식: 진행선 끝을 따라 미끄러진다. */
function ProgressHead(props: { x: number; fill: string; ring: string }) {
  const reduced = useReducedMotion();
  const cx = useSharedValue(props.x);

  useEffect(() => {
    cx.value = reduced ? props.x : withTiming(props.x, { duration: 700 });
  }, [props.x, reduced, cx]);

  const animatedProps = useAnimatedProps(() => ({ cx: cx.value }));

  return (
    <AnimatedCircle
      cy={HERO_TRACK.y}
      r={8}
      fill={props.fill}
      stroke={props.ring}
      strokeWidth={3}
      animatedProps={animatedProps}
    />
  );
}

/** 차례로 톡톡 나타나는 점·꺾쇠에 쓰는 지연 페이드. */
function Stagger(props: { index: number; step: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useSharedValue(reduced ? 1 : 0);

  useEffect(() => {
    opacity.value = reduced
      ? 1
      : withDelay(props.index * props.step, withTiming(1, { duration: 320 }));
  }, [props.index, props.step, reduced, opacity]);

  const animatedProps = useAnimatedProps(() => ({ opacity: opacity.value }));
  return <AnimatedG animatedProps={animatedProps}>{props.children}</AnimatedG>;
}

function fmt(date: ISODate): string {
  return `${date.slice(0, 4)}.${date.slice(5, 7)}.${date.slice(8, 10)}`;
}

function badgeWidth(label: string): number {
  return Math.min(HERO_LAYOUT.badge.textDx * 2 + label.length * 13, 190);
}

export function ServiceHero(props: {
  step: OnboardingStepId;
  branch: Branch;
  name: string;
  enlistedAt: string;
  dischargeAt: string;
  overnightStartDate: string;
  inGroup: boolean;
  today: ISODate;
}) {
  const styles = useStyles();
  const scheme = useAppColorScheme();
  const accent = BRANCH_ACCENT[props.branch][scheme];
  const emblem = BRANCH_EMBLEM[props.branch];
  // SVG는 스타일시트를 못 쓴다. 색은 값으로 직접 넘긴다.
  const palette = useColors();

  const geo = heroGeometry({
    branch: props.branch,
    today: props.today,
    enlistedAt: props.enlistedAt,
    dischargeAt: props.dischargeAt,
    overnightStartDate: props.overnightStartDate,
  });

  const layer = (name: HeroLayer) => heroLayerState(props.step, name);

  const daysLeft = useRolling(geo.daysLeft, geo.resolved);
  const permille = useRolling(Math.round(geo.progress * 1000), geo.resolved);
  const badgeLabel = props.name.trim() || "별칭";
  const skyVisible = layer("sky") !== "hidden";

  return (
    <View
      style={styles.root}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg
        viewBox={`0 0 ${HERO_VIEWBOX.width} ${HERO_VIEWBOX.height}`}
        width="100%"
        height="100%"
      >
        {/* 군종 틴트 배경. 아직 군종을 고르기 전에는 중립 표면으로 깔아둔다. */}
        <Rect
          x={0}
          y={0}
          width={HERO_VIEWBOX.width}
          height={HERO_VIEWBOX.height}
          rx={24}
          fill={skyVisible ? accent.tint : palette.canvasSoft}
        />

        {/* 군종 상징 */}
        <Layer state={layer("emblem")}>
          <G
            transform={`translate(${HERO_LAYOUT.emblem.x} ${HERO_LAYOUT.emblem.y}) scale(${HERO_LAYOUT.emblem.scale})`}
          >
            {emblem.shapes.map((shape, i) => (
              <Path
                key={i}
                d={shape.d}
                fill={shape.mode === "fill" ? accent.line : "none"}
                stroke={shape.mode === "stroke" ? accent.line : "none"}
                strokeWidth={shape.width ?? 0}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={shape.opacity ?? 1}
              />
            ))}
          </G>
        </Layer>

        {/* 별칭 칩 */}
        <Layer state={layer("badge")}>
          <Rect
            x={HERO_LAYOUT.badge.x}
            y={HERO_LAYOUT.badge.y}
            rx={HERO_LAYOUT.badge.height / 2}
            width={badgeWidth(badgeLabel)}
            height={HERO_LAYOUT.badge.height}
            fill={palette.ink}
          />
          <SvgText
            x={HERO_LAYOUT.badge.x + HERO_LAYOUT.badge.textDx}
            y={HERO_LAYOUT.badge.y + HERO_LAYOUT.badge.textDy}
            fontSize={13}
            fontWeight="700"
            fill={palette.canvas}
          >
            {badgeLabel}
          </SvgText>
        </Layer>

        {/* 숫자 판독부 */}
        <Layer state={layer("readout")}>
          <SvgText
            x={HERO_LAYOUT.readout.x}
            y={HERO_LAYOUT.readout.valueY}
            fontSize={HERO_LAYOUT.readout.valueSize}
            fontWeight="900"
            fill={accent.deep}
          >
            {geo.resolved ? `D-${daysLeft}` : "D-???"}
          </SvgText>
          <SvgText
            x={HERO_LAYOUT.readout.x}
            y={HERO_LAYOUT.readout.captionY}
            fontSize={HERO_LAYOUT.readout.captionSize}
            fontWeight="600"
            fill={accent.line}
          >
            {geo.resolved
              ? `복무 ${(permille / 10).toFixed(1)}%`
              : "입대일을 알려주세요"}
          </SvgText>
        </Layer>

        {/* 기준 트랙과 양 끝점 */}
        <Layer state={layer("track")}>
          <Line
            x1={HERO_TRACK.x1}
            y1={HERO_TRACK.y}
            x2={HERO_TRACK.x2}
            y2={HERO_TRACK.y}
            stroke={palette.hairline}
            strokeWidth={4}
            strokeLinecap="round"
          />
          <Circle
            cx={HERO_TRACK.x1}
            cy={HERO_TRACK.y}
            r={5}
            fill={palette.canvas}
            stroke={palette.hairline}
            strokeWidth={3}
          />
          <Circle
            cx={HERO_TRACK.x2}
            cy={HERO_TRACK.y}
            r={5}
            fill={palette.canvas}
            stroke={palette.hairline}
            strokeWidth={3}
          />
        </Layer>

        {/* 정기외박 주기 점 */}
        <Layer state={layer("cycle")}>
          {geo.cyclePoints.map((point, i) => (
            <Stagger key={point.date} index={i} step={55}>
              <Circle
                cx={point.x}
                cy={HERO_TRACK.y}
                r={3.5}
                fill={accent.line}
              />
            </Stagger>
          ))}
        </Layer>

        {/* 진행선과 현재 위치 */}
        <Layer state={layer("progress")}>
          <ProgressLine progress={geo.progress} color={palette.positive} />
          <ProgressHead
            x={geo.progressX}
            fill={palette.positive}
            ring={palette.canvas}
          />
        </Layer>

        {/* 진급 셰브론 */}
        <Layer state={layer("markers")}>
          {geo.markers.map((marker, i) => (
            <Stagger key={marker.rank} index={i} step={90}>
              <SvgText
                x={marker.x}
                y={HERO_LAYOUT.marker.labelY}
                fontSize={10}
                fontWeight="700"
                fill={accent.deep}
                textAnchor="middle"
              >
                {marker.label}
              </SvgText>
              <Path
                d={`M${marker.x - 5} ${HERO_LAYOUT.marker.chevronY + 3} L${marker.x} ${HERO_LAYOUT.marker.chevronY - 3} L${marker.x + 5} ${HERO_LAYOUT.marker.chevronY + 3}`}
                fill="none"
                stroke={accent.line}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Stagger>
          ))}
        </Layer>

        {/* 양 끝 날짜 */}
        <Layer state={layer("progress")}>
          <SvgText
            x={HERO_TRACK.x1}
            y={HERO_LAYOUT.capsY}
            fontSize={11}
            fontWeight="600"
            fill={palette.mute}
          >
            {geo.resolved ? fmt(geo.enlistedAt) : "입대"}
          </SvgText>
          <SvgText
            x={HERO_TRACK.x2}
            y={HERO_LAYOUT.capsY}
            fontSize={11}
            fontWeight="600"
            fill={palette.mute}
            textAnchor="end"
          >
            {geo.resolved ? fmt(geo.dischargeAt) : "전역"}
          </SvgText>
        </Layer>

        {/* 동료 노드 */}
        <Layer state={layer("nodes")}>
          {[-1, 0, 1].map((offset, i) => {
            const mine = props.inGroup || offset === 0;
            return (
              <Stagger key={offset} index={i} step={110}>
                <Circle
                  cx={HERO_VIEWBOX.width / 2 + offset * HERO_LAYOUT.nodes.gap}
                  cy={HERO_LAYOUT.nodes.y}
                  r={HERO_LAYOUT.nodes.radius}
                  fill={mine ? palette.primary : palette.canvas}
                  stroke={mine ? palette.positive : accent.line}
                  strokeWidth={2.5}
                />
              </Stagger>
            );
          })}
        </Layer>
      </Svg>
    </View>
  );
}

const useStyles = makeStyles(() => ({
  root: {
    width: "100%",
    // 히어로 뷰박스와 같은 가로세로비(360:200). 높이를 고정하면 좁은 기기에서
    // 그림이 잘리거나 위아래로 흰 띠가 생긴다.
    aspectRatio: HERO_VIEWBOX.width / HERO_VIEWBOX.height,
  },
}));
