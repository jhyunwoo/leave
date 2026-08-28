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

export function shouldReportTransportFailure(
  error: unknown,
  online: boolean | null,
): boolean {
  return online !== false && !isIntentionalCancellation(error);
}
