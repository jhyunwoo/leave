/**
 * 관리자용 휴가 라우트.
 *
 * 마운트 위치: `/api` (worker/index.ts).
 *
 * 관리자가 대신 등록하는 휴가도 앱과 **완전히 같은 규칙**을 통과해야 한다.
 * 구간이 겹치거나 비어서는 안 되고, 재원 잔여도 검사한다. 여기만 규칙이 느슨하면
 * 관리자가 만든 데이터가 앱에서 계산 불가 상태로 나타난다.
 */

import {
  assertSegmentsAvailable,
  checkOverageAndNotify,
  leaves,
  leaveSegments,
  segmentInsertStatements,
  segmentsForLeaves,
  units,
  users,
} from "@leave/api/server";
import {
  addDays,
  inclusiveDays,
  leaveSegmentSchema,
  segmentsRange,
  sortSegments,
  type LeaveSegment,
} from "@leave/shared";
import { and, desc, eq, like, or, sql, type SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { z } from "zod";
import { writeAudit } from "../audit";
import type { AdminAppEnv } from "../types";
import { listMeta, listParams, nowIso, safeWaitUntil } from "../utils";

const leaveSchema = z
  .object({
    userId: z.string().min(1),
    title: z.string().trim().min(1).max(80),
    reason: z.string().trim().max(500).nullable().optional(),
    segments: z.array(leaveSegmentSchema).min(1).max(30),
    sendNotifications: z.boolean().optional().default(false),
  })
  .superRefine((value, ctx) => {
    // 구간들은 겹치지 않고 빈틈없이 이어져야 한다(앱과 같은 규칙).
    const sorted = sortSegments(value.segments);
    for (let i = 1; i < sorted.length; i += 1) {
      const previous = sorted[i - 1]!;
      const current = sorted[i]!;
      if (current.startDate <= previous.endDate) {
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "휴가 구간끼리 겹칠 수 없습니다",
        });
        return;
      }
      if (current.startDate !== addDays(previous.endDate, 1)) {
        ctx.addIssue({
          code: "custom",
          path: ["segments"],
          message: "휴가 구간 사이에 빈 날이 있을 수 없습니다",
        });
        return;
      }
    }
  });

/** 입력 구간에 일수를 채워 정렬한다. 일수는 항상 날짜에서 파생한다. */
function toSegments(
  input: z.infer<typeof leaveSchema>["segments"],
): LeaveSegment[] {
  return sortSegments(input).map((segment) => ({
    ...segment,
    days: inclusiveDays(segment.startDate, segment.endDate),
  }));
}

async function getUser(
  db: ReturnType<typeof drizzle>,
  id: string,
): Promise<typeof users.$inferSelect | undefined> {
  return db.select().from(users).where(eq(users.id, id)).get();
}

