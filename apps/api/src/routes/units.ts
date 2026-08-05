import { createRoute, z } from "@hono/zod-openapi";
import {
  blackoutCreateSchema,
  computeDayStats,
  isCountedLeaveStatus,
  monthBounds,
  monthSchema,
  shiftMonth,
  todayInSeoul,
  unitCreateSchema,
  unitInviteCreateSchema,
  unitJoinSchema,
  unitTransferSchema,
  unitUpdateSchema,
} from "@leave/shared";
import {
  and,
  asc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { drizzle, type DrizzleD1Database } from "drizzle-orm/d1";
import {
  leaves,
  unitBlackouts,
  unitInvites,
  units,
  userBlocks,
  users,
} from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import { segmentsForLeaves } from "../lib/leave-balances";
import {
  blackoutSchema,
  calendarSchema,
  errorResponse,
  issuedUnitInviteSchema,
  jsonContent,
  memberSchema,
  okSchema,
  unitSchema,
} from "../lib/responses";
import { generateInviteCode, sha256Hex } from "../lib/crypto";
import { serializeMember, serializeUnit } from "../lib/serialize";
import { authMiddleware } from "../middleware/auth";
import { rateLimit } from "../middleware/rate-limit";

const idParam = z.object({ id: z.string() });
const memberParam = z.object({ id: z.string(), userId: z.string() });

const DEFAULT_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const DEFAULT_INVITE_MAX_USES = 100;

async function createInvite(
  db: DrizzleD1Database,
  input: {
    unitId: string;
    createdBy: string;
    expiresAt: string;
    maxUses: number;
  },
) {
  const code = generateInviteCode();
  const row = {
    id: crypto.randomUUID(),
    unitId: input.unitId,
    codeHash: await sha256Hex(code),
    expiresAt: input.expiresAt,
    maxUses: input.maxUses,
    usedCount: 0,
    revokedAt: null,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
  };
  await db.insert(unitInvites).values(row);
  return {
    code,
    expiresAt: row.expiresAt,
    maxUses: row.maxUses,
    usedCount: row.usedCount,
  };
}

const createUnitRoute = createRoute({
  method: "post",
  path: "/",
  tags: ["부대"],
  summary: "비식별 그룹 생성 (생성자는 자동 가입·관리자)",
  description:
    "이름과 설명에 실제 부대명·부대번호·주소·위치, 병력 현황, 작전·훈련 정보를 입력하면 안 됩니다. 그룹 이름은 검색·색인되지 않으며 중복될 수 있습니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: unitCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(
      z.object({ unit: unitSchema, invite: issuedUnitInviteSchema }),
      "생성된 그룹과 한 번만 노출되는 초대코드",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    409: errorResponse("이미 다른 그룹 소속"),
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
    403: errorResponse("현재 부대원만 조회 가능"),
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
  },
});

const joinRoute = createRoute({
  method: "post",
  path: "/join",
  tags: ["부대"],
  summary: "초대코드로 그룹에 즉시 가입",
  description:
    "그룹 이름이나 UUID로는 가입할 수 없습니다. 유효하고 만료·소진·폐기되지 않은 초대코드만 사용할 수 있습니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: unitJoinSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(
      z.object({ joined: z.literal(true), unit: unitSchema }),
      "즉시 가입 완료",
    ),
    400: errorResponse("유효하지 않은 초대코드"),
    401: errorResponse("인증 실패"),
    409: errorResponse("이미 다른 그룹 소속"),
  },
});

