import {
  ApiError,
  MalformedApiResponseError,
  type UnwrappableResponse,
} from "@leave/shared/http";
import {
  classifyHttpStatus,
  isIntentionalCancellation,
  shouldReportTransportFailure,
} from "./classification";
import {
  addObservabilityBreadcrumb,
  captureException,
  setObservabilityTag,
} from "./index";
import { sanitizeEndpoint } from "./sanitize";

export type RequestTelemetry = {
  method: string;
  endpoint: string;
  status?: number;
  durationMs: number;
  requestId?: string;
};

const responseTelemetry = new WeakMap<object, RequestTelemetry>();
const recentReports = new Map<string, number>();
const REPORT_WINDOW_MS = 30_000;
let networkOnline: boolean | null = null;
let networkType: string | null = null;

function shouldReportOnce(key: string): boolean {
  const now = Date.now();
  const last = recentReports.get(key);
  if (last !== undefined && now - last < REPORT_WINDOW_MS) return false;
  recentReports.set(key, now);
  if (recentReports.size > 100) {
    for (const [candidate, timestamp] of recentReports) {
      if (now - timestamp >= REPORT_WINDOW_MS) recentReports.delete(candidate);
    }
  }
  return true;
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  try {
    if (typeof input === "string") return input;
    if (input instanceof URL) return input.toString();
    return input.url;
  } catch {
    return "/unknown";
  }
}

function requestMethod(
  input: Parameters<typeof globalThis.fetch>[0],
  init?: RequestInit,
): string {
  try {
    if (init?.method) return init.method.toUpperCase();
    if (typeof input !== "string" && !(input instanceof URL) && input.method) {
      return input.method.toUpperCase();
    }
  } catch {
    // Fall through to the protocol default.
  }
  return "GET";
}

function responseRequestId(response: Response): string | undefined {
  try {
    return (
      response.headers.get("x-request-id") ??
      response.headers.get("x-correlation-id") ??
      response.headers.get("cf-ray") ??
      undefined
    );
  } catch {
    return undefined;
  }
}

export const instrumentedFetch: typeof globalThis.fetch = async (
  input,
  init,
) => {
  const startedAt = Date.now();
  const method = requestMethod(input, init);
  const endpoint = sanitizeEndpoint(requestUrl(input));

  try {
    const response = await globalThis.fetch(input, init);
    const telemetry: RequestTelemetry = {
      method,
      endpoint,
      status: response.status,
      durationMs: Date.now() - startedAt,
      requestId: responseRequestId(response),
    };
    responseTelemetry.set(response, telemetry);
    addObservabilityBreadcrumb({
      category: "http.client",
      message: `${method} ${endpoint} -> ${response.status}`,
      level: response.status >= 500 ? "warning" : "info",
      data: {
        method,
        endpoint,
        status_code: response.status,
        duration_ms: telemetry.durationMs,
        ...(telemetry.requestId ? { request_id: telemetry.requestId } : {}),
        ...(networkOnline === null ? {} : { online: networkOnline }),
      },
    });
    return response;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const cancellation = isIntentionalCancellation(error);
    addObservabilityBreadcrumb({
      category: "http.client",
      message: cancellation
        ? `${method} ${endpoint} cancelled`
        : `${method} ${endpoint} transport failure`,
      level: cancellation || networkOnline === false ? "info" : "warning",
      data: {
        method,
        endpoint,
        duration_ms: durationMs,
        ...(networkOnline === null ? {} : { online: networkOnline }),
      },
    });

    if (
      shouldReportTransportFailure(error, networkOnline) &&
      shouldReportOnce(`transport:${method}:${endpoint}`)
    ) {
      captureException(error, {
        source: "network_failure",
        level: "error",
        handled: true,
        tags: {
          "http.method": method,
          "http.endpoint": endpoint,
          "network.online": networkOnline ?? "unknown",
        },
        extra: { duration_ms: durationMs, network_type: networkType },
      });
    }
    throw error;
  }
};

export function captureApiResponseError(
  error: unknown,
  response: UnwrappableResponse,
): void {
  try {
    const telemetry = responseTelemetry.get(response as object) ?? {
      method: "unknown",
      endpoint: "/unknown",
      status: response.status,
      durationMs: 0,
    };
    const malformed = error instanceof MalformedApiResponseError;
    const apiError = error instanceof ApiError;
    const status = apiError ? (error as ApiError).status : response.status;
    if (!malformed && classifyHttpStatus(status) !== "report") return;

    const source = malformed
      ? "api_malformed_response"
      : status === 408
        ? "network_failure"
        : "api_server_error";
    if (
      !shouldReportOnce(
        `${source}:${telemetry.method}:${telemetry.endpoint}:${status}`,
      )
    ) {
      return;
    }
    captureException(error, {
      source,
      level: "error",
      handled: true,
      tags: {
        "http.method": telemetry.method,
        "http.endpoint": telemetry.endpoint,
        "http.status_code": status,
        ...(telemetry.requestId
          ? { "http.request_id": telemetry.requestId }
          : {}),
      },
      extra: {
        duration_ms: telemetry.durationMs,
        ...(telemetry.requestId ? { request_id: telemetry.requestId } : {}),
      },
    });
  } catch {
    // Reporting an HTTP failure must not alter the HTTP failure itself.
  }
}

export function updateNetworkState(
  online: boolean,
  type: string | null | undefined,
): void {
  const changed = networkOnline !== online || networkType !== (type ?? null);
  networkOnline = online;
  networkType = type ?? null;
  setObservabilityTag("network.online", online);
  if (networkType) setObservabilityTag("network.type", networkType);
  if (changed) {
    addObservabilityBreadcrumb({
      category: "device.connectivity",
      message: `network changed to ${online ? "online" : "offline"}`,
      level: "info",
      data: { online, type: networkType ?? "unknown" },
    });
  }
}
