/**
 * 한 달치 내 휴가를 SNS에 올릴 이미지로 만들어 공유한다.
 *
 * 사용처: 내 휴가 화면의 공유 버튼.
 *
 * 배치는 @leave/shared의 buildLeaveShareCard가 정하고 여기서는 SVG로 옮겨 그린다(웹은
 * 같은 배치를 캔버스로 그린다).
 *
 * 내보내기는 미리보기와 다른, 1080px 폭으로 놓인 SVG에서 한다. react-native-svg의
 * `toDataURL({ width, height })`는 비트맵만 키우고 그림은 화면에 놓인 크기로 그려서,
 * 미리보기에서 뽑으면 큰 PNG의 왼쪽 위 구석에만 그림이 들어간다(두 플랫폼 모두).
 * 크기 옵션 없이 뽑으면 놓인 크기 × 화면 배율로 그리므로, 폭을 1080 / 배율로 놓는다.
 */

import type { MyLeave } from "@leave/client";
import { shiftMonth, splitMonth } from "@leave/shared/calendar";
import { todayInSeoul } from "@leave/shared/dates";
import {
  buildLeaveShareCard,
  defaultShareMonth,
  SHARE_BACKGROUNDS,
  type ShareBackgroundId,
  type ShareCard,
} from "@leave/shared/share-card";
import { forwardRef, useMemo, useRef, useState } from "react";
import {
  PixelRatio,
  Pressable,
  ScrollView,
  Switch,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Rect, Text as SvgText } from "react-native-svg";
import { Button } from "@/components/button";
import { FormSheet } from "@/components/form-sheet";
import { shareImage } from "@/lib/share-image";
import { makeStyles, spacing, useColors } from "@/theme";

/** 미리보기 최대 폭. 아이패드에서 시트를 꽉 채우면 한눈에 안 들어온다. */
const PREVIEW_MAX_WIDTH = 420;

const CardSvg = forwardRef<Svg, { card: ShareCard; width: number }>(
  function CardSvg({ card, width }, ref) {
    return (
      <Svg
        ref={ref}
        width={width}
        height={(width * card.height) / card.width}
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
    );
  },
);

export function ShareLeavesSheet(props: {
  visible: boolean;
  leaves: readonly MyLeave[];
  onClose: () => void;
}) {
  const styles = useStyles();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const [month, setMonth] = useState(() =>
    defaultShareMonth(props.leaves, todayInSeoul()),
  );
  const [background, setBackground] = useState<ShareBackgroundId>("green");
  const [showOutings, setShowOutings] = useState(false);
  const card = useMemo(
    () =>
      buildLeaveShareCard({
        month,
        leaves: props.leaves,
        background,
        showOutings,
      }),
    [month, props.leaves, background, showOutings],
  );
  const exportRef = useRef<Svg>(null);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const { year, monthNum } = splitMonth(month);
  const previewWidth = Math.min(
    windowWidth - spacing.xl * 2,
    PREVIEW_MAX_WIDTH,
  );
  const empty = card.outDays === 0;

  const share = () => {
    const svg = exportRef.current;
    if (!svg) return;
    setStatus("working");
    svg.toDataURL((base64) => {
      shareImage(base64, `leave-${month}.png`).then(
        () => setStatus("idle"),
        () => setStatus("error"),
      );
    });
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
          {/* 내보내기 전용. 미리보기 뒤에 깔려 잘려 보이지 않는다. */}
          <View
            style={styles.exportLayer}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <CardSvg
              ref={exportRef}
              card={card}
              width={card.width / PixelRatio.get()}
            />
          </View>
          <CardSvg card={card} width={previewWidth} />
        </View>

        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>배경</Text>
          <View style={styles.swatches} accessibilityRole="radiogroup">
            {SHARE_BACKGROUNDS.map((option) => {
              const selected = option.id === background;
              return (
                <Pressable
                  key={option.id}
                  accessibilityRole="radio"
                  accessibilityLabel={`${option.label} 배경`}
                  accessibilityState={{ selected }}
                  hitSlop={4}
                  onPress={() => setBackground(option.id)}
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: option.fill,
                      borderColor: selected ? colors.ink : colors.hairline,
                      borderWidth: selected ? 3 : 1,
                    },
                  ]}
                />
              );
            })}
          </View>
        </View>

        <View style={styles.optionRow}>
          <Text style={styles.optionLabel}>외출도 표시</Text>
          <Switch
            accessibilityLabel="외출도 표시"
            value={showOutings}
            onValueChange={setShowOutings}
            trackColor={{ true: colors.primary, false: colors.hairline }}
          />
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
  exportLayer: { position: "absolute", top: 0, left: 0 },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  optionLabel: { fontSize: 15, fontWeight: "600", color: colors.ink },
  swatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    flexShrink: 1,
    gap: spacing.sm,
  },
  // 36 + hitSlop 4×2 = 44pt 탭 영역.
  swatch: { width: 36, height: 36, borderRadius: 18 },
  caption: { fontSize: 13, lineHeight: 19, color: colors.body },
  error: { fontSize: 13, color: colors.negative },
}));
