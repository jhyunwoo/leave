/** Deterministic client errors are not retried.
 * Timeouts (408) and rate limits (429) keep the bounded transient retry policy. */
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
