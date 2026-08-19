/**
 * 휴가·보유 휴가 라우트.
 *
 * 마운트 위치: `/leaves` (apps/api/src/index.ts).
 * 명세는 ./leaves.contract.ts, 계산과 저장 규칙은 lib/leave-*.ts에 있다.
 * 다루는 것: 내 휴가 CRUD, 재원별 잔여 요약, 적립분 관리, 정기외박 설정.
 *
 * 휴가를 저장하기 전에 반드시 두 가지를 확인한다.
 *  1) 구간들이 겹치지 않고 빈틈없이 이어지는가(스키마)
 *  2) 각 구간의 재원이 실제로 남아 있는가(assertSegmentsAvailable)
 * 저장 뒤에는 그룹 달력 캐시를 무효화하고 초과 알림을 보낸다.
 */

import {
  inclusiveDays,
  sortSegments,
  type LeaveCreateInput,
  type LeaveSegment,
} from "@leave/shared";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { leaves, type LeaveRow } from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import { leaveRuleMessage } from "../lib/errors";
import {
  foldSegmentRows,
  getLeaveBalanceSummary,
  saveRegularOvernightConfig,
  segmentsOfUserQuery,
  updateLeaveBalanceTotals,
} from "../lib/leave-balances";
import {
  buildGrantsPage,
  createGrant,
  deleteGrant,
  updateGrant,
} from "../lib/leave-grants";
import { saveLeaveWithMerge } from "../lib/leave-merge";
import { checkOverageAndNotify } from "../lib/overage";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";
import {
  balancesRoute,
  createGrantRoute,
  createLeaveRoute,
  deleteGrantRoute,
  deleteLeaveRoute,
  grantsRoute,
  mineRoute,
  regularOvernightRoute,
  updateBalancesRoute,
  updateGrantRoute,
  updateLeaveRoute,
} from "./leaves.contract";

/** 입력 구간에 일수를 채워 정렬한다. 일수는 항상 날짜에서 파생한다. */
function toSegments(input: LeaveCreateInput): LeaveSegment[] {
  return sortSegments(input.segments).map((segment) => ({
    ...segment,
    days: inclusiveDays(segment.startDate, segment.endDate),
  }));
}

function serializeLeave(
  row: LeaveRow,
  segmentsByLeave: Map<string, LeaveSegment[]>,
) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    status: row.status,
    segments: segmentsByLeave.get(row.id) ?? [],
    createdAt: row.createdAt,
  };
}

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);

