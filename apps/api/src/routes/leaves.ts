import { createRoute, z } from "@hono/zod-openapi";
import { leaveCreateSchema, leaveUpdateSchema } from "@leave/shared";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { leaves, type LeaveRow } from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import { checkOverageAndNotify } from "../lib/overage";
import {
  errorResponse,
  jsonContent,
  leaveSchema,
  okSchema,
} from "../lib/responses";
import { authMiddleware } from "../middleware/auth";

const idParam = z.object({ id: z.string() });

/** 등록/수정 응답: 휴가 + 그로 인해 출타율이 초과된 날짜 목록. */
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

const createLeaveRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["휴가"],
  summary: "휴가 등록 (제목·시작일·종료일 필수, 사유 선택)",
  description:
    "등록으로 특정 날짜의 출타율이 초과되면 해당 날짜에 휴가 중인 모든 부대원에게 알림이 전송됩니다.",
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

function serializeLeave(row: LeaveRow) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    startDate: row.startDate,
    endDate: row.endDate,
    reason: row.reason,
    createdAt: row.createdAt,
  };
}

const app = createApp();
app.use("*", authMiddleware);

export const leaveRoutes = app
  .openapi(mineRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(leaves)
      .where(eq(leaves.userId, user.id))
      .orderBy(desc(leaves.startDate))
      .all();
    return c.json({ leaves: rows.map(serializeLeave) }, 200);
  })
  .openapi(createLeaveRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    if (!user.unitId) {
      return c.json({ error: "먼저 부대에 가입해주세요" }, 400);
    }
    const db = drizzle(c.env.DB);

    const leave: LeaveRow = {
      id: crypto.randomUUID(),
      userId: user.id,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason ?? null,
      createdAt: new Date().toISOString(),
    };
    await db.insert(leaves).values(leave);
    // 휴가가 추가되면 부대 달력이 바뀌므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = await checkOverageAndNotify({
      db,
      unitId: user.unitId,
      changedLeave: leave,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    });
    return c.json({ leave: serializeLeave(leave), exceededDates }, 201);
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

    const updated: LeaveRow = {
      ...existing,
      title: input.title,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason ?? null,
    };
    await db
      .update(leaves)
      .set({
        title: updated.title,
        startDate: updated.startDate,
        endDate: updated.endDate,
        reason: updated.reason,
      })
      .where(eq(leaves.id, id));
    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = user.unitId
      ? await checkOverageAndNotify({
          db,
          unitId: user.unitId,
          changedLeave: updated,
          waitUntil: (p) => c.executionCtx.waitUntil(p),
        })
      : [];
    return c.json({ leave: serializeLeave(updated), exceededDates }, 200);
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
