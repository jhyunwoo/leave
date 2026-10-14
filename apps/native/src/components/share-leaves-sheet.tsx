/**
 * 한 달치 내 휴가를 SNS에 올릴 이미지로 만들어 공유한다.
 *
 * 사용처: 내 휴가 화면의 공유 버튼.
 *
 * 배치는 @leave/shared의 buildLeaveShareCard가 정하고 여기서는 SVG로 옮겨 그린다(웹은
 * 같은 배치를 캔버스로 그린다). 미리보기는 화면 폭으로 줄여 그리고, 공유할 때는
 * `toDataURL`에 원래 크기를 넘겨 1080×1350 PNG로 뽑는다.
 */

import type { MyLeave } from "@leave/client";
import { shiftMonth, splitMonth } from "@leave/shared/calendar";
import { todayInSeoul } from "@leave/shared/dates";
import {
  buildLeaveShareCard,
  defaultShareMonth,
} from "@leave/shared/share-card";
import { useMemo, useRef, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { Button } from "@/components/button";
import { FormSheet } from "@/components/form-sheet";
import { shareImage } from "@/lib/share-image";
import { makeStyles, spacing } from "@/theme";

/** 미리보기 최대 폭. 아이패드에서 시트를 꽉 채우면 한눈에 안 들어온다. */
const PREVIEW_MAX_WIDTH = 420;

export function ShareLeavesSheet(props: {
  visible: boolean;
  leaves: readonly MyLeave[];
  onClose: () => void;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [month, setMonth] = useState(() =>
    defaultShareMonth(props.leaves, todayInSeoul()),
  );
  const card = useMemo(
    () => buildLeaveShareCard({ month, leaves: props.leaves }),
    [month, props.leaves],
  );
  const svgRef = useRef<Svg>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const { year, monthNum } = splitMonth(month);
  const previewWidth = Math.min(
    windowWidth - spacing.xl * 2,
    PREVIEW_MAX_WIDTH,
  );
  const empty = card.outDays === 0;

  const share = () => {
    const svg = svgRef.current;
    if (!svg) return;
    setStatus("working");
    svg.toDataURL(
      (base64) => {
        shareImage(base64, `leave-${month}.png`).then(
          () => setStatus("idle"),
          () => setStatus("error"),
        );
      },
      { width: card.width, height: card.height },
    );
  };

  return (
    <FormSheet isPresented={props.visible} onDismiss={props.onClose}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} accessibilityRole="header">
            휴가 일정 공유
          </Text>
          <Button
            title="닫기"
            variant="ghost"
            size="sm"
            onPress={props.onClose}
          />
        </View>

        <View style={styles.monthRow}>
          <Button
            title="이전 달"
            icon="left"
            variant="secondary"
            size="sm"
            onPress={() => setMonth((value) => shiftMonth(value, -1))}
          />
          <Text style={styles.month} accessibilityLiveRegion="polite">
            {year}년 {monthNum}월
          </Text>
          <Button
            title="다음 달"
            icon="right"
            variant="secondary"
            size="sm"
            onPress={() => setMonth((value) => shiftMonth(value, 1))}
          />
        </View>

        <View
          style={[styles.preview, { width: previewWidth }]}
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${year}년 ${monthNum}월 휴가 일정 이미지 미리보기`}
        >
          <Svg
            ref={svgRef}
            width={previewWidth}
            height={(previewWidth * card.height) / card.width}
            viewBox={`0 0 ${card.width} ${card.height}`}
          >
            {card.shapes.map((shape, index) =>
              shape.kind === "rect" ? (
                <Rect
                  key={index}
                  x={shape.x}
                  y={shape.y}
                  width={shape.width}
                  height={shape.height}
                  rx={shape.radius}
                  ry={shape.radius}
                  fill={shape.fill}
                />
              ) : (
                <SvgText
                  key={index}
                  x={shape.x}
                  y={shape.y}
                  fontSize={shape.size}
                  fontWeight={String(shape.weight)}
                  fill={shape.fill}
                  textAnchor={shape.anchor}
                >
                  {shape.text}
                </SvgText>
              ),
            )}
          </Svg>
        </View>

        <Text style={styles.caption}>
          {empty
            ? "이 달에는 나가는 일정이 없어요. 다른 달을 골라주세요."
            : "초안·반려·취소한 일정은 이미지에 넣지 않아요."}
        </Text>
        {status === "error" ? (
          <Text style={styles.error} accessibilityRole="alert">
            이미지를 공유하지 못했어요. 다시 시도해주세요.
          </Text>
        ) : null}
        <Button
          title={status === "working" ? "이미지 만드는 중" : "이미지로 공유"}
          icon="share"
          disabled={empty}
          loading={status === "working"}
          onPress={share}
        />
      </ScrollView>
    </FormSheet>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  content: { padding: spacing.xl, gap: spacing.lg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 22, fontWeight: "800", color: colors.ink },
  monthRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  month: { fontSize: 17, fontWeight: "700", color: colors.ink },
  preview: { alignSelf: "center", borderRadius: 16, overflow: "hidden" },
  caption: { fontSize: 13, lineHeight: 19, color: colors.body },
  error: { fontSize: 13, color: colors.negative },
}));
