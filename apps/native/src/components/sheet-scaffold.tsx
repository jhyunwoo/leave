/**
 * 시트 안쪽의 표준 구조 — 고정 헤더 + 스크롤 본문 + 고정 푸터.
 * 사용처: FormSheet를 쓰는 모든 시트.
 */

import type { ReactNode } from "react";
import {
  Platform,
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

const HEADER_MIN_HEIGHT = 58;

/**
 * 바텀시트 위쪽 드래그 인디케이터가 차지하는 높이.
 *
 * 이만큼을 헤더 '안쪽' 여백으로 잡아야 헤더 배경이 시트 맨 위 둥근 모서리까지
 * 이어진다. 바깥 여백으로 잡으면 그 틈으로 시스템 시트 배경이 비쳐, 콘텐츠가
 * 시트 위에 얹힌 직각 카드처럼 보인다(아이폰 기본 시트와 이질감이 나는 원인).
 * `FormSheet`(RN `Modal` pageSheet)에는 인디케이터가 없으므로 넘기지 않는다.
 *
 * iOS에서만 0이 아니다. 안드로이드(Material `ModalBottomSheet`)와 웹 구현은
 * 드래그 핸들 자리를 시트 쪽에서 이미 비워두므로 여기서 또 비우면 두 번 벌어진다.
 */
export const SHEET_GRABBER_INSET = Platform.OS === "ios" ? 16 : 0;

/**
 * 바텀시트 표면이 아래 안전 영역까지 내려앉는가.
 *
 * iOS 시트만 그렇다 — `native-bottom-sheet.ios.tsx`가 시트 안쪽 안전 영역을
 * 무시해 RN 표면을 시트 바닥까지 내린다. 안드로이드(Material `ModalBottomSheet`)와
 * 웹 구현은 시트 쪽에서 이미 그 자리를 비워두므로 여기서 또 비우면 두 번 벌어진다.
 */
export const SHEET_EXTENDS_UNDER_BOTTOM_INSET = Platform.OS === "ios";

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
  /** 헤더 위에 더 둘 여백. 바텀시트에서 드래그 인디케이터 자리를 비울 때 쓴다. */
  headerTopInset?: number;
  /**
   * 시트 표면이 아래 안전 영역까지 내려앉는가(`SHEET_EXTENDS_UNDER_BOTTOM_INSET`).
   *
   * 그런 시트에서는 표면과 시트 바닥 사이에 틈이 없는 대신, 홈 인디케이터를
   * 피하는 일이 콘텐츠 몫으로 넘어온다. 본문 맨 아래 항목이 인디케이터에 닿지
   * 않게 스크롤 콘텐츠 아래 여백을 그만큼 잡는다. 푸터가 있으면 푸터가 이미
   * 같은 여백을 잡으므로 본문에는 더하지 않는다.
   */
  extendsUnderBottomInset?: boolean;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const maxWidth = props.contentMaxWidth ?? layout.formContent;
  const headerTopInset = props.headerTopInset ?? 0;
  const contentBottomInset =
    props.extendsUnderBottomInset && !props.footer ? insets.bottom : 0;

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.header,
          headerTopInset > 0 && {
            paddingTop: headerTopInset,
            minHeight: HEADER_MIN_HEIGHT + headerTopInset,
          },
        ]}
      >
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
          contentBottomInset > 0 && { paddingBottom: contentBottomInset },
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
    minHeight: HEADER_MIN_HEIGHT,
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
  /**
   * `overflow: hidden`은 장식이 아니다. iOS RN의 `ScrollView`는 콘텐츠를 자기
   * 경계로 잘라내지 않아서, 스크롤 오프셋이 생기는 순간 본문이 위쪽 고정 헤더와
   * 아래쪽 푸터 '위로' 그려진다. 시트가 열리는 도중 키보드가 뜨면 UIKit이
   * 포커스된 입력을 보이려고 스크롤을 밀고, 그 오프셋이 그대로 남아 겹쳐 보였다.
   */
  scroll: { flex: 1, overflow: "hidden" },
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
