/**
 * 지표 하나를 크게 보여주는 위젯. 홈 화면 소·중·대형과 잠금화면 세 종류를 함께 그린다.
 *
 * ## 이 파일의 함수는 보통 함수가 아니다
 *
 * `'widget'` 지시어가 붙은 함수는 babel이 **함수 소스 문자열로 통째로 바꾼다**
 * (`babel-preset-expo`의 `widgets-plugin`). 그 문자열은 위젯 익스텐션 안의 별도
 * JS 번들에서 평가되는데, 그 번들에는 `@expo/ui/swift-ui`의 컴포넌트·모디파이어와
 * React/JSX 스텁만 전역으로 들어 있다.
 *
 * 그래서 **레이아웃 함수는 바깥 스코프를 참조할 수 없다.** 모듈 상수도, 다른 파일에서
 * import한 헬퍼도, 이 파일 위쪽에 선언한 함수도 안 된다 — 문자열에는 그 이름만 남고
 * 정의는 따라가지 않아, 위젯이 조용히 그려지지 않는다. 필요한 값은 전부 함수 안에 적는다.
 * (`@expo/ui`에서 가져온 이름만 예외다. 그 번들에 같은 이름의 전역으로 들어 있다.)
 *
 * 그 제약이 부담스럽지 않은 이유는 `payload.ts`가 이미 그릴 문자열까지 다 만들어
 * 두기 때문이다. 여기서 하는 일은 "어느 지표를 고를지"와 "어디에 놓을지"뿐이다.
 */

import {
  AccessoryWidgetBackground,
  Gauge,
  Text,
  VStack,
} from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { LeaveWidgetProps } from "./payload";

/** iOS 17+ 위젯 편집에서 고른 값. app.json의 `parameters.metric`과 짝이다. */
export type LeaveMetricConfiguration = { metric?: string };

