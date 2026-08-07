/**
 * 휴가·보유 휴가 라우트.
 *
 * 마운트 위치: `/leaves` (apps/api/src/index.ts).
 * 다루는 것: 내 휴가 CRUD, 재원별 잔여 요약, 적립분 관리, 정기외박 설정.
 *
 * 휴가를 저장하기 전에 반드시 두 가지를 확인한다.
 *  1) 구간들이 겹치지 않고 빈틈없이 이어지는가(스키마)
 *  2) 각 구간의 재원이 실제로 남아 있는가(assertSegmentsAvailable)
 * 저장 뒤에는 그룹 달력 캐시를 무효화하고 초과 알림을 보낸다.
 */

import { createRoute, z } from "@hono/zod-openapi";
import {
  inclusiveDays,
  leaveBalanceUpdateSchema,
  leaveCreateSchema,
  leaveGrantCreateSchema,
  leaveGrantUpdateSchema,
  leaveUpdateSchema,
  regularOvernightConfigSchema,
  segmentsRange,
  sortSegments,
  type LeaveCreateInput,
  type LeaveSegment,
} from "@leave/shared";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { leaves, leaveSegments, type LeaveRow } from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import {
  buildGrantsPage,
  createGrant,
  deleteGrant,
  updateGrant,
} from "../lib/leave-grants";
import {
  assertSegmentsAvailable,
  getLeaveBalanceSummary,
  insertLeaveSegments,
  saveRegularOvernightConfig,
  segmentRowsFor,
  segmentsForLeaves,
  updateLeaveBalanceTotals,
} from "../lib/leave-balances";
import { checkOverageAndNotify } from "../lib/overage";
import {
  errorResponse,
  jsonContent,
  leaveBalanceSummarySchema,
  leaveGrantsPageSchema,
  leaveSchema,
  okSchema,
} from "../lib/responses";
import { authMiddleware } from "../middleware/auth";

const idParam = z.object({ id: z.string() });

/** 등록/수정 응답: 휴가 + 그로 인해 최대 출타 인원이 초과된 날짜 목록. */
const leaveResultSchema = z.object({
  leave: leaveSchema,
  exceededDates: z.array(z.string()),
});

const mineRoute = createRoute({
  method: "get",
  path: "/mine",
  tags: ["휴가"],
  summary: "내 휴가 목록",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(z.object({ leaves: z.array(leaveSchema) }), "내 휴가"),
    401: errorResponse("인증 실패"),
  },
});

const balancesRoute = createRoute({
  method: "get",
  path: "/balances",
  tags: ["휴가"],
  summary: "내 휴가 재원 총량·사용량·잔여량",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(leaveBalanceSummarySchema, "휴가 재원 현황"),
    401: errorResponse("인증 실패"),
  },
});

const updateBalancesRoute = createRoute({
  method: "put",
  path: "/balances",
  tags: ["휴가"],
  summary: "내 휴가 재원 총량 수정 (구버전 앱 호환)",
  description:
    "만기 없는 기본 적립분 하나를 늘리고 줄인다. 만기가 있는 적립분은 /leaves/grants에서만 다룬다.",
  deprecated: true,
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: leaveBalanceUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveBalanceSummarySchema, "수정된 휴가 재원 현황"),
    400: errorResponse("이미 사용한 일수보다 작게 설정"),
    401: errorResponse("인증 실패"),
  },
});

const regularOvernightRoute = createRoute({
  method: "put",
  path: "/regular-overnight",
  tags: ["휴가"],
  summary: "정기외박 자동 적립 설정",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: {
        "application/json": { schema: regularOvernightConfigSchema },
      },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveBalanceSummarySchema, "정기외박 설정"),
    400: errorResponse("입력값 오류 또는 지원하지 않는 군종"),
    401: errorResponse("인증 실패"),
  },
});

const grantsRoute = createRoute({
  method: "get",
  path: "/grants",
  tags: ["휴가"],
  summary: "보유 휴가 — 적립분·주기 현황",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(leaveGrantsPageSchema, "보유 휴가 현황"),
    401: errorResponse("인증 실패"),
  },
});

const createGrantRoute = createRoute({
  method: "post",
  path: "/grants",
  tags: ["휴가"],
  summary: "적립분 추가",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: leaveGrantCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(leaveGrantsPageSchema, "추가 후 보유 휴가 현황"),
    400: errorResponse("입력값 오류 또는 자동 적립 재원"),
    401: errorResponse("인증 실패"),
  },
});

const updateGrantRoute = createRoute({
  method: "patch",
  path: "/grants/{id}",
  tags: ["휴가"],
  summary: "적립분 수정",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: leaveGrantUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveGrantsPageSchema, "수정 후 보유 휴가 현황"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    404: errorResponse("적립분 없음 또는 권한 없음"),
  },
});

