/**
 * 확인·알림 대화상자 — 웹(Expo Web)용 구현.
 * 네이티브에서는 `dialog.native.ts`(시스템 Alert)로 바뀐다.
 *
 * react-native-web의 `Alert.alert`는 본문이 비어 있는 빈 구현이라, 웹에서 그대로
 * 쓰면 삭제 확인이 아무것도 묻지 않고 사라진다. 브라우저 기본 대화상자로 대신한다.
 * 확인 버튼 문구를 정할 수 없으므로, 무엇을 하는지는 제목·본문에 담아야 한다.
 */

/** 알리기만 하면 되는 경우. 사용자가 고를 것이 없다. */
export function notify(title: string, message?: string): void {
  globalThis.alert(message ? `${title}\n\n${message}` : title);
}

/** 되돌리기 어려운 동작을 묻는다. 확인을 누르면 true. */
export function confirmAction(options: {
  title: string;
  message?: string;
  /** 확인 버튼 문구. iOS/Android에서만 보인다. */
  confirmLabel: string;
  destructive?: boolean;
}): Promise<boolean> {
  const body = options.message
    ? `${options.title}\n\n${options.message}`
    : options.title;
  return Promise.resolve(globalThis.confirm(body));
}

export type LeaveHoldAction = "edit" | "delete" | "cancel";

export function chooseLeaveHoldAction(title: string): Promise<LeaveHoldAction> {
  const answer = globalThis.prompt(
    `${title}\n\n수정 또는 삭제를 입력해주세요.`,
  );
  if (answer === "수정") return Promise.resolve("edit");
  if (answer === "삭제") return Promise.resolve("delete");
  return Promise.resolve("cancel");
}
