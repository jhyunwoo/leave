import { createRoute, z } from "@hono/zod-openapi";
import { computeDayStats, monthBounds, monthSchema, unitCreateSchema } from "@leave/shared";
import { and, asc, eq, gte, inArray, like, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { leaves, units, users } from "../db/schema";
import { createApp } from "../lib/app";
import {
  calendarSchema,
  errorResponse,
  jsonContent,
  memberSchema,
  okSchema,
  unitSchema,
} from "../lib/responses";
import { serializeMember, serializeUnit } from "../lib/serialize";
import { authMiddleware } from "../middleware/auth";

const idParam = z.object({ id: z.string() });

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
  summary: "부대 생성 (최대 출타율 비율 포함, 생성자는 자동 가입)",
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

const joinRoute = createRoute({
  method: "post",
  path: "/{id}/join",
  tags: ["부대"],
  summary: "부대 가입 (기존 소속이 있으면 이동)",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(z.object({ unit: unitSchema }), "가입한 부대"),
    401: errorResponse("인증 실패"),
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
      createdAt: new Date().toISOString(),
    };
    await db.insert(units).values(unit);
    await db.update(users).set({ unitId: unit.id }).where(eq(users.id, user.id));
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
  .openapi(joinRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    await db.update(users).set({ unitId: id }).where(eq(users.id, user.id));
    const memberCount = await db.$count(users, eq(users.unitId, id));
    return c.json({ unit: serializeUnit(unit, memberCount) }, 200);
  })
  .openapi(leaveUnitRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db.update(users).set({ unitId: null }).where(eq(users.id, user.id));
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
      memberCount: members.length,
      ratio: {
        numerator: unit.maxLeaveNumerator,
        denominator: unit.maxLeaveDenominator,
      },
      rangeStart: start,
      rangeEnd: end,
    });

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
      };
    });

    return c.json(
      {
        month,
        unit: serializeUnit(unit, members.length),
        days,
        leaves: calendarLeaves,
      },
      200,
    );
  });