const deleteGrantRoute = createRoute({
  method: "delete",
  path: "/grants/{id}",
  tags: ["휴가"],
  summary: "적립분 삭제",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(leaveGrantsPageSchema, "삭제 후 보유 휴가 현황"),
    401: errorResponse("인증 실패"),
    404: errorResponse("적립분 없음 또는 권한 없음"),
  },
});

const createLeaveRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["휴가"],
  summary: "휴가 등록 (제목·시작일·종료일 필수, 사유 선택)",
  description:
    "등록으로 특정 날짜의 최대 출타 인원이 초과되면 해당 날짜에 휴가 중인 모든 부대원에게 알림이 전송됩니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: leaveCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(leaveResultSchema, "등록된 휴가 + 초과일"),
    400: errorResponse("입력값 오류 또는 소속 부대 없음"),
    401: errorResponse("인증 실패"),
  },
});

const updateLeaveRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["휴가"],
  summary: "휴가 수정",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: leaveUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(leaveResultSchema, "수정된 휴가 + 초과일"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    404: errorResponse("휴가 없음 또는 권한 없음"),
  },
});

const deleteLeaveRoute = createRoute({
  method: "delete",
  path: "/{id}",
  tags: ["휴가"],
  summary: "휴가 삭제",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
    404: errorResponse("휴가 없음 또는 권한 없음"),
  },
});

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
      return c.json(
        {
          error: error instanceof Error ? error.message : "수정하지 못했습니다",
        },
        400,
      );
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
      return c.json(
        {
          error: error instanceof Error ? error.message : "설정하지 못했습니다",
        },
        400,
      );
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
      return c.json(
        {
          error: error instanceof Error ? error.message : "추가하지 못했습니다",
        },
        400,
      );
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
      return c.json(
        {
          error: error instanceof Error ? error.message : "수정하지 못했습니다",
        },
        400,
      );
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
    const rows = await db
      .select()
      .from(leaves)
      .where(eq(leaves.userId, user.id))
      .orderBy(desc(leaves.startDate))
      .all();
    const segments = await segmentsForLeaves(
      db,
      rows.map((row) => row.id),
    );
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

    const leave: LeaveRow = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: input.title,
      startDate: range.startDate,
      endDate: range.endDate,
      reason: input.reason ?? null,
      // 생략하면 기존 동작대로 "희망"(집계 반영)으로 저장한다.
      status: input.status ?? "shared",
      createdAt: new Date().toISOString(),
    };
    await db.insert(leaves).values(leave);
    await insertLeaveSegments(db, leave.id, segments);
    // 휴가가 추가되면 부대 달력이 바뀌므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = await checkOverageAndNotify({
      db,
      unitId: user.unitId,
      changedLeave: leave,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    });
    return c.json(
      {
        leave: serializeLeave(leave, new Map([[leave.id, segments]])),
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
    const segments = toSegments(input);
    const range = segmentsRange(segments)!;
    try {
      await assertSegmentsAvailable(db, user, segments, id);
    } catch (error) {
      return c.json(
        {
          error: error instanceof Error ? error.message : "잔여량이 부족합니다",
        },
        400,
      );
    }

    const updated: LeaveRow = {
      ...existing,
      title: input.title,
      startDate: range.startDate,
      endDate: range.endDate,
      reason: input.reason ?? null,
      // 상태를 보내지 않으면 지금 상태를 유지한다(초안이 조용히 공유되지 않게).
      status: input.status ?? existing.status,
    };
    await db.batch([
      db
        .update(leaves)
        .set({
          title: updated.title,
          startDate: updated.startDate,
          endDate: updated.endDate,
          reason: updated.reason,
          status: updated.status,
        })
        .where(eq(leaves.id, id)),
      db.delete(leaveSegments).where(eq(leaveSegments.leaveId, id)),
      db.insert(leaveSegments).values(segmentRowsFor(id, segments)),
    ]);
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = user.unitId
      ? await checkOverageAndNotify({
          db,
          unitId: user.unitId,
          changedLeave: updated,
          waitUntil: (p) => c.executionCtx.waitUntil(p),
        })
      : [];
    return c.json(
      {
        leave: serializeLeave(updated, new Map([[id, segments]])),
        exceededDates,
      },
      200,
    );
  })
  .openapi(deleteLeaveRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const existing = await db
      .select({ id: leaves.id })
      .from(leaves)
      .where(and(eq(leaves.id, id), eq(leaves.userId, user.id)))
      .get();
    if (!existing) {
      return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    }
    await db.delete(leaves).where(eq(leaves.id, id));
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);
    return c.json({ ok: true as const }, 200);
  });
