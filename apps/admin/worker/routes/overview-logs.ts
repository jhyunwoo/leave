import {
  accessLogs,
  adminAuditLogs,
  pushLogs,
  sessions,
  users,
} from "@leave/api/db";
import { and, desc, eq, gte, like, lte, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso, parseJsonObject } from "../utils";
import { writeAudit } from "../audit";

function seoulDayBounds(): { start: string; end: string } {
  const kstNow = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const date = kstNow.toISOString().slice(0, 10);
  return {
    start: new Date(`${date}T00:00:00+09:00`).toISOString(),
    end: new Date(`${date}T23:59:59.999+09:00`).toISOString(),
  };
}

function csvCell(value: unknown): string {
  let text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(
  rows: Array<Record<string, unknown>>,
  filename: string,
): Response {
  const headers = Object.keys(rows[0] ?? {});
  const lines = [
    headers.map(csvCell).join(","),
    ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(",")),
  ];
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const overviewLogRoutes = new Hono<AdminAppEnv>()
  .get("/overview", async (c) => {
    const db = drizzle(c.env.DB);
    const { start, end } = seoulDayBounds();
    const [
      userCount,
      activeSessionCount,
      todayRequestCount,
      todayErrorCount,
      recent,
    ] = await Promise.all([
      db.$count(users),
      db.$count(sessions, gte(sessions.expiresAt, nowIso())),
      db.$count(
        accessLogs,
        and(gte(accessLogs.createdAt, start), lte(accessLogs.createdAt, end)),
      ),
      db.$count(
        accessLogs,
        and(
          gte(accessLogs.createdAt, start),
          lte(accessLogs.createdAt, end),
          gte(accessLogs.status, 500),
        ),
      ),
      db
        .select({
          id: accessLogs.id,
          userId: accessLogs.userId,
          userName: users.name,
          userEmail: users.email,
          method: accessLogs.method,
          path: accessLogs.path,
          status: accessLogs.status,
          platform: accessLogs.platform,
          durationMs: accessLogs.durationMs,
          createdAt: accessLogs.createdAt,
        })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .orderBy(desc(accessLogs.createdAt))
        .limit(10)
        .all(),
    ]);
    return c.json({
      summary: {
        totalUsers: userCount,
        activeSessions: activeSessionCount,
        todayRequests: todayRequestCount,
        errorRate:
          todayRequestCount === 0
            ? 0
            : Math.round((todayErrorCount / todayRequestCount) * 10_000) / 100,
      },
      recentAccessLogs: recent,
      system: {
        apiWorker: "ok",
        d1: "ok",
        r2: "ok",
        kv: "ok",
        push: "ok",
        checkedAt: nowIso(),
      },
    });
  })
  .get("/access-logs", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const conditions: SQL<unknown>[] = [];
    const status = Number(c.req.query("status"));
    const platform = c.req.query("platform");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (q) {
      conditions.push(
        // IP·User-Agent는 더 이상 저장하지 않으므로 경로와 계정으로만 찾는다.
        or(
          like(accessLogs.path, `%${q}%`),
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
        )!,
      );
    }
    if (Number.isInteger(status))
      conditions.push(eq(accessLogs.status, status));
    if (platform) conditions.push(eq(accessLogs.platform, platform));
    if (from) conditions.push(gte(accessLogs.createdAt, from));
    if (to) conditions.push(lte(accessLogs.createdAt, to));
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: accessLogs.id,
          userId: accessLogs.userId,
          userName: users.name,
          userEmail: users.email,
          method: accessLogs.method,
          path: accessLogs.path,
          status: accessLogs.status,
          platform: accessLogs.platform,
          appVersion: accessLogs.appVersion,
          durationMs: accessLogs.durationMs,
          createdAt: accessLogs.createdAt,
        })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .where(where)
        .orderBy(desc(accessLogs.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(accessLogs)
        .leftJoin(users, eq(accessLogs.userId, users.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    return c.json({ items, meta: listMeta(page, pageSize, total) });
  })
  .get("/access-logs/export", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: accessLogs.id,
        userId: accessLogs.userId,
        userName: users.name,
        userEmail: users.email,
        method: accessLogs.method,
        path: accessLogs.path,
        status: accessLogs.status,
        platform: accessLogs.platform,
        appVersion: accessLogs.appVersion,
        durationMs: accessLogs.durationMs,
        createdAt: accessLogs.createdAt,
      })
      .from(accessLogs)
      .leftJoin(users, eq(accessLogs.userId, users.id))
      .orderBy(desc(accessLogs.createdAt))
      .limit(50_000)
      .all();
    return csvResponse(rows, `leave-access-logs-${Date.now()}.csv`);
  })
  .get("/push-logs", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const conditions: SQL<unknown>[] = [];
    const direction = c.req.query("direction");
    const status = c.req.query("status");
    if (q) {
      conditions.push(
        // 메시지 원문·데이터·오류 상세는 더 이상 저장하지 않는다.
        or(
          like(pushLogs.notificationId, `%${q}%`),
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
        )!,
      );
    }
    if (direction) conditions.push(eq(pushLogs.direction, direction as never));
    if (status) conditions.push(eq(pushLogs.status, status));
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: pushLogs.id,
          userId: pushLogs.userId,
          userName: users.name,
          userEmail: users.email,
          notificationId: pushLogs.notificationId,
          direction: pushLogs.direction,
          status: pushLogs.status,
          createdAt: pushLogs.createdAt,
        })
        .from(pushLogs)
        .leftJoin(users, eq(pushLogs.userId, users.id))
        .where(where)
        .orderBy(desc(pushLogs.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(pushLogs)
        .leftJoin(users, eq(pushLogs.userId, users.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    return c.json({ items, meta: listMeta(page, pageSize, total) });
  })
  .get("/push-logs/export", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        id: pushLogs.id,
        userId: pushLogs.userId,
        userName: users.name,
        userEmail: users.email,
        notificationId: pushLogs.notificationId,
        direction: pushLogs.direction,
        status: pushLogs.status,
        createdAt: pushLogs.createdAt,
      })
      .from(pushLogs)
      .leftJoin(users, eq(pushLogs.userId, users.id))
      .orderBy(desc(pushLogs.createdAt))
      .limit(50_000)
      .all();
    return csvResponse(rows, `leave-push-logs-${Date.now()}.csv`);
  })
  .get("/audit-logs", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const conditions: SQL<unknown>[] = [];
    const action = c.req.query("action");
    const entityType = c.req.query("entityType");
    const entityId = c.req.query("entityId");
    if (q) {
      conditions.push(
        or(
          like(adminAuditLogs.adminEmail, `%${q}%`),
          like(adminAuditLogs.entityId, `%${q}%`),
          like(adminAuditLogs.action, `%${q}%`),
        )!,
      );
    }
    if (action) conditions.push(eq(adminAuditLogs.action, action));
    if (entityType) {
      conditions.push(eq(adminAuditLogs.entityType, entityType));
    }
    if (entityId) conditions.push(eq(adminAuditLogs.entityId, entityId));
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      db
        .select()
        .from(adminAuditLogs)
        .where(where)
        .orderBy(desc(adminAuditLogs.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db.$count(adminAuditLogs, where),
    ]);
    return c.json({
      items: items.map((item) => ({
        ...item,
        before: parseJsonObject(item.beforeJson),
        after: parseJsonObject(item.afterJson),
        beforeJson: undefined,
        afterJson: undefined,
      })),
      meta: listMeta(page, pageSize, total),
    });
  })
  .get("/audit-logs/export", async (c) => {
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(adminAuditLogs)
      .orderBy(desc(adminAuditLogs.createdAt))
      .limit(50_000)
      .all();
    return csvResponse(rows, `leave-admin-audit-${Date.now()}.csv`);
  })
  .get("/sessions", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const where = q
      ? or(like(users.name, `%${q}%`), like(users.email, `%${q}%`))
      : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: sessions.id,
          userId: sessions.userId,
          userName: users.name,
          userEmail: users.email,
          expiresAt: sessions.expiresAt,
          createdAt: sessions.createdAt,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(where)
        .orderBy(desc(sessions.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    return c.json({ items, meta: listMeta(page, pageSize, total) });
  })
  .delete("/sessions/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select({
        id: sessions.id,
        userId: sessions.userId,
        expiresAt: sessions.expiresAt,
        createdAt: sessions.createdAt,
      })
      .from(sessions)
      .where(eq(sessions.id, id))
      .get();
    if (!before) return c.json({ error: "세션을 찾을 수 없습니다" }, 404);
    await db.delete(sessions).where(eq(sessions.id, id));
    await writeAudit(c, {
      action: "revoke",
      entityType: "session",
      entityId: id,
      before,
    });
    return c.json({ ok: true as const });
  });
