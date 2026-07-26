import type { Context } from "hono";
import type { AdminAppEnv, ListMeta } from "./types";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function nowIso(): string {
  return new Date().toISOString();
}

export function listParams(c: Context<AdminAppEnv>): {
  page: number;
  pageSize: number;
  offset: number;
  q: string;
} {
  const rawPage = Number(c.req.query("page") ?? 1);
  const rawPageSize = Number(c.req.query("pageSize") ?? DEFAULT_PAGE_SIZE);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize =
    Number.isInteger(rawPageSize) && rawPageSize > 0
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    q: (c.req.query("q") ?? "").trim(),
  };
}

export function listMeta(
  page: number,
  pageSize: number,
  total: number,
): ListMeta {
  return {
    page,
    pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}

export function clientIp(c: Context<AdminAppEnv>): string | null {
  return (
    c.req.header("CF-Connecting-IP") ??
    c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ??
    null
  );
}

export function userAgent(c: Context<AdminAppEnv>): string | null {
  return c.req.header("User-Agent") ?? null;
}

export function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === "1") return true;
  if (value === "false" || value === "0") return false;
  return undefined;
}

export function parseJsonObject(
  value: string | null,
): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed != null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function safeWaitUntil(
  c: Context<AdminAppEnv>,
  promise: Promise<unknown>,
): void {
  try {
    c.executionCtx.waitUntil(promise);
  } catch {
    void promise.catch((error) => {
      console.error("background task failed", error);
    });
  }
}
