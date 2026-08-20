/**
 * React Query retry policy shared by clients.
 *
 * Validation/auth/permission failures are deterministic: repeating the same
 * request spends bandwidth and CPU without changing the answer. Request
 * timeout and rate-limit responses are the two client-error exceptions that
 * can become successful later, so they keep the same bounded retry path as
 * network and server failures.
 */
import { ApiError } from "@leave/shared";

/** Two retries means at most three attempts including the initial request. */
const MAX_TRANSIENT_RETRIES = 2;

export function shouldRetryQuery(failureCount: number, error: Error): boolean {
  if (
    error instanceof ApiError &&
    error.status >= 400 &&
    error.status < 500 &&
    error.status !== 408 &&
    error.status !== 429
  ) {
    return false;
  }
  return failureCount < MAX_TRANSIENT_RETRIES;
}