const rotateInviteRoute = createRoute({
  method: "post",
  path: "/{id}/invite",
  tags: ["부대"],
  summary: "초대코드 회전·재발급 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: unitInviteCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(
      z.object({ invite: issuedUnitInviteSchema }),
      "재발급된 초대코드",
    ),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("현재 그룹 관리자만 가능"),
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

const blackoutsRoute = createRoute({
  method: "get",
  path: "/{id}/blackouts",
  tags: ["부대"],
  summary: "블랙아웃 기간 목록",
  description:
    "검열·훈련 등으로 출타율과 무관하게 휴가가 제한될 수 있는 기간입니다.",
  security: [{ Bearer: [] }],
  request: { params: idParam },
  responses: {
    200: jsonContent(
      z.object({ blackouts: z.array(blackoutSchema) }),
      "블랙아웃 목록",
    ),
    401: errorResponse("인증 실패"),
    403: errorResponse("부대원만 조회 가능"),
  },
});

const createBlackoutRoute = createRoute({
  method: "post",
  path: "/{id}/blackouts",
  tags: ["부대"],
  summary: "블랙아웃 기간 등록 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: idParam,
    body: {
      content: { "application/json": { schema: blackoutCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(z.object({ blackout: blackoutSchema }), "등록된 기간"),
    400: errorResponse("입력값 오류"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 등록 가능"),
  },
});

const deleteBlackoutRoute = createRoute({
  method: "delete",
  path: "/{id}/blackouts/{blackoutId}",
  tags: ["부대"],
  summary: "블랙아웃 기간 삭제 (관리자 전용)",
  security: [{ Bearer: [] }],
  request: {
    params: z.object({ id: z.string(), blackoutId: z.string() }),
  },
  responses: {
    200: jsonContent(okSchema, "삭제 완료"),
    401: errorResponse("인증 실패"),
    403: errorResponse("관리자만 삭제 가능"),
    404: errorResponse("기간 없음"),
  },
});

const app = createApp();
app.use("*", authMiddleware);
// 초대코드를 무차별 대입으로 찾아내지 못하게 막는 마지막 방어선.
// (코드 자체가 192비트라 현실적으로 불가능하지만, 시도 비용을 0으로 두지 않는다.)
app.use("/join", rateLimit({ name: "unit-join", limit: 5, windowSeconds: 600 }));
// 넓은 날짜 범위를 훑어 그룹 시계열을 통째로 긁어가는 것을 막는다.
app.use(
  "/:id/calendar",
  rateLimit({ name: "calendar", limit: 120, windowSeconds: 60 }),
);

export const unitRoutes = app
  .openapi(createUnitRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (user.unitId) {
      return c.json(
        { error: "현재 그룹에서 나간 뒤 새 그룹을 만들 수 있습니다" },
        409,
      );
    }

    const now = new Date().toISOString();
    const inviteExpiresAt =
      input.inviteExpiresAt !== undefined
        ? new Date(input.inviteExpiresAt).toISOString()
        : new Date(Date.now() + DEFAULT_INVITE_TTL_MS).toISOString();
    if (inviteExpiresAt <= now) {
      return c.json(
        { error: "초대코드 만료 시각은 현재보다 뒤여야 합니다" },
        400,
      );
    }
    const referenceMemberTotal = input.referenceMemberTotal ?? null;
    const lastTotalUpdatedAt =
      input.lastTotalUpdatedAt !== undefined
        ? input.lastTotalUpdatedAt
        : referenceMemberTotal === null
          ? null
          : now;
    const unit = {
      id: crypto.randomUUID(),
      name: input.name,
      description: input.description ?? null,
      referenceMemberTotal,
      maxLeaveCount: input.maxLeaveCount,
      returnDayCounts: input.returnDayCounts ?? true,
      lastTotalUpdatedAt,
      creatorId: user.id,
      adminId: user.id,
      imageKey: null,
      createdAt: now,
    };
    await db.insert(units).values(unit);
    const invite = await createInvite(db, {
      unitId: unit.id,
      createdBy: user.id,
      expiresAt: inviteExpiresAt,
      maxUses: input.inviteMaxUses ?? DEFAULT_INVITE_MAX_USES,
    });
    await db
      .update(users)
      .set({ unitId: unit.id })
      .where(eq(users.id, user.id));
    return c.json({ unit: serializeUnit(unit, 1), invite }, 201);
  })
  .openapi(getUnitRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "현재 그룹의 부대원만 조회할 수 있습니다" }, 403);
    }
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

    if (user.unitId !== id) {
      return c.json({ error: "현재 그룹 관리자만 수정할 수 있습니다" }, 403);
    }
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    if (unit.adminId !== user.id) {
      return c.json({ error: "부대 관리자만 수정할 수 있습니다" }, 403);
    }

    const patch: Partial<typeof units.$inferInsert> = {};
    if (input.name !== undefined) patch.name = input.name;
    if (input.description !== undefined) patch.description = input.description;
    if (input.referenceMemberTotal !== undefined) {
      patch.referenceMemberTotal = input.referenceMemberTotal;
      patch.lastTotalUpdatedAt =
        input.lastTotalUpdatedAt !== undefined
          ? input.lastTotalUpdatedAt
          : input.referenceMemberTotal === null
            ? null
            : new Date().toISOString();
    } else if (input.lastTotalUpdatedAt !== undefined) {
      patch.lastTotalUpdatedAt = input.lastTotalUpdatedAt;
    }
    if (input.maxLeaveCount !== undefined) {
      patch.maxLeaveCount = input.maxLeaveCount;
    }
    if (input.returnDayCounts !== undefined) {
      patch.returnDayCounts = input.returnDayCounts;
    }

    if (Object.keys(patch).length > 0) {
      await db.update(units).set(patch).where(eq(units.id, id));
    }
    // 최대 출타 인원 변경은 달력 통계를 바꾸므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, id);

    const updated = await db.select().from(units).where(eq(units.id, id)).get();
    const memberCount = await db.$count(users, eq(users.unitId, id));
    return c.json({ unit: serializeUnit(updated!, memberCount) }, 200);
  })
  .openapi(joinRoute, async (c) => {
    const { code } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (user.unitId) {
      return c.json(
        {
          error: "이미 그룹에 소속되어 있습니다. 먼저 현재 그룹에서 나가주세요",
        },
        409,
      );
    }

    const now = new Date().toISOString();
    const codeHash = await sha256Hex(code);
    const invite = await db
      .select()
      .from(unitInvites)
      .where(eq(unitInvites.codeHash, codeHash))
      .get();
    if (
      !invite ||
      invite.revokedAt !== null ||
      invite.expiresAt <= now ||
      invite.usedCount >= invite.maxUses
    ) {
      return c.json({ error: "유효하지 않은 초대코드입니다" }, 400);
    }

    const consumed = await db
      .update(unitInvites)
      .set({ usedCount: sql`${unitInvites.usedCount} + 1` })
      .where(
        and(
          eq(unitInvites.id, invite.id),
          isNull(unitInvites.revokedAt),
          gt(unitInvites.expiresAt, now),
          lt(unitInvites.usedCount, unitInvites.maxUses),
        ),
      )
      .run();
    if (consumed.meta.changes !== 1) {
      return c.json({ error: "유효하지 않은 초대코드입니다" }, 400);
    }

    const joined = await db
      .update(users)
      .set({ unitId: invite.unitId })
      .where(and(eq(users.id, user.id), isNull(users.unitId)))
      .run();
    if (joined.meta.changes !== 1) {
      // 같은 사용자의 동시 요청이 코드를 불필요하게 소진하지 않도록 보상한다.
      await db
        .update(unitInvites)
        .set({ usedCount: sql`${unitInvites.usedCount} - 1` })
        .where(and(eq(unitInvites.id, invite.id), gt(unitInvites.usedCount, 0)))
        .run();
      return c.json({ error: "이미 그룹에 소속되어 있습니다" }, 409);
    }

    const unit = await db
      .select()
      .from(units)
      .where(eq(units.id, invite.unitId))
      .get();
    if (!unit) {
      return c.json({ error: "유효하지 않은 초대코드입니다" }, 400);
    }
    const memberCount = await db.$count(users, eq(users.unitId, unit.id));
    await bumpUnitVersion(c.env.CACHE, unit.id);
    return c.json(
      { joined: true as const, unit: serializeUnit(unit, memberCount) },
      200,
    );
  })
  .openapi(rotateInviteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (user.unitId !== id) {
      return c.json({ error: "현재 그룹 관리자만 재발급할 수 있습니다" }, 403);
    }
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit || unit.adminId !== user.id) {
      return c.json({ error: "현재 그룹 관리자만 재발급할 수 있습니다" }, 403);
    }

    const now = new Date().toISOString();
    const expiresAt =
      input.expiresAt !== undefined
        ? new Date(input.expiresAt).toISOString()
        : new Date(Date.now() + DEFAULT_INVITE_TTL_MS).toISOString();
    if (expiresAt <= now) {
      return c.json(
        { error: "초대코드 만료 시각은 현재보다 뒤여야 합니다" },
        400,
      );
    }
    await db
      .update(unitInvites)
      .set({ revokedAt: now })
      .where(and(eq(unitInvites.unitId, id), isNull(unitInvites.revokedAt)));
    const invite = await createInvite(db, {
      unitId: id,
      createdBy: user.id,
      expiresAt,
      maxUses: input.maxUses ?? DEFAULT_INVITE_MAX_USES,
    });
    return c.json({ invite }, 201);
  })
  .openapi(removeMemberRoute, async (c) => {
    const { id, userId } = c.req.valid("param");
    const admin = c.get("user");
    const db = drizzle(c.env.DB);
    if (admin.unitId !== id) {
      return c.json({ error: "현재 그룹 관리자만 제거할 수 있습니다" }, 403);
    }
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
    if (admin.unitId !== id) {
      return c.json({ error: "현재 그룹 관리자만 이관할 수 있습니다" }, 403);
    }
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
      // 혼자 남은 관리자가 나가면 빈 그룹·초대코드·이미지를 정리한다.
      await db.update(users).set({ unitId: null }).where(eq(users.id, user.id));
      await db.delete(unitInvites).where(eq(unitInvites.unitId, unitId));
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
    // 차단은 이 목록에서만 숨긴다. 출타 집계에서 빼면 사람마다 다른 숫자를 보게 된다.
    const blocked = new Set(
      (
        await db
          .select({ id: userBlocks.blockedUserId })
          .from(userBlocks)
          .where(eq(userBlocks.userId, user.id))
          .all()
      ).map((row) => row.id),
    );
    return c.json(
      {
        members: rows
          .filter((m) => !blocked.has(m.id))
          .map((m) => serializeMember(m)),
      },
      200,
    );
  })
  .openapi(blackoutsRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "부대원만 조회할 수 있습니다" }, 403);
    }
    const db = drizzle(c.env.DB);
    const rows = await db
      .select()
      .from(unitBlackouts)
      .where(eq(unitBlackouts.unitId, id))
      .orderBy(asc(unitBlackouts.startDate))
      .all();
    return c.json(
      {
        blackouts: rows.map((b) => ({
          id: b.id,
          startDate: b.startDate,
          endDate: b.endDate,
          reason: b.reason,
        })),
      },
      200,
    );
  })
  .openapi(createBlackoutRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (user.unitId !== id) {
      return c.json({ error: "현재 그룹 관리자만 등록할 수 있습니다" }, 403);
    }
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit || unit.adminId !== user.id) {
      return c.json({ error: "현재 그룹 관리자만 등록할 수 있습니다" }, 403);
    }
    const row = {
      id: crypto.randomUUID(),
      unitId: id,
      startDate: input.startDate,
      endDate: input.endDate,
      reason: input.reason ?? null,
      createdBy: user.id,
      createdAt: new Date().toISOString(),
    };
    await db.insert(unitBlackouts).values(row);
    // 달력의 blocked 표시가 바뀌므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, id);
    return c.json(
      {
        blackout: {
          id: row.id,
          startDate: row.startDate,
          endDate: row.endDate,
          reason: row.reason,
        },
      },
      201,
    );
  })
  .openapi(deleteBlackoutRoute, async (c) => {
    const { id, blackoutId } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (user.unitId !== id) {
      return c.json({ error: "현재 그룹 관리자만 삭제할 수 있습니다" }, 403);
    }
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit || unit.adminId !== user.id) {
      return c.json({ error: "현재 그룹 관리자만 삭제할 수 있습니다" }, 403);
    }
    const removed = await db
      .delete(unitBlackouts)
      .where(
        and(eq(unitBlackouts.id, blackoutId), eq(unitBlackouts.unitId, id)),
      )
      .run();
    if (removed.meta.changes === 0) {
      return c.json({ error: "블랙아웃 기간을 찾을 수 없습니다" }, 404);
    }
    await bumpUnitVersion(c.env.CACHE, id);
    return c.json({ ok: true as const }, 200);
  })
  .openapi(calendarRoute, async (c) => {
    const { id } = c.req.valid("param");
    const { month } = c.req.valid("query");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "부대원만 조회할 수 있습니다" }, 403);
    }
    const currentMonth = todayInSeoul().slice(0, 7);
    if (
      month < shiftMonth(currentMonth, -3) ||
      month > shiftMonth(currentMonth, 3)
    ) {
      return c.json(
        { error: "달력은 현재 월 기준 앞뒤 3개월만 조회할 수 있습니다" },
        400,
      );
    }

    const db = drizzle(c.env.DB);
    const unit = await db.select().from(units).where(eq(units.id, id)).get();
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);

    const members = await db
      .select()
      .from(users)
      .where(eq(users.unitId, id))
      .all();
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

    const blackouts = await db
      .select()
      .from(unitBlackouts)
      .where(
        and(
          eq(unitBlackouts.unitId, id),
          lte(unitBlackouts.startDate, end),
          gte(unitBlackouts.endDate, start),
        ),
      )
      .orderBy(asc(unitBlackouts.startDate))
      .all();
    const isBlocked = (date: string) =>
      blackouts.some((b) => b.startDate <= date && date <= b.endDate);

    const days = computeDayStats({
      // 초안(draft)과 반려·취소된 계획은 실제로 나가지 않으므로 집계에서 뺀다.
      leaves: rows
        .filter((l) => isCountedLeaveStatus(l.status))
        .map((l) => ({
          userId: l.userId,
          startDate: l.startDate,
          endDate: l.endDate,
        })),
      maxCount: unit.maxLeaveCount,
      rangeStart: start,
      rangeEnd: end,
      returnDayCounts: unit.returnDayCounts,
    }).map((day) => ({
      date: day.date,
      count: day.count,
      allowed: day.allowed,
      exceeded: day.exceeded,
      blocked: isBlocked(day.date),
    }));
    const ownRows = rows.filter((row) => row.userId === user.id);
    const segmentMap = await segmentsForLeaves(
      db,
      ownRows.map((row) => row.id),
    );

    // 타인의 일정은 days 집계에만 반영하고 상세 레코드는 반환하지 않는다.
    const calendarLeaves = ownRows.map((l) => ({
      id: l.id,
      title: l.title,
      startDate: l.startDate,
      endDate: l.endDate,
      reason: l.reason,
      status: l.status,
      segments: segmentMap.get(l.id) ?? [],
    }));

    const payload = {
      month,
      unit: serializeUnit(unit, members.length),
      days,
      leaves: calendarLeaves,
      blackouts: blackouts.map((b) => ({
        id: b.id,
        startDate: b.startDate,
        endDate: b.endDate,
        reason: b.reason,
      })),
    };
    return c.json(payload, 200);
  });
