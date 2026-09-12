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
