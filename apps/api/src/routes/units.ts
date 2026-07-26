import { createRoute, z } from "@hono/zod-openapi";
import {
  computeDayStats,
  effectiveMemberCount,
  monthBounds,
  monthSchema,
  unitCreateSchema,
  unitTransferSchema,
  unitUpdateSchema,
} from "@leave/shared";
import { and, asc, eq, gte, inArray, like, lte, ne, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { leaves, unitJoinRequests, units, users } from "../db/schema";
import { createApp } from "../lib/app";
import {
  bumpUnitVersion,
  getCachedCalendar,
  putCachedCalendar,
} from "../lib/cache";
import { allocationsForLeaves } from "../lib/leave-balances";
import {
  calendarSchema,
  errorResponse,
  jsonContent,
  joinRequestSchema,
  memberSchema,
  okSchema,
  unitSchema,
} from "../lib/responses";
import { serializeMember, serializeUnit } from "../lib/serialize";
import { authMiddleware } from "../middleware/auth";

const idParam = z.object({ id: z.string() });
const memberParam = z.object({ id: z.string(), userId: z.string() });

const listRoute = createRoute({
  method: "get",
  path: "/",
  tags: ["부대"],
  summary: "부대 검색",
  security: [{ Bearer: [] }],
  request: { query: z.object({ q: z.string().optional() }) },
  responses: {
    200: jsonContent(z.object({ units: z.array(unitSchema) }), "부대 목록"),
    401: errorResponse("인증 실패"),
  },
});

const createUnitRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["부대"],
  summary: "부대 생성 (생성자는 자동 가입·관리자)",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: unitCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(z.object({ unit: unitSchema }), "생성된 부대"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    409: errorResponse("같은 이름의 부대가 이미 존재"),
  },
});

const getUnitRoute = createRoute({
  method: "get",
  path: "/{id}",
  tags: ["부대"],
  summary: "부대 상세",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "부대 정보"),
    401: errorResponse("인증 실패"),
    404: errorResponse("부대 없음"),
  },
});

const updateUnitRoute = createRoute({
  method: "patch",
  path: "/{id}",
  tags: ["부대"],
  summary: "부대 정보 수정 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: unitUpdateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "수정된 부대"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 수정 가능"),
    404: errorResponse("부대 없음"),
    409: errorResponse("같은 이름의 부대가 이미 존재"),
  },
});

const joinRoute = createRoute({
  method: "post",
  path: "/{id}/join",
  tags: ["부대"],
  summary: "부대 가입 신청 (관리자 승인 필요, 빈 부대는 즉시 가입)",
  description:
    "부대원이 아무도 없는 부대에는 승인해 줄 관리자가 없으므로, 처음 들어온 사람이 즉시 가입되고 관리자가 됩니다.",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(
      z.object({ requested: z.boolean(), joined: z.boolean() }),
      "가입 신청 완료(requested) 또는 즉시 가입·관리자 등극(joined)",
    ),
    401: errorResponse("인증 실패"),
    404: errorResponse("부대 없음"),
    409: errorResponse("이미 이 부대 소속"),
  },
});

const cancelJoinRoute = createRoute({
  method: "post",
  path: "/join/cancel",
  tags: ["부대"],
  summary: "내 가입 신청 취소",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "취소 완료"),
    401: errorResponse("인증 실패"),
  },
});

const requestsRoute = createRoute({
  method: "get",
  path: "/{id}/requests",
  tags: ["부대"],
  summary: "대기 중인 가입 신청 목록 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(
      z.object({ requests: z.array(joinRequestSchema) }),
      "가입 신청 목록",
    ),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 조회 가능"),
    404: errorResponse("부대 없음"),
  },
});

const approveRoute = createRoute({
  method: "post",
  path: "/{id}/requests/{userId}/approve",
  tags: ["부대"],
  summary: "가입 신청 승인 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: { params: memberParam },
  responses: {
    200: jsonContent(okSchema, "승인 완료"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 가능"),
    404: errorResponse("신청 없음"),
  },
});

const rejectRoute = createRoute({
  method: "post",
  path: "/{id}/requests/{userId}/reject",
  tags: ["부대"],
  summary: "가입 신청 거절 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: { params: memberParam },
  responses: {
    200: jsonContent(okSchema, "거절 완료"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 가능"),
    404: errorResponse("신청 없음"),
  },
});

const removeMemberRoute = createRoute({
  method: "post",
  path: "/{id}/members/{userId}/remove",
  tags: ["부대"],
  summary: "부대원 제거 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: { params: memberParam },
  responses: {
    200: jsonContent(okSchema, "제거 완료"),
    400: errorResponse("자기 자신은 제거 불가"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 가능"),
    404: errorResponse("부대원 없음"),
  },
});

const transferRoute = createRoute({
  method: "post",
  path: "/{id}/transfer",
  tags: ["부대"],
  summary: "관리자 이관 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: unitTransferSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "이관 완료"),
    400: errorResponse("대상이 부대원이 아님"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 가능"),
    404: errorResponse("부대 없음"),
  },
});

const leaveUnitRoute = createRoute({
  method: "post",
  path: "/leave",
  tags: ["부대"],
  summary: "부대 탈퇴",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "탈퇴 완료"),
    401: errorResponse("인증 실패"),
    409: errorResponse("관리자는 이관 후 나갈 수 있음"),
  },
});

const membersRoute = createRoute({
  method: "get",
  path: "/{id}/members",
  tags: ["부대"],
  summary: "부대원 목록 (자동 계산된 계급 포함)",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(z.object({ members: z.array(memberSchema) }), "부대원"),
    401: errorResponse("인증 실패"),
    403: errorResponse("부대원만 조회 가능"),
  },
});

