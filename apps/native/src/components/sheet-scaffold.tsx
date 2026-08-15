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
import { layout, makeStyles, spacing } from "@/theme";
import { Button } from "./button";

/**
 * 네이티브 바텀시트 안의 RN 콘텐츠를 Apple 폼 시트 구조로 정렬한다.
 * 헤더와 저장 버튼은 고정하고, 입력 영역만 스크롤되게 해 시트가 커져도
 * 주요 동작의 의미와 위치가 바뀌지 않는다.
 *
 * 본문과 푸터에는 최대 폭을 건다. 안드로이드 태블릿에서 `pageSheet`은 전체 화면
 * 다이얼로그가 되는데, 그대로 두면 입력칸 하나가 1200px로 늘어난다. 좁은 화면에서는
 * 화면이 이 상한보다 좁아 아무 일도 일어나지 않는다.
 */
export function SheetScaffold(props: {
  title: string;
  onClose: () => void;
  closeTestID?: string;
  children: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** 본문 최대 폭. 기본은 폼 한 벌 기준. 두 열을 쓰는 폼만 넓힌다. */
  contentMaxWidth?: number;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const maxWidth = props.contentMaxWidth ?? layout.formContent;

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
        contentContainerStyle={[
          styles.content,
          { maxWidth },
          props.contentContainerStyle,
        ]}
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
          <View style={[styles.footerInner, { maxWidth }]}>{props.footer}</View>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles(({ colors }) => ({
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
    width: "100%",
    alignSelf: "center",
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
  footerInner: { width: "100%", alignSelf: "center" },
}));
