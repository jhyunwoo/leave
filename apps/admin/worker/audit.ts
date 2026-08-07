/**
 * 관리자 감사 로그.
 *
 * 사용처: 데이터를 바꾸는 모든 관리자 라우트.
 *
 * 누가·언제·무엇을 어떻게 바꿨는지를 변경 전/후 스냅샷과 함께 남긴다.
 * 스냅샷에 비밀번호 해시·토큰 같은 값이 섞이면 로그 자체가 유출 경로가 되므로,
 * 키 이름을 기준으로 걸러낸 뒤 저장한다(SENSITIVE_KEY).
 */

import { adminAuditLogs } from "@leave/api/db";
import { drizzle } from "drizzle-orm/d1";
import type { Context } from "hono";
import type { AdminAppEnv } from "./types";
import { clientIp, nowIso, userAgent } from "./utils";

const SENSITIVE_KEY = /password|hash|salt|token|secret|authorization|cookie/i;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) ? "[REDACTED]" : redact(entry),
      ]),
    );
  }
  return value;
}

function toJson(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return JSON.stringify(redact(value));
}

type AuditInput = {
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

export async function writeAuditForActor(
  c: Context<AdminAppEnv>,
  actor: { id: string | null; email: string },
  input: AuditInput,
): Promise<void> {
  const db = drizzle(c.env.DB);
  await db.insert(adminAuditLogs).values({
    id: crypto.randomUUID(),
    adminId: actor.id,
    adminEmail: actor.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId ?? null,
    beforeJson: toJson(input.before),
    afterJson: toJson(input.after),
    ip: clientIp(c),
    userAgent: userAgent(c),
    createdAt: nowIso(),
  });
}

export async function writeAudit(
  c: Context<AdminAppEnv>,
  input: AuditInput,
): Promise<void> {
  const admin = c.get("admin");
  await writeAuditForActor(c, { id: admin.id, email: admin.email }, input);
}
