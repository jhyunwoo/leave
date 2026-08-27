/**
 * 관리자 워커 공용 유틸 — 목록 페이지 파라미터, 요청 메타, 백그라운드 실행.
 *
 * 사용처: worker/routes/*.ts 전부.
 * 목록 API가 열두 개라 페이지·검색어 파싱을 여기서 한 번만 정의한다.
 */

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

/*
 * 감사 로그에 남는 요청자 제어 문자열의 상한.
 *
 * 로그인 실패도 감사 행을 하나 남기는데, 그 요청은 인증 전이라 아무나 보낼 수 있고
 * `admin_audit_logs`는 보관 기간 정리(apps/api/src/lib/retention.ts)의 대상이 아니라
 * 영구히 쌓인다. 상한이 없으면 헤더 하나로 요청당 수 KB를 D1에 눌러 담을 수 있다.
 * 정상 UA는 256자를 넘지 않고, IP 문자열은 IPv6라도 45자면 충분하다.
 */
const MAX_CLIENT_IP_LENGTH = 64;
const MAX_USER_AGENT_LENGTH = 256;

/** 상한까지만 남긴다. 값이 아예 없으면 null 그대로 둔다. */
function clampHeader(value: string | undefined | null, max: number) {
  if (value === undefined || value === null) return null;
  return value.length > max ? value.slice(0, max) : value;
}

export function clientIp(c: Context<AdminAppEnv>): string | null {
  return clampHeader(
    c.req.header("CF-Connecting-IP") ??
      c.req.header("X-Forwarded-For")?.split(",")[0]?.trim(),
    MAX_CLIENT_IP_LENGTH,
  );
}

export function userAgent(c: Context<AdminAppEnv>): string | null {
  return clampHeader(c.req.header("User-Agent"), MAX_USER_AGENT_LENGTH);
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
