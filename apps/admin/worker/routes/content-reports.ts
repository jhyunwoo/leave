/**
 * 관리자용 신고 처리 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 *
 * 신고 자체는 지우지 않는다 — 처리 상태만 바꾼다. 접수 이력이 남아야 같은 그룹·같은
 * 사람에 대한 반복 신고를 알아볼 수 있다. 신고자가 탈퇴하면 reporterId만 끊긴다
 * (apps/api/src/lib/delete-account.ts).
 */

import { contentReports } from "@leave/api/server";
import { and, asc, desc, eq, like, or, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso } from "../utils";

export const contentReportRoutes = new Hono<AdminAppEnv>()
  .get("/content-reports", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const status = c.req.query("status");
    const conditions: SQL<unknown>[] = [];
    if (q) {
      conditions.push(
        or(
          like(contentReports.targetId, `%${q}%`),
          like(contentReports.reason, `%${q}%`),
          like(contentReports.detail, `%${q}%`),
        )!,
      );
    }
    if (status === "open" || status === "reviewing" || status === "resolved") {
      conditions.push(eq(contentReports.status, status));
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      db
        .select()
        .from(contentReports)
        .where(where)
        // 미처리 건이 항상 위로 오게 한다.
        .orderBy(asc(contentReports.status), desc(contentReports.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db.$count(contentReports, where),
    ]);
    return c.json({ items, meta: listMeta(page, pageSize, total) });
  })
  .patch("/content-reports/:id", async (c) => {
    const input = z
      .object({ status: z.enum(["open", "reviewing", "resolved"]) })
      .safeParse(await c.req.json().catch(() => null));
    if (!input.success) return c.json({ error: "상태를 확인해주세요" }, 400);
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(contentReports)
      .where(eq(contentReports.id, id))
      .get();
    if (!before) return c.json({ error: "신고를 찾을 수 없습니다" }, 404);
    const resolvedAt = input.data.status === "resolved" ? nowIso() : null;
    await db
      .update(contentReports)
      .set({ status: input.data.status, resolvedAt })
      .where(eq(contentReports.id, id));
    await writeAudit(c, {
      action: "update",
      entityType: "content_report",
      entityId: id,
      before,
      after: { ...before, status: input.data.status, resolvedAt },
    });
    return c.json({
      item: { ...before, status: input.data.status, resolvedAt },
    });
  });
