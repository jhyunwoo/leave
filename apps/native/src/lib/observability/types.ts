export type ObservabilityLevel = "fatal" | "error" | "warning" | "info";

export type ErrorSource =
  | "api_malformed_response"
  | "api_server_error"
  | "global_error_handler"
  | "handled_exception"
  | "network_failure"
  | "ota_update"
  | "root_error_boundary"
  | "router_error_boundary"
  | "startup";

export type PrimitiveTag = boolean | number | string;

export type ErrorCaptureDetails = {
  source: ErrorSource;
  level?: ObservabilityLevel;
  handled?: boolean;
  componentStack?: string | null;
  tags?: Record<string, PrimitiveTag | null | undefined>;
  extra?: Record<string, unknown>;
};

export type MessageCaptureDetails = Omit<ErrorCaptureDetails, "componentStack">;

export type ObservabilityBreadcrumb = {
  category: string;
  message: string;
  level?: Exclude<ObservabilityLevel, "fatal">;
  data?: Record<string, unknown>;
};

export type BackendCaptureDetails = ErrorCaptureDetails & {
  route: string | null;
};

export interface ObservabilityBackend {
  captureException(error: unknown, details: BackendCaptureDetails): void;
  captureMessage(message: string, details: BackendCaptureDetails): void;
  setUser(user: { id: string } | null): void;
  addBreadcrumb(breadcrumb: ObservabilityBreadcrumb): void;
  setTag(name: string, value: PrimitiveTag): void;
  setContext(name: string, value: Record<string, unknown> | null): void;
}
