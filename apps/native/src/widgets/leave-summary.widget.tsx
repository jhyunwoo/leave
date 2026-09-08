/**
 * 여러 지표를 한 화면에 놓는 요약 위젯. 중형과 대형.
 *
 * 어떤 지표를 넣을지는 인앱 "위젯 설정"에서 고르고, `props.summaryMetrics`로 온다.
 * 중형은 자리가 좁아 앞의 세 개까지만 그린다.
 *
 * 레이아웃 함수가 바깥 스코프를 참조할 수 없는 이유는 leave-metric.widget.tsx의
 * 머리주석에 적어 두었다. 여기서도 같은 제약이 그대로 적용된다.
 */

import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  accessibilityLabel,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  lineLimit,
  minimumScaleFactor,
  padding,
  widgetURL,
} from "@expo/ui/swift-ui/modifiers";
import { createWidget, type WidgetEnvironment } from "expo-widgets";
import type { LeaveWidgetProps } from "./payload";

function LeaveSummaryLayout(
  props: LeaveWidgetProps,
  environment: WidgetEnvironment,
) {
  "widget";

  // 지표 위젯과 같은 팔레트를 쓴다 — 라이트·다크 모두 진한 브랜드 그린 배경에
  // 흰 값, 라임 강조, 연초록 보조. 이유와 대비 수치는 leave-metric.widget.tsx에.
  const ink = "#ffffff";
  const mute = "#c5edab";
  const accent = "#9fe870";
  const canvas = "#163300";

  const shell = [
    padding({ top: 14, leading: 16, bottom: 14, trailing: 16 }),
    containerBackground(canvas, "widget"),
    widgetURL("leave:///"),
  ];

  if (props.state !== "ready") {
    const message =
      props.state === "signedOut"
        ? "로그인하면 전역일과 휴가를 여기서 바로 볼 수 있어요"
        : "복무정보를 입력하면 전역일과 휴가를 여기서 바로 볼 수 있어요";
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[...shell, accessibilityLabel(`리브. ${message}`)]}
      >
        <Text
          modifiers={[
            font({ size: 14, weight: "bold" }),
            foregroundStyle(accent),
          ]}
        >
          리브
        </Text>
        <Text
          modifiers={[
            font({ size: 15 }),
            foregroundStyle(mute),
            lineLimit(3),
            minimumScaleFactor(0.8),
          ]}
        >
          {message}
        </Text>
        <Spacer />
      </VStack>
    );
  }

  const metrics = props.metrics as Record<
    string,
    LeaveWidgetProps["metrics"][keyof LeaveWidgetProps["metrics"]]
  >;
  const large = environment.widgetFamily === "systemLarge";
  // 값이 없는 지표는 빈 칸을 남기지 않고 건너뛴다.
  const chosen = props.summaryMetrics.filter((key) => metrics[key]);
  const shown = large ? chosen : chosen.slice(0, 3);

  if (shown.length === 0) {
    return (
      <VStack
        alignment="leading"
        spacing={6}
        modifiers={[
          ...shell,
          accessibilityLabel("리브. 아직 보여줄 값이 없어요"),
        ]}
      >
        <Text
          modifiers={[
            font({ size: 14, weight: "bold" }),
            foregroundStyle(accent),
          ]}
        >
          리브
        </Text>
        <Text modifiers={[font({ size: 15 }), foregroundStyle(mute)]}>
          아직 보여줄 값이 없어요
        </Text>
        <Spacer />
      </VStack>
    );
  }

  const spoken = shown.map((key) => metrics[key]!.spoken).join(" ");

  // 대형은 한 줄에 하나씩 캡션까지, 중형은 가로로 나란히 값만.
  if (large) {
    return (
      <VStack
        alignment="leading"
        spacing={10}
        modifiers={[...shell, accessibilityLabel(`리브. ${spoken}`)]}
      >
        <Text
          modifiers={[
            font({ size: 14, weight: "bold" }),
            foregroundStyle(accent),
          ]}
        >
          리브
        </Text>
        {shown.map((key) => {
          const metric = metrics[key]!;
          const timerInterval =
            typeof metric.timerStartAt === "number" &&
            typeof metric.timerEndAt === "number"
              ? {
                  lower: new Date(metric.timerStartAt),
                  upper: new Date(metric.timerEndAt),
                }
              : undefined;
          return (
            <HStack key={key} alignment="firstTextBaseline" spacing={8}>
              <VStack alignment="leading" spacing={1}>
                <Text
                  modifiers={[
                    font({ size: 14, weight: "semibold" }),
                    foregroundStyle(mute),
                  ]}
                >
                  {metric.label}
                </Text>
                {metric.caption ? (
                  <Text
                    modifiers={[
                      font({ size: 12 }),
                      foregroundStyle(mute),
                      lineLimit(1),
                    ]}
                  >
                    {metric.caption}
                  </Text>
                ) : null}
              </VStack>
              <Spacer />
              <Text
                timerInterval={timerInterval}
                modifiers={[
                  font({ size: 28, weight: "heavy" }),
                  foregroundStyle(ink),
                  lineLimit(1),
                  minimumScaleFactor(0.6),
                ]}
              >
                {metric.value}
              </Text>
            </HStack>
          );
        })}
        <Spacer />
      </VStack>
    );
  }

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[...shell, accessibilityLabel(`리브. ${spoken}`)]}
    >
      <Text
        modifiers={[
          font({ size: 14, weight: "bold" }),
          foregroundStyle(accent),
        ]}
      >
        리브
      </Text>
      <HStack alignment="top" spacing={12}>
        {shown.map((key) => {
          const metric = metrics[key]!;
          const timerInterval =
            typeof metric.timerStartAt === "number" &&
            typeof metric.timerEndAt === "number"
              ? {
                  lower: new Date(metric.timerStartAt),
                  upper: new Date(metric.timerEndAt),
                }
              : undefined;
          return (
            <VStack
              key={key}
              alignment="leading"
              spacing={2}
              modifiers={[frame({ maxWidth: 1000, alignment: "leading" })]}
            >
              <Text
                timerInterval={timerInterval}
                modifiers={[
                  font({ size: 13, weight: "semibold" }),
                  foregroundStyle(mute),
                  lineLimit(1),
                ]}
              >
                {metric.label}
              </Text>
              <Text
                modifiers={[
                  font({ size: 30, weight: "heavy" }),
                  foregroundStyle(ink),
                  lineLimit(1),
                  minimumScaleFactor(0.5),
                ]}
              >
                {metric.value}
              </Text>
            </VStack>
          );
        })}
      </HStack>
      <Spacer />
    </VStack>
  );
}

export const LeaveSummaryWidget = createWidget<LeaveWidgetProps>(
  "LeaveSummary",
  LeaveSummaryLayout,
);