export const adminLeaveRoutes = new Hono<AdminAppEnv>()
  .get("/leaves", async (c) => {
    const db = drizzle(c.env.DB);
    const { page, pageSize, offset, q } = listParams(c);
    const conditions: SQL<unknown>[] = [];
    const userId = c.req.query("userId");
    const unitId = c.req.query("unitId");
    const from = c.req.query("from");
    const to = c.req.query("to");
    if (q) {
      conditions.push(
        or(
          like(leaves.title, `%${q}%`),
          like(leaves.reason, `%${q}%`),
          like(users.name, `%${q}%`),
          like(users.email, `%${q}%`),
        )!,
      );
    }
    if (userId) conditions.push(eq(leaves.userId, userId));
    if (unitId) conditions.push(eq(users.unitId, unitId));
    if (from) conditions.push(sql`${leaves.endDate} >= ${from}`);
    if (to) conditions.push(sql`${leaves.startDate} <= ${to}`);
    const where = conditions.length ? and(...conditions) : undefined;
    const [items, total] = await Promise.all([
      db
        .select({
          id: leaves.id,
          userId: leaves.userId,
          userName: users.name,
          userEmail: users.email,
          unitId: users.unitId,
          unitName: units.name,
          title: leaves.title,
          startDate: leaves.startDate,
          endDate: leaves.endDate,
          reason: leaves.reason,
          createdAt: leaves.createdAt,
        })
        .from(leaves)
        .innerJoin(users, eq(leaves.userId, users.id))
        .leftJoin(units, eq(users.unitId, units.id))
        .where(where)
        .orderBy(desc(leaves.startDate))
        .limit(pageSize)
        .offset(offset)
        .all(),
      db
        .select({ count: sql<number>`cast(count(*) as integer)` })
        .from(leaves)
        .innerJoin(users, eq(leaves.userId, users.id))
        .where(where)
        .get()
        .then((row) => row?.count ?? 0),
    ]);
    const segmentMap = await segmentsForLeaves(
      db,
      items.map((item) => item.id),
    );
    return c.json({
      items: items.map((item) => ({
        ...item,
        segments: segmentMap.get(item.id) ?? [],
      })),
      meta: listMeta(page, pageSize, total),
    });
  })
  .post("/leaves", async (c) => {
    const input = leaveSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const user = await getUser(db, input.data.userId);
    if (!user) return c.json({ error: "사용자를 찾을 수 없습니다" }, 400);
    const segments = toSegments(input.data.segments);
    const range = segmentsRange(segments)!;
    try {
      await assertSegmentsAvailable(db, user, segments);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "잔여량이 부족합니다",
        },
        400,
      );
    }
    const leave: typeof leaves.$inferInsert = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: input.data.title,
      startDate: range.startDate,
      endDate: range.endDate,
      reason: input.data.reason ?? null,
      createdAt: nowIso(),
    };
    // 행과 구간을 나눠 쓰면 사이에서 실패했을 때 구간 없는 휴가가 남는다. 앱의 병합
    // 경로가 그런 행을 방어적으로 걸러내야 했던 원인이 여기였다. 한 batch로 묶는다.
    await db.batch([
      db.insert(leaves).values(leave),
      ...segmentInsertStatements(db, leave.id, segments),
    ]);
    if (user.unitId && input.data.sendNotifications) {
      safeWaitUntil(
        c,
        checkOverageAndNotify({
          db,
          unitId: user.unitId,
          changedLeave: leave as typeof leaves.$inferSelect,
          waitUntil: (promise) => safeWaitUntil(c, promise),
        }),
      );
    }
    await writeAudit(c, {
      action: "create",
      entityType: "leave",
      entityId: leave.id,
      after: { ...leave, sendNotifications: input.data.sendNotifications },
    });
    return c.json({ item: { ...leave, segments } }, 201);
  })
  .patch("/leaves/:id", async (c) => {
    const input = leaveSchema.safeParse(await c.req.json().catch(() => null));
    if (!input.success) {
      return c.json(
        { error: input.error.issues[0]?.message ?? "입력값을 확인해주세요" },
        400,
      );
    }
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(leaves)
      .where(eq(leaves.id, id))
      .get();
    if (!before) return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    const newUser = await getUser(db, input.data.userId);
    if (!newUser) return c.json({ error: "사용자를 찾을 수 없습니다" }, 400);
    const segments = toSegments(input.data.segments);
    const range = segmentsRange(segments)!;
    try {
      await assertSegmentsAvailable(
        db,
        newUser,
        segments,
        newUser.id === before.userId ? [id] : undefined,
      );
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "잔여량이 부족합니다",
        },
        400,
      );
    }
    const patch = {
      userId: newUser.id,
      title: input.data.title,
      startDate: range.startDate,
      endDate: range.endDate,
      reason: input.data.reason ?? null,
    };
    await db.batch([
      db.update(leaves).set(patch).where(eq(leaves.id, id)),
      db.delete(leaveSegments).where(eq(leaveSegments.leaveId, id)),
      // 구간 15개부터는 한 INSERT 문이 D1 바인드 파라미터 상한을 넘는다 — 나눠 담는다.
      ...segmentInsertStatements(db, id, segments),
    ]);
    if (newUser.unitId && input.data.sendNotifications) {
      safeWaitUntil(
        c,
        checkOverageAndNotify({
          db,
          unitId: newUser.unitId,
          changedLeave: { ...before, ...patch },
          waitUntil: (promise) => safeWaitUntil(c, promise),
        }),
      );
    }
    const after = { ...before, ...patch, segments };
    await writeAudit(c, {
      action: "update",
      entityType: "leave",
      entityId: id,
      before,
      after: { ...after, sendNotifications: input.data.sendNotifications },
    });
    return c.json({ item: after });
  })
  .delete("/leaves/:id", async (c) => {
    const db = drizzle(c.env.DB);
    const id = c.req.param("id");
    const before = await db
      .select()
      .from(leaves)
      .where(eq(leaves.id, id))
      .get();
    if (!before) return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    await db.delete(leaves).where(eq(leaves.id, id));
    await writeAudit(c, {
      action: "delete",
      entityType: "leave",
      entityId: id,
      before,
    });
    return c.json({ ok: true as const });
  });
// 초대코드는 원문을 저장하지 않으므로 관리자도 조회할 수 없다.
// 운영에 필요한 건 "어느 그룹에 유효한 코드가 몇 개 살아 있는가"와 폐기 수단뿐이다.