const calendarRoute = createRoute({
  method: "get",
  path: "/{id}/calendar",
  tags: ["부대"],
  summary: "부대 월별 휴가 달력 (일별 출타 인원·초과 여부 포함)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    query: z.object({ month: monthSchema }),
  },
  responses: {
    200: jsonContent(calendarSchema, "달력 데이터"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("부대원만 조회 가능"),
    404: errorResponse("부대 없음"),
  },
});

const app = createApp();
app.use("*", authMiddleware);

export const unitRoutes = app
  .openapi(listRoute, async (c) => {
    const { q } = c.req.valid("query");
    const db = drizzle(c.env.DB);
    const keyword = q?.trim();
    const rows = await db
      .select({
        unit: units,
        memberCount: sql<number>`cast(count(${users.id}) as integer)`,
      })
      .from(units)
      .leftJoin(users, eq(users.unitId, units.id))
      .where(keyword ? like(units.name, `%${keyword}%`) : undefined)
      .groupBy(units.id)
      .orderBy(asc(units.name))
      .limit(30)
      .all();
    return c.json(
      { units: rows.map((r) => serializeUnit(r.unit, r.memberCount)) },
      200,
    );
  })
  .openapi(createUnitRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const dup = await db
      .select({ id: units.id })
      .from(units)
      .where(eq(units.name, input.name))
      .get();
    if (dup) {
      return c.json({ error: "같은 이름의 부대가 이미 있습니다" }, 409);
    }

    const unit = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description ?? null,
      maxLeaveNumerator: input.maxLeaveNumerator,
      maxLeaveDenominator: input.maxLeaveDenominator,
      creatorId: user.id,
      adminId: user.id,
      headcount: input.headcount ?? null,
      imageKey: null,
      createdAt: new Date().toISOString(),
    };
    await db.insert(units).values(unit);
    await db
      .update(users)
      .set({ unitId: unit.id })
      .where(eq(users.id, user.id));
    // 생성자는 바로 가입되므로 남아있던 다른 대기 신청은 정리한다.
    await db
      .delete(unitJoinRequests)
      .where(eq(unitJoinRequests.userId, user.id));
    return c.json({ unit: serializeUnit(unit, 1) }, 201);
  })
  .openapi(getUnitRoute, async (c) => {
    const { id } = c.req.valid("param");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    const memberCount = await db.$count(users, eq(users.unitId, id));
    return c.json({ unit: serializeUnit(unit, memberCount) }, 200);
  })
  .openapi(updateUnitRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== user.id) {
      return c.json({ error: "부대 관리자만 수정할 수 있습니다" }, 403);
    }

    if (input.name && input.name !== unit.name) {
      const dup = await db
        .select({ id: units.id })
        .from(units)
        .where(and(eq(units.name, input.name), ne(units.id, id)))
        .get();
      if (dup)
        return c.json({ error: "같은 이름의 부대가 이미 있습니다" }, 409);
    }

    const patch: Partial<typeof units.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.maxLeaveNumerator !== undefined) {
      patch.maxLeaveNumerator = input.maxLeaveNumerator;
    }
    if (input.maxLeaveDenominator !== undefined) {
      patch.maxLeaveDenominator = input.maxLeaveDenominator;
    }
    if (input.headcount !== undefined) patch.headcount = input.headcount;

    if (Object.keys(patch).length > 0) {
      await db.update(units).set(patch).where(eq(units.id, id));
    }
    // 출타율·인원 변경은 달력 통계를 바꾸므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, id);

    const updated = await db.select().from(units).where(eq(units.id, id)).get();
    const memberCount = await db.$count(users, eq(users.unitId, id));
    return c.json({ unit: serializeUnit(updated!, memberCount) }, 200);
  })
  .openapi(joinRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (user.unitId === id) {
      return c.json({ error: "이미 이 부대의 부대원입니다" }, 409);
    }

    // 사용자당 대기 신청은 하나만 유지 — 기존 신청을 교체한다.
    await db
      .delete(unitJoinRequests)
      .where(eq(unitJoinRequests.userId, user.id));

    // 부대원이 아무도 없으면 승인해 줄 관리자가 없다.
    // 이 경우 처음 들어온 사람이 바로 가입되고 관리자를 맡는다.
    const memberCount = await db.$count(users, eq(users.unitId, id));
    if (memberCount === 0) {
      // 이미 다른 부대 소속이면 즉시 옮기지 않는다.
      // (관리자였다면 원래 부대가 관리자 없이 남게 되므로 먼저 정리하도록 안내)
      if (user.unitId) {
        return c.json(
          { error: "지금 부대에서 나간 뒤에 가입할 수 있습니다" },
          409,
        );
      }
      await db.update(users).set({ unitId: id }).where(eq(users.id, user.id));
      await db.update(units).set({ adminId: user.id }).where(eq(units.id, id));
      await bumpUnitVersion(c.env.CACHE, id);
      return c.json({ requested: false, joined: true }, 200);
    }

    await db.insert(unitJoinRequests).values({
      id: crypto.randomUUID(),
      unitId: id,
      userId: user.id,
      createdAt: new Date().toISOString(),
    });
    return c.json({ requested: true, joined: false }, 200);
  })
  .openapi(cancelJoinRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db
      .delete(unitJoinRequests)
      .where(eq(unitJoinRequests.userId, user.id));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(requestsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== user.id) {
      return c.json({ error: "부대 관리자만 조회할 수 있습니다" }, 403);
    }
    const rows = await db
      .select({ req: unitJoinRequests, user: users })
      .from(unitJoinRequests)
      .innerJoin(users, eq(users.id, unitJoinRequests.userId))
      .where(eq(unitJoinRequests.unitId, id))
      .orderBy(asc(unitJoinRequests.createdAt))
      .all();
    const requests = rows.map((r) => {
      const m = serializeMember(r.user);
      return {
        userId: r.user.id,
        name: m.name,
        branch: m.branch,
        branchLabel: m.branchLabel,
        rank: m.rank,
        rankLabel: m.rankLabel,
        profileImageKey: m.profileImageKey,
        createdAt: r.req.createdAt,
      };
    });
    return c.json({ requests }, 200);
  })
  .openapi(approveRoute, async (c) => {
    const { id, userId } = c.req.valid("param");
    const admin = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== admin.id) {
      return c.json({ error: "부대 관리자만 승인할 수 있습니다" }, 403);
    }
    const req = await db
      .select()
      .from(unitJoinRequests)
      .where(
        and(
          eq(unitJoinRequests.unitId, id),
          eq(unitJoinRequests.userId, userId),
        ),
      )
      .get();
    if (!req) return c.json({ error: "가입 신청을 찾을 수 없습니다" }, 404);

    const target = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    const previousUnitId = target?.unitId ?? null;
    await db.update(users).set({ unitId: id }).where(eq(users.id, userId));
    await db
      .delete(unitJoinRequests)
      .where(eq(unitJoinRequests.userId, userId));
    await bumpUnitVersion(c.env.CACHE, id);
    if (previousUnitId && previousUnitId !== id) {
      await bumpUnitVersion(c.env.CACHE, previousUnitId);
    }
    return c.json({ ok: true as const }, 200);
  })
  .openapi(rejectRoute, async (c) => {
    const { id, userId } = c.req.valid("param");
    const admin = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== admin.id) {
      return c.json({ error: "부대 관리자만 거절할 수 있습니다" }, 403);
    }
    const res = await db
      .delete(unitJoinRequests)
      .where(
        and(
          eq(unitJoinRequests.unitId, id),
          eq(unitJoinRequests.userId, userId),
        ),
      )
      .run();
    if (res.meta.changes === 0) {
      return c.json({ error: "가입 신청을 찾을 수 없습니다" }, 404);
    }
    return c.json({ ok: true as const }, 200);
  })
  .openapi(removeMemberRoute, async (c) => {
    const { id, userId } = c.req.valid("param");
    const admin = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== admin.id) {
      return c.json({ error: "부대 관리자만 제거할 수 있습니다" }, 403);
    }
    if (userId === admin.id) {
      return c.json({ error: "관리자 자신은 제거할 수 없습니다" }, 400);
    }
    const target = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!target || target.unitId !== id) {
      return c.json({ error: "해당 부대원을 찾을 수 없습니다" }, 404);
    }
    await db.update(users).set({ unitId: null }).where(eq(users.id, userId));
    await bumpUnitVersion(c.env.CACHE, id);
    return c.json({ ok: true as const }, 200);
  })
  .openapi(transferRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { userId } = c.req.valid("json");
    const admin = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== admin.id) {
      return c.json({ error: "부대 관리자만 이관할 수 있습니다" }, 403);
    }
    const target = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!target || target.unitId !== id) {
      return c.json({ error: "대상이 이 부대의 부대원이 아닙니다" }, 400);
    }
    await db.update(units).set({ adminId: userId }).where(eq(units.id, id));
    const updated = await db.select().from(units).where(eq(units.id, id)).get();
    const memberCount = await db.$count(users, eq(users.unitId, id));
    return c.json({ unit: serializeUnit(updated!, memberCount) }, 200);
  })
  .openapi(leaveUnitRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const unitId = user.unitId;
    if (!unitId) return c.json({ ok: true as const }, 200);

    const unit = await db
      .select()
      .from(units)
      .where(eq(units.id, unitId))
      .get();
    if (unit && unit.adminId === user.id) {
      const otherCount = await db.$count(
        users,
        and(eq(users.unitId, unitId), ne(users.id, user.id)),
      );
      if (otherCount > 0) {
        return c.json(
          {
            error: "관리자는 다른 부대원에게 관리자를 넘긴 뒤 나갈 수 있습니다",
          },
          409,
        );
      }
      // 혼자 남은 관리자가 나가면 빈 부대·대기 신청·이미지를 정리한다.
      await db.update(users).set({ unitId: null }).where(eq(users.id, user.id));
      await db
        .delete(unitJoinRequests)
        .where(eq(unitJoinRequests.unitId, unitId));
      await db.delete(units).where(eq(units.id, unitId));
      if (unit.imageKey) {
        c.executionCtx.waitUntil(c.env.BUCKET.delete(unit.imageKey));
      }
      await bumpUnitVersion(c.env.CACHE, unitId);
      return c.json({ ok: true as const }, 200);
    }

    await db.update(users).set({ unitId: null }).where(eq(users.id, user.id));
    await bumpUnitVersion(c.env.CACHE, unitId);
    return c.json({ ok: true as const }, 200);
  })
  .openapi(membersRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "부대원만 조회할 수 있습니다" }, 403);
    }
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.unitId, id))
      .orderBy(asc(users.name))
      .all();
    return c.json({ members: rows.map((m) => serializeMember(m)) }, 200);
  })
  .openapi(calendarRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { month } = c.req.valid("query");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "부대원만 조회할 수 있습니다" }, 403);
    }

    // KV 캐시 히트 시 D1 조회·출타율 계산 없이 즉시 반환한다.
    const cached = await getCachedCalendar<z.infer<typeof calendarSchema>>(
      c.env.CACHE,
      id,
      month,
    );
    if (cached) return c.json(cached, 200);

    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);

    const members = await db
      .select()
      .from(users)
      .where(eq(users.unitId, id))
      .all();
    const membersById = new Map(members.map((m) => [m.id, m]));
    const { start, end } = monthBounds(month);

    const memberIds = members.map((m) => m.id);
    const rows =
      memberIds.length > 0
        ? await db
            .select()
            .from(leaves)
            .where(
              and(
                inArray(leaves.userId, memberIds),
                lte(leaves.startDate, end),
                gte(leaves.endDate, start),
              ),
            )
            .orderBy(asc(leaves.startDate))
            .all()
        : [];

    const days = computeDayStats({
      leaves: rows.map((l) => ({
        userId: l.userId,
        startDate: l.startDate,
        endDate: l.endDate,
      })),
      memberCount: effectiveMemberCount(unit.headcount, members.length),
      ratio: {
        numerator: unit.maxLeaveNumerator,
        denominator: unit.maxLeaveDenominator,
      },
      rangeStart: start,
      rangeEnd: end,
    });
    const allocationMap = await allocationsForLeaves(
      db,
      rows.map((row) => row.id),
    );

    const calendarLeaves = rows.map((l) => {
      const owner = membersById.get(l.userId);
      const member = owner ? serializeMember(owner) : null;
      return {
        id: l.id,
        userId: l.userId,
        userName: member?.name ?? "(알 수 없음)",
        userRankLabel: member?.rankLabel ?? "",
        userProfileImageKey: member?.profileImageKey ?? null,
        title: l.title,
        startDate: l.startDate,
        endDate: l.endDate,
        reason: l.reason,
        allocations: allocationMap.get(l.id) ?? [],
      };
    });

    const payload = {
      month,
      unit: serializeUnit(unit, members.length),
      days,
      leaves: calendarLeaves,
    };
    // 계산 결과를 캐싱(응답을 막지 않도록 백그라운드로).
    c.executionCtx.waitUntil(
      putCachedCalendar(c.env.CACHE, id, month, payload),
    );
    return c.json(payload, 200);
  });
