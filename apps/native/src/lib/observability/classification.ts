export type HttpFailureClassification = "breadcrumb" | "report";

export function classifyHttpStatus(status: number): HttpFailureClassification {
  return status === 408 || status >= 500 ? "report" : "breadcrumb";
}

export function isIntentionalCancellation(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name === "AbortError" || candidate.name === "CanceledError") {
    return true;
  }
  const message =
    typeof candidate.message === "string"
      ? candidate.message.toLowerCase()
      : "";
  return /(?:aborted|cancelled|canceled)/.test(message);
}

/**
 * 전송 실패를 이슈로 올릴 것인가.
 *
 * `leftForeground`는 **요청이 나가 있는 동안 앱이 앞에서 내려갔는가**다. 내려갔다면
 * OS가 연결을 끊는다 — iOS는 앱을 서스펜드하면서 소켓을 정리하고, 그 실패가
 * "The network connection was lost."로 올라온다(Sentry LEAVE-NATIVE-4: 136초
 * 동안 열려 있던 달력 요청이 백그라운드에서 끊겼다). 고칠 것이 없는 정상 동작이라
 * 빵가루로만 남긴다. NetInfo는 이때도 online이라 말하므로 연결 상태로는 가려지지
 * 않는다.
 *
 * 메시지 문자열로 판단하지 않는다 — OS가 주는 문장은 기기 언어로 번역돼 온다.
 */
export function shouldReportTransportFailure(
  error: unknown,
  online: boolean | null,
  leftForeground = false,
): boolean {
  return (
    online !== false && !leftForeground && !isIntentionalCancellation(error)
  );
}

/** 업데이트 실패가 고칠 것 없는 정상 동작이었다면 그 이유. 아니면 null. */
export type ExpectedUpdateFailure = "offline" | "backgrounded";

/**
 * OTA 검사·내려받기 실패를 이슈로 올릴 것인가.
 *
 * 전송 실패와 같은 두 신호를 본다(`shouldReportTransportFailure`). 다른 점은 시작
 * 시각이 없다는 것이다 — expo-updates는 실행 직후에 스스로 시작하고 `useUpdates()`는
 * 결과만 준다. 그래서 "요청이 나가 있는 동안"을 "앱이 켜진 뒤로" 로 넓게 잡는다.
 * OTA 실패는 실행 직후에만 도착하므로 실제로 가려지는 창은 그만큼 좁다.
 *
 * 넓게 잡아도 진짜 사고는 남는다. 서명 실패·깨진 매니페스트처럼 고칠 것이 있는 실패는
 * 망이나 앞뒤와 무관하게 되풀이되므로, 앞에 둔 채로 켠 다음 실행에서 올라온다.
 */
export function expectedUpdateFailure(
  knownOffline: boolean,
  leftForeground: boolean,
): ExpectedUpdateFailure | null {
  if (knownOffline) return "offline";
  if (leftForeground) return "backgrounded";
  return null;
}
