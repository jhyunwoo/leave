/**
 * 확인·알림 대화상자 — iOS/Android용 시스템 구현.
 * 웹에서는 `dialog.ts`(브라우저 기본 대화상자)로 바뀐다.
 */

import { Alert } from "react-native";

/** 알리기만 하면 되는 경우. 사용자가 고를 것이 없다. */
export function notify(title: string, message?: string): void {
  Alert.alert(title, message);
}

/**
 * 되돌리기 어려운 동작을 묻는다. 확인을 누르면 true.
 *
 * 시스템 대화상자 밖을 눌러 닫는 경우(Android)도 "안 함"으로 본다.
 */
export function confirmAction(options: {
  title: string;
  message?: string;
  /** 확인 버튼 문구. iOS/Android에서만 보인다. */
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(
      options.title,
      options.message,
      [
        { text: "취소", style: "cancel", onPress: () => resolve(false) },
        {
          text: options.confirmLabel,
          style: options.destructive ? "destructive" : "default",
          onPress: () => resolve(true),
        },
      ],
      { onDismiss: () => resolve(false) },
    );
  });
}
