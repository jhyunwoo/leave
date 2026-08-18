/**
 * 관리자용 초대코드 운영 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 *
 * 코드 원문은 어디에도 없다 — DB에는 SHA-256 해시만 있고, 발급 응답에서 한 번
 * 보여준 뒤로는 서버도 모른다. 그래서 관리자가 할 수 있는 일은 "폐기"와 "삭제"뿐이고
 * 재발급은 그룹 관리자가 앱에서 한다.
 */

import { unitInvites, units } from "@leave/api/server";
import { desc, eq, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso } from "../utils";

export const unitInviteRoutes = new Hono<AdminAppEnv>()
  .get("/unit-invites", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const where = q
      ? or(like(units.name, `%${q}%`), like(unitInvites.unitId, `%${q}%`))
      : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: unitInvites.id,
          unitId: unitInvites.unitId,
          unitName: units.name,
          expiresAt: unitInvites.expiresAt,
          maxUses: unitInvites.maxUses,
          usedCount: unitInvites.usedCount,
          revokedAt: unitInvites.revokedAt,
          createdBy: unitInvites.createdBy,
          createdAt: unitInvites.createdAt,
        })
        .from(unitInvites)
        .innerJoin(units, eq(unitInvites.unitId, units.id))
        .where(where)
        .orderBy(desc(unitInvites.createdAt))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(unitInvites)
        .innerJoin(units, eq(unitInvites.unitId, units.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    return c.json({ items, meta: listMeta(page, pageSize, total) });
  })
  .post("/unit-invites/:id/revoke", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(unitInvites)
      .where(eq(unitInvites.id, id))
      .get();
    if (!before) return c.json({ error: "초대코드를 찾을 수 없습니다" }, 404);
    if (before.revokedAt) {
      return c.json({ error: "이미 폐기된 초대코드입니다" }, 409);
    }
    const revokedAt = nowIso();
    await db
      .update(unitInvites)
      .set({ revokedAt })
      .where(eq(unitInvites.id, id));
    await writeAudit(c, {
      action: "revoke",
      entityType: "unit_invite",
      entityId: id,
      before: { ...before, codeHash: undefined },
      after: { revokedAt },
    });
    return c.json({ ok: true as const });
  })
  .delete("/unit-invites/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(unitInvites)
      .where(eq(unitInvites.id, id))
      .get();
    if (!before) return c.json({ error: "초대코드를 찾을 수 없습니다" }, 404);
    await db.delete(unitInvites).where(eq(unitInvites.id, id));
    await writeAudit(c, {
      action: "delete",
      entityType: "unit_invite",
      entityId: id,
      // 해시라도 감사 로그에 남기지 않는다.
      before: { ...before, codeHash: undefined },
    });
    return c.json({ ok: true as const });
  });
// UGC 신고 처리 큐. Apple 1.2와 Play UGC 정책은 "24시간 내 조치"를 요구하므로
// 운영자가 미처리 건을 한눈에 보고 상태를 바꿀 수 있어야 한다.
