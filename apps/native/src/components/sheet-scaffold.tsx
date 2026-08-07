/**
 * 시트 안쪽의 표준 구조 — 고정 헤더 + 스크롤 본문 + 고정 푸터.
 * 사용처: FormSheet를 쓰는 모든 시트.
 */

import type { ReactNode } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "@/theme";
import { Button } from "./button";

/**
 * 네이티브 바텀시트 안의 RN 콘텐츠를 Apple 폼 시트 구조로 정렬한다.
 * 헤더와 저장 버튼은 고정하고, 입력 영역만 스크롤되게 해 시트가 커져도
 * 주요 동작의 의미와 위치가 바뀌지 않는다.
 */
export function SheetScaffold(props: {
  title: string;
  onClose: () => void;
  closeTestID?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title} selectable>
          {props.title}
        </Text>
        <Button
          title="닫기"
          variant="ghost"
          size="sm"
          onPress={props.onClose}
          style={styles.closeButton}
          testID={props.closeTestID}
        />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, props.contentContainerStyle]}
        contentInsetAdjustmentBehavior="never"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {props.children}
      </ScrollView>

      {props.footer ? (
        <View
          style={[
            styles.footer,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          {props.footer}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  header: {
    minHeight: 58,
    paddingHorizontal: spacing.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
    backgroundColor: colors.canvas,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  title: { flex: 1, fontSize: 20, fontWeight: "700", color: colors.ink },
  closeButton: { alignSelf: "center" },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  footer: {
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.canvas,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.hairline,
  },
});