export const leaveRoutes = app
  .openapi(balancesRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    return c.json(await getLeaveBalanceSummary(db, user), 200);
  })
  .openapi(updateBalancesRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    try {
      return c.json(
        await updateLeaveBalanceTotals(db, user, c.req.valid("json").totals),
        200,
      );
    } catch (error) {
      const message = leaveRuleMessage(error);
      if (message === null) throw error;
      return c.json({ error: message }, 400);
    }
  })
  .openapi(regularOvernightRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    try {
      return c.json(
        await saveRegularOvernightConfig(db, user, c.req.valid("json")),
        200,
      );
    } catch (error) {
      const message = leaveRuleMessage(error);
      if (message === null) throw error;
      return c.json({ error: message }, 400);
    }
  })
  .openapi(grantsRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    return c.json(await buildGrantsPage(db, user), 200);
  })
  .openapi(createGrantRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    try {
      await createGrant(db, user, c.req.valid("json"));
    } catch (error) {
      const message = leaveRuleMessage(error);
      if (message === null) throw error;
      return c.json({ error: message }, 400);
    }
    return c.json(await buildGrantsPage(db, user), 201);
  })
  .openapi(updateGrantRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    try {
      const found = await updateGrant(
        db,
        user,
        c.req.valid("param").id,
        c.req.valid("json"),
      );
      if (!found) return c.json({ error: "적립분을 찾을 수 없습니다" }, 404);
    } catch (error) {
      const message = leaveRuleMessage(error);
      if (message === null) throw error;
      return c.json({ error: message }, 400);
    }
    return c.json(await buildGrantsPage(db, user), 200);
  })
  .openapi(deleteGrantRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const found = await deleteGrant(db, user, c.req.valid("param").id);
    if (!found) return c.json({ error: "적립분을 찾을 수 없습니다" }, 404);
    return c.json(await buildGrantsPage(db, user), 200);
  })
  .openapi(mineRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    // 휴가 id를 뽑아 IN(...)으로 구간을 읽던 두 번째 왕복을 없앤다. 그 방식은
    // 휴가가 100건을 넘으면 D1 바인드 파라미터 상한에 걸려 이 목록이 통째로 500이 됐다.
    const [rows, segmentRows] = await db.batch([
      db
        .select()
        .from(leaves)
        .where(eq(leaves.userId, user.id))
        .orderBy(desc(leaves.startDate)),
      segmentsOfUserQuery(db, user.id),
    ]);
    const segments = foldSegmentRows(segmentRows);
    return c.json(
      { leaves: rows.map((row) => serializeLeave(row, segments)) },
      200,
    );
  })
  .openapi(createLeaveRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    if (!user.unitId) {
      return c.json({ error: "먼저 부대에 가입해주세요" }, 400);
    }
    const db = drizzle(c.env.DB);
    const segments = toSegments(input);

    const saved = await saveLeaveWithMerge(db, user, {
      id: crypto.randomUUID(),
      title: input.title,
      reason: input.reason ?? null,
      // 생략하면 기존 동작대로 "희망"(집계 반영)으로 저장한다.
      status: input.status ?? "shared",
      createdAt: new Date().toISOString(),
      segments,
    });
    if (!saved.ok) return c.json({ error: saved.error }, 400);

    // 휴가가 추가되면 부대 달력이 바뀌므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = await checkOverageAndNotify({
      db,
      unitId: user.unitId,
      changedLeave: saved.row,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    });
    return c.json(
      {
        leave: serializeLeave(
          saved.row,
          new Map([[saved.row.id, saved.segments]]),
        ),
        exceededDates,
      },
      201,
    );
  })
  .openapi(updateLeaveRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const existing = await db
      .select()
      .from(leaves)
      .where(and(eq(leaves.id, id), eq(leaves.userId, user.id)))
      .get();
    if (!existing) {
      return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    }

    const saved = await saveLeaveWithMerge(
      db,
      user,
      {
        id,
        title: input.title,
        reason: input.reason ?? null,
        // 상태를 보내지 않으면 지금 상태를 유지한다(초안이 조용히 공유되지 않게).
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        segments: toSegments(input),
      },
      { existingId: id },
    );
    if (!saved.ok) return c.json({ error: saved.error }, 400);

    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = user.unitId
      ? await checkOverageAndNotify({
          db,
          unitId: user.unitId,
          changedLeave: saved.row,
          waitUntil: (p) => c.executionCtx.waitUntil(p),
        })
      : [];
    return c.json(
      {
        leave: serializeLeave(
          saved.row,
          new Map([[saved.row.id, saved.segments]]),
        ),
        exceededDates,
      },
      200,
    );
  })
  .openapi(deleteLeaveRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    // 존재 확인과 삭제를 한 문장으로 합친다 — 소유자 조건을 DELETE에 그대로 걸면
    // 남의 휴가를 지울 수 없다는 보장은 같고, 왕복은 하나 줄어든다.
    // (deleteBlackoutRoute가 쓰는 것과 같은 방식이다.)
    const removed = await db
      .delete(leaves)
      .where(and(eq(leaves.id, id), eq(leaves.userId, user.id)))
      .run();
    if (removed.meta.changes === 0) {
      return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    }
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    return c.json({ ok: true as const }, 200);
  });
