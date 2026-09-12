/**
 * 앱 바깥 주소(공개 문서·법령 원문)를 연다.
 *
 * ## 왜 감싸는가
 *
 * `Linking.openURL`은 이 자리에서 실제로 거부당한다. https라도 기기에 그 주소를 열 앱이
 * 없으면 promise가 reject된다 — Screen Time·MDM으로 브라우저가 잠긴 기기가 그렇고,
 * 심사용·기업 관리 기기에서 특히 그렇다. `void Linking.openURL(...)`로 흘려보내면
 * 그 reject가 그대로 unhandled rejection이 되어 Sentry에 쌓이고(LEAVE-NATIVE-3),
 * 화면에서는 링크를 눌렀는데 아무 일도 일어나지 않는다. 사용자는 앱이 멈춘 줄 안다.
 *
 * 그래서 순서를 둔다. ① 앱 안 브라우저(SFSafariViewController/Custom Tabs)로 연다 —
 * 앱을 떠나지 않아 돌아오기도 쉽다. ② 그것을 쓸 수 없는 기기에서는 시스템 브라우저로
 * 한 번 더 시도한다. ③ 둘 다 막혔으면 **주소를 알려준다.** 문서를 열 수 없다는 사실과
 * 그 주소는 사용자가 알아야 한다(개인정보처리방침·약관은 Apple 5.1.1(i)의 요구이기도
 * 하다).
 */

import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import { notify } from "./dialog";

export async function openExternalLink(
  url: string,
  label: string,
): Promise<void> {
  try {
    await WebBrowser.openBrowserAsync(url);
    return;
  } catch {
    // 앱 안 브라우저를 쓸 수 없는 기기가 있다 — 시스템 브라우저로 한 번 더 본다.
  }

  try {
    await Linking.openURL(url);
  } catch {
    notify(
      "브라우저를 열 수 없어요",
      `이 기기에서 브라우저가 막혀 있어요. 다른 기기에서 아래 주소를 열어주세요.\n\n${label}\n${url}`,
    );
  }
}
