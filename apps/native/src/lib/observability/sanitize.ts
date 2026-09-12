const FILTERED = "[Filtered]";
const SENSITIVE_KEY =
  /(?:authorization|cookie|pass(?:word|code)?|pin|otp|verification(?:code)?|access.?token|refresh.?token|api.?key|secret|session|credential)/i;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const BEARER = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;
const JWT = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const SECRET_ASSIGNMENT =
  /\b(access.?token|refresh.?token|api.?key|password|passcode|otp|verification.?code|secret)\b\s*[:=]\s*[^\s,;]+/gi;
const URL_IN_TEXT = /[a-z][a-z\d+.-]*:\/\/[^\s)\]}>,]+/gi;

/**
 * 응답 경로에서 **그대로 남겨도 되는** 낱말. 여기 없는 segment는 전부 `[param]`이 된다.
 *
 * 빠뜨리면 서로 다른 엔드포인트가 한 템플릿으로 뭉친다 — 패스키 경로가
 * `/auth/[param]/[param]/[param]`으로 보여, 504가 어느 요청에서 났는지 이슈만 보고는
 * 알 수 없었다(Sentry LEAVE-NATIVE-2). 새 라우트를 만들면 그 literal도 여기 넣는다.
 */
const STATIC_API_SEGMENTS = new Set([
  "accept",
  "account",
  "activity",
  "api",
  "auth",
  "authentication",
  "balances",
  "blackouts",
  "bootstrap",
  "calendar",
  "calendars",
  "complete",
  "duty-days",
  "friends",
  "grants",
  "incoming",
  "invite",
  "invites",
  "join",
  "leaves",
  "login",
  "logout",
  "me",
  "members",
  "mine",
  "notifications",
  "onboarding",
  "options",
  "outgoing",
  "passkeys",
  "password",
  "personal-events",
  "preferences",
  "profile",
  "public",
  "read",
  "registration",
  "regular-overnight",
  "remove",
  "requests",
  "schedule",
  "search",
  "signup",
  "summary",
  "transfer",
  "units",
  "users",
  "verify",
]);

function safeString(value: unknown): string {
  try {
    return String(value);
  } catch {
    return "unprintable";
  }
}

/** Strip every query value and fragment; none are needed for diagnostics. */
export function sanitizeUrl(raw: string): string {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(raw);
    const parsed = new URL(raw, "https://redacted.invalid");
    parsed.search = "";
    parsed.hash = "";
    return absolute
      ? `${parsed.protocol}//${parsed.host}${parsed.pathname}`
      : parsed.pathname;
  } catch {
    return raw.split(/[?#]/, 1)[0] ?? "";
  }
}

/** Turn API paths into low-cardinality templates without route-specific IDs. */
export function sanitizeEndpoint(raw: string): string {
  let path: string;
  try {
    path = new URL(raw, "https://redacted.invalid").pathname;
  } catch {
    path = sanitizeUrl(raw);
  }
  const segments = path.split("/").filter(Boolean);
  return `/${segments
    .map((segment) =>
      STATIC_API_SEGMENTS.has(segment.toLowerCase()) ? segment : "[param]",
    )
    .join("/")}`;
}

/** Keep the origin and a route template, but never a user-controlled path ID. */
export function sanitizeDiagnosticUrl(raw: string): string {
  try {
    const absolute = /^[a-z][a-z\d+.-]*:/i.test(raw);
    const parsed = new URL(raw, "https://redacted.invalid");
    const endpoint = sanitizeEndpoint(parsed.pathname);
    if (!absolute) return endpoint;

    const safeAuthority =
      parsed.protocol === "https:" || parsed.protocol === "http:"
        ? parsed.host
        : "[host]";
    return `${parsed.protocol}//${safeAuthority}${endpoint}`;
  } catch {
    return sanitizeEndpoint(sanitizeUrl(raw));
  }
}

export function sanitizeText(raw: string): string {
  return raw
    .replace(URL_IN_TEXT, (url) => sanitizeDiagnosticUrl(url))
    .replace(BEARER, `Bearer ${FILTERED}`)
    .replace(JWT, FILTERED)
    .replace(SECRET_ASSIGNMENT, (_match, key: string) => `${key}=${FILTERED}`)
    .replace(EMAIL, "[FilteredEmail]");
}

export function sanitizeUnknown(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): unknown {
  if (typeof value === "string") return sanitizeText(value).slice(0, 4_000);
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "undefined"
  ) {
    return value;
  }
  if (typeof value === "bigint" || typeof value === "symbol") {
    return safeString(value);
  }
  if (typeof value === "function") return "[Function]";
  if (depth >= 6) return "[Truncated]";
  if (typeof value !== "object") return sanitizeText(safeString(value));
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) {
    return value
      .slice(0, 50)
      .map((item) => sanitizeUnknown(item, depth + 1, seen));
  }

  const output: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    output[key] = SENSITIVE_KEY.test(key)
      ? FILTERED
      : sanitizeUnknown(item, depth + 1, seen);
  }
  return output;
}

type SentryLikeBreadcrumb = {
  category?: string;
  message?: string;
  data?: Record<string, unknown>;
};

export function sanitizeSentryBreadcrumb<T extends SentryLikeBreadcrumb>(
  breadcrumb: T,
): T | null {
  // Console arguments and SDK-generated navigation URLs are the two easiest
  // paths for user content/deep-link IDs to leak. The app emits safer explicit
  // breadcrumbs for actionable events.
  if (
    breadcrumb.category === "console" ||
    breadcrumb.category === "navigation"
  ) {
    return null;
  }
  return sanitizeUnknown(breadcrumb) as T;
}

type SentryLikeEvent = {
  breadcrumbs?: SentryLikeBreadcrumb[];
  request?: { method?: string; url?: string };
  user?: { id?: number | string };
};

export function sanitizeSentryEvent<T>(event: T): T {
  const source = event as T & SentryLikeEvent;
  const sanitized = sanitizeUnknown(event) as T & SentryLikeEvent;

  if (source.user?.id) {
    sanitized.user = {
      id: sanitizeText(String(source.user.id)).slice(0, 200),
    };
  } else {
    delete sanitized.user;
  }

  if (source.request) {
    sanitized.request = {
      ...(source.request.method
        ? { method: sanitizeText(source.request.method).slice(0, 20) }
        : {}),
      ...(source.request.url
        ? { url: sanitizeDiagnosticUrl(source.request.url) }
        : {}),
    };
  }

  if (source.breadcrumbs) {
    sanitized.breadcrumbs = source.breadcrumbs
      .map((item) => sanitizeSentryBreadcrumb(item))
      .filter((item): item is SentryLikeBreadcrumb => item !== null)
      .slice(-50);
  }

  return sanitized as T;
}