function LeaveMetricLayout(
  props: LeaveWidgetProps,
  environment: WidgetEnvironment<LeaveMetricConfiguration>,
) {
  "widget";

  // 홈 화면 위젯은 라이트·다크 모두 진한 브랜드 그린 위에 흰 글씨를 얹는다.
  // 초록이 표면이 아니라 정체성이라 스킴에 따라 뒤집지 않는다 — 홈 화면 어디에
  // 놓여도 같은 덩어리로 보이는 편이 눈에 띈다.
  //
  // 값 자체는 theme.ts의 inkDeep·primary·primaryNeutral과 같지만, `widget`
  // 함수는 바깥 스코프를 볼 수 없어 리터럴로 적는다(파일 머리주석 참고).
  // #163300 위 대비: 흰색 13.9:1, 라임 9.5:1, 연초록 10.7:1 — 전부 AAA.
  const ink = "#ffffff";
  const mute = "#c5edab";
  const accent = "#9fe870";
  const canvas = "#163300";

  const family = environment.widgetFamily;
  const accessory =
    family === "accessoryCircular" ||
    family === "accessoryRectangular" ||
    family === "accessoryInline";

  // 잠금화면은 시스템이 색을 입힌다(vibrant). 여기서 칠하면 대비만 나빠진다.
  const strong = accessory ? undefined : accent;
  const soft = accessory ? undefined : mute;
  const body = accessory ? undefined : ink;

  const tint = (color: string | undefined) =>
    color ? [foregroundStyle(color)] : [];

  if (props.state !== "ready") {
    const message =
      props.state === "signedOut"
        ? "로그인하고 확인하세요"
        : "복무정보를 입력하세요";
    if (family === "accessoryInline") {
      return <Text modifiers={[widgetURL("leave:///")]}>리브</Text>;
    }
    return (
      <VStack
        spacing={4}
        modifiers={[
          padding({ top: 12, leading: 12, bottom: 12, trailing: 12 }),
          ...(accessory ? [] : [containerBackground(canvas, "widget")]),
          widgetURL("leave:///"),
          accessibilityLabel(`리브. ${message}`),
        ]}
      >
        <Text modifiers={[font({ size: 13, weight: "bold" }), ...tint(strong)]}>
          리브
        </Text>
        <Text
          modifiers={[
            font({ size: 14 }),
            ...tint(soft),
            lineLimit(2),
            minimumScaleFactor(0.7),
          ]}
        >
          {message}
        </Text>
      </VStack>
    );
  }

  // 위젯을 길게 눌러 고른 지표 → 인앱 설정의 기본 지표 → 값이 있는 첫 지표.
  // Android에는 위젯별 편집이 없어 두 번째 단계가 늘 쓰이고, iOS에서도 고른 지표에
  // 보여줄 값이 없을 때(그룹 미가입, 병장) 여기로 떨어진다.
  const order = [
    "discharge",
    "dutyDays",
    "progress",
    "nextLeave",
    "headroom",
    "balance",
    "promotion",
  ];
  const chosen = environment.configuration?.metric;
  const metrics = props.metrics as Record<
    string,
    LeaveWidgetProps["metrics"][keyof LeaveWidgetProps["metrics"]]
  >;
  let key: string | null = null;
  if (chosen && metrics[chosen]) key = chosen;
  else if (metrics[props.defaultMetric]) key = props.defaultMetric;
  else {
    for (const candidate of order) {
      if (metrics[candidate]) {
        key = candidate;
        break;
      }
    }
  }

  const links: Record<string, string> = {
    discharge: "leave:///service-progress",
    dutyDays: "leave:///service-progress",
    progress: "leave:///service-progress",
    nextLeave: "leave:///leaves",
    headroom: "leave:///",
    balance: "leave:///leave-grants",
    promotion: "leave:///service-progress",
  };
  const link = key ? (links[key] ?? "leave:///") : "leave:///";
  const metric = key ? metrics[key] : undefined;

  if (!metric) {
    // 고른 지표에 값이 없다(그룹 미가입, 예정된 휴가 없음, 병장). 빈 칸을
    // 보여주느니 왜 없는지 말한다.
    if (family === "accessoryInline") {
      return <Text modifiers={[widgetURL(link)]}>리브</Text>;
    }
    return (
      <VStack
        spacing={4}
        modifiers={[
          padding({ top: 12, leading: 12, bottom: 12, trailing: 12 }),
          ...(accessory ? [] : [containerBackground(canvas, "widget")]),
          widgetURL(link),
          accessibilityLabel("리브. 아직 보여줄 값이 없어요"),
        ]}
      >
        <Text modifiers={[font({ size: 13, weight: "bold" }), ...tint(strong)]}>
          리브
        </Text>
        <Text
          modifiers={[
            font({ size: 14 }),
            ...tint(soft),
            lineLimit(2),
            minimumScaleFactor(0.7),
          ]}
        >
          아직 보여줄 값이 없어요
        </Text>
      </VStack>
    );
  }

  const timerInterval =
    typeof metric.timerStartAt === "number" &&
    typeof metric.timerEndAt === "number"
      ? {
          lower: new Date(metric.timerStartAt),
          upper: new Date(metric.timerEndAt),
        }
      : undefined;

  if (family === "accessoryInline") {
    return (
      <Text modifiers={[widgetURL(link), accessibilityLabel(metric.spoken)]}>
        {metric.compact}
      </Text>
    );
  }

  if (family === "accessoryCircular") {
    // 게이지를 그릴 수 있는 지표(복무율·출타 여유)는 원형이 훨씬 잘 읽힌다.
    // 나머지 지표는 `gauge` 키 자체가 없다 — payload.ts의 "여기에 null을 넣지 마라" 참고.
    if (typeof metric.gauge === "number") {
      return (
        <Gauge
          value={metric.gauge}
          min={0}
          max={1}
          currentValueLabel={
            <Text
              timerInterval={timerInterval}
              modifiers={[font({ size: 13, weight: "semibold" })]}
            >
              {metric.value}
            </Text>
          }
          modifiers={[
            gaugeStyle("circular"),
            widgetURL(link),
            accessibilityLabel(metric.spoken),
          ]}
        />
      );
    }
    return (
      <VStack
        spacing={0}
        modifiers={[widgetURL(link), accessibilityLabel(metric.spoken)]}
      >
        <AccessoryWidgetBackground />
        <Text modifiers={[font({ size: 10 })]}>{metric.label}</Text>
        <Text
          timerInterval={timerInterval}
          modifiers={[
            font({ size: 15, weight: "bold" }),
            minimumScaleFactor(0.6),
          ]}
        >
          {metric.value}
        </Text>
      </VStack>
    );
  }

  if (family === "accessoryRectangular") {
    return (
      <VStack
        alignment="leading"
        spacing={1}
        modifiers={[widgetURL(link), accessibilityLabel(metric.spoken)]}
      >
        <Text modifiers={[font({ size: 12, weight: "semibold" })]}>
          {metric.label}
        </Text>
        <Text
          timerInterval={timerInterval}
          modifiers={[font({ size: 20, weight: "bold" })]}
        >
          {metric.value}
        </Text>
        {metric.caption ? (
          <Text modifiers={[font({ size: 11 }), lineLimit(1)]}>
            {metric.caption}
          </Text>
        ) : null}
      </VStack>
    );
  }

  // 홈 화면 세 크기는 같은 배치(라벨 → 값 → 캡션)를 크기만 바꿔 쓴다. 라벨은
  // 라임 강조, 값은 흰색, 캡션은 연초록 — 값이 가장 밝고 크게 읽히도록 둔다.
  //
  // ## 안쪽 여백은 시스템에 맡긴다
  //
  // WidgetKit이 iOS 17부터 위젯 내용에 기본 여백 16pt를 이미 넣는다
  // (`app.json`의 `contentMarginsDisabled: false`). 그 위에 padding을 또 얹으면
  // 158pt짜리 소형 위젯에서 쓸 수 있는 폭이 98pt로 줄어 절반 넘게가 여백이었고,
  // 높이는 더 빠듯해 캡션 두 줄까지 넣으면 값이 커질 자리가 없었다. 그래서 안쪽
  // 여백은 시스템 것만 쓰고, 내용은 frame으로 남은 영역을 가로·세로 다 차지한다
  // (꼬리 Spacer 대신 `topLeading`을 쓰는 이유도 같다 — Spacer의 기본 최소 간격이
  // 값 글자가 쓸 높이를 또 먹는다).
  //
  // 되찾은 자리는 전부 값 글자에 준다. 대신 `minimumScaleFactor`의 바닥은 함께
  // 내려 둔다 — "3시간 20분 05초"(복귀 타이머)처럼 긴 값은 예전만큼 작아질 수
  // 있어야 잘리지 않는다. 짧은 값일수록 크게 나오고 긴 값은 알아서 줄어든다.
  if (family === "systemLarge") {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          containerBackground(canvas, "widget"),
          frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" }),
          widgetURL(link),
          accessibilityLabel(`${metric.label}. ${metric.spoken}`),
        ]}
      >
        <Text modifiers={[font({ size: 20, weight: "bold" }), ...tint(strong)]}>
          {metric.label}
        </Text>
        <Text
          timerInterval={timerInterval}
          modifiers={[
            font({ size: 112, weight: "heavy" }),
            ...tint(body),
            lineLimit(1),
            minimumScaleFactor(0.28),
          ]}
        >
          {metric.value}
        </Text>
        {metric.caption ? (
          <Text
            modifiers={[
              font({ size: 17 }),
              ...tint(soft),
              lineLimit(2),
              minimumScaleFactor(0.8),
            ]}
          >
            {metric.caption}
          </Text>
        ) : null}
      </VStack>
    );
  }

  if (family === "systemMedium") {
    return (
      <VStack
        alignment="leading"
        spacing={4}
        modifiers={[
          containerBackground(canvas, "widget"),
          frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" }),
          widgetURL(link),
          accessibilityLabel(`${metric.label}. ${metric.spoken}`),
        ]}
      >
        <Text modifiers={[font({ size: 15, weight: "bold" }), ...tint(strong)]}>
          {metric.label}
        </Text>
        <Text
          timerInterval={timerInterval}
          modifiers={[
            font({ size: 60, weight: "heavy" }),
            ...tint(body),
            lineLimit(1),
            minimumScaleFactor(0.32),
          ]}
        >
          {metric.value}
        </Text>
        {metric.caption ? (
          <Text
            modifiers={[
              font({ size: 15 }),
              ...tint(soft),
              lineLimit(1),
              minimumScaleFactor(0.8),
            ]}
          >
            {metric.caption}
          </Text>
        ) : null}
      </VStack>
    );
  }

  // systemSmall — 홈 화면. **여기가 마지막 fall-through다.** 안드로이드에는
  // 위젯 환경 맵이 없어 `family`가 undefined로 오므로 반드시 남겨 둔다.
  return (
    <VStack
      alignment="leading"
      spacing={2}
      modifiers={[
        containerBackground(canvas, "widget"),
        frame({ maxWidth: 1000, maxHeight: 1000, alignment: "topLeading" }),
        widgetURL(link),
        accessibilityLabel(`${metric.label}. ${metric.spoken}`),
      ]}
    >
      <Text modifiers={[font({ size: 13, weight: "bold" }), ...tint(strong)]}>
        {metric.label}
      </Text>
      <Text
        timerInterval={timerInterval}
        modifiers={[
          font({ size: 54, weight: "heavy" }),
          ...tint(body),
          lineLimit(1),
          minimumScaleFactor(0.3),
        ]}
      >
        {metric.value}
      </Text>
      {metric.caption ? (
        <Text
          modifiers={[
            font({ size: 12 }),
            ...tint(soft),
            lineLimit(2),
            minimumScaleFactor(0.8),
          ]}
        >
          {metric.caption}
        </Text>
      ) : null}
    </VStack>
  );
}

export const LeaveMetricWidget = createWidget<
  LeaveWidgetProps,
  LeaveMetricConfiguration
>("LeaveMetric", LeaveMetricLayout);
