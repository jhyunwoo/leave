/**
 * 확인·알림 대화상자 — iOS/Android용 시스템 구현.
 * 웹에서는 `dialog.ts`(브라우저 기본 대화상자)로 바뀐다.
 */

import { Alert, Platform, type AlertButton } from "react-native";

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

export type LeaveHoldAction = "edit" | "delete" | "cancel";

/**
 * 달력 칩을 가만히 누르고 있을 때 손을 떼기 전에 여는 편집 메뉴.
 *
 * **버튼 순서가 플랫폼마다 다르다.** iOS는 배열 순서대로 그리고 `cancel`을 맨 아래에
 * 붙이지만, Android는 배열을 **끝에서 pop해** 마지막 항목을 `buttonPositive`
 * (오른쪽·강조)로 만든다(RN `Libraries/Alert/Alert.js`). 게다가
 * `style: "destructive"`는 Android에서 무시돼 빨갛지도 않다. 그래서 한 배열을 그대로
 * 쓰면 **삭제가 사용자가 습관적으로 누르는 확인 버튼 자리**에 놓인다.
 *
 * 확인 자리에는 되돌릴 수 있는 쪽(수정)을 둔다. 확인 대화상자(`confirmAction`)는
 * 반대로 마지막이 확인이어야 맞으므로 그쪽은 손대지 않는다.
 */
export function chooseLeaveHoldAction(title: string): Promise<LeaveHoldAction> {
  return new Promise((resolve) => {
    const cancel: AlertButton = {
      text: "취소",
      style: "cancel",
      onPress: () => resolve("cancel"),
    };
    const edit: AlertButton = { text: "수정", onPress: () => resolve("edit") };
    const remove: AlertButton = {
      text: "삭제",
      style: "destructive",
      onPress: () => resolve("delete"),
    };
    Alert.alert(
      title,
      "휴가 작업을 선택하세요.",
      Platform.OS === "android"
        ? [cancel, remove, edit]
        : [cancel, edit, remove],
      { onDismiss: () => resolve("cancel") },
    );
  });
}
