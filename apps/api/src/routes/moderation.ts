/**
 * 신고·차단 라우트.
 *
 * 마운트 위치: `/moderation` (apps/api/src/index.ts).
 * 자유 입력(그룹 이름·설명, 참여자 별칭)이 남아 있는 한 스토어 심사가 요구하는
 * 최소 안전장치다. 자세한 배경은 아래 라우트 정의 주석 참고.
 */

import { createRoute, z } from "@hono/zod-openapi";
import { blockCreateSchema, reportCreateSchema } from "@leave/shared";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import {
  contentReports,
  friendships,
  units,
  userBlocks,
  users,
} from "../db/schema";
import { createApp } from "../lib/app";
import { runBatch } from "../lib/d1";
import {
  blockedUserSchema,
  errorResponse,
  jsonContent,
  okSchema,
  reportSchema,
} from "../lib/responses";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";

/**
 * 자유 입력이 남아 있는 한(그룹 별칭·설명, 참여자 별칭) 신고·차단 경로가 필요하다.
 * Apple App Review Guideline 1.2, Google Play UGC 정책의 최소 요건이다.
 *
 * 차단은 **목록 표시에만** 영향을 준다. 출타 집계에서 빼면 남은 사람이 보는
 * 숫자가 사람마다 달라지고, 그 순간 이 앱의 유일한 쓸모인 정확도가 무너진다.
 */
const createReportRoute = createRoute({
  method: "post",
  path: "/reports",
  tags: ["신고·차단"],
  summary: "그룹 이름·설명이나 참여자 별칭 신고",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: reportCreateSchema } },
      required: true,
    },
  },
  responses: {
    201: jsonContent(z.object({ report: reportSchema }), "접수된 신고"),
    400: errorResponse("입력값 오류 또는 대상 없음"),
    401: errorResponse("인증 실패"),
  },
});

const listBlocksRoute = createRoute({
  method: "get",
  path: "/blocks",
  tags: ["신고·차단"],
  summary: "내가 차단한 사용자 목록",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ blocks: z.array(blockedUserSchema) }),
      "차단 목록",
    ),
    401: errorResponse("인증 실패"),
  },
});

const createBlockRoute = createRoute({
  method: "post",
  path: "/blocks",
  tags: ["신고·차단"],
  summary: "사용자 차단",
  description:
    "차단하면 참여자 목록에서 보이지 않습니다. 출타 집계에는 그대로 반영됩니다.",
  security: [{ Bearer: [] }],
  request: {
    body: {
      content: { "application/json": { schema: blockCreateSchema } },
      required: true,
    },
  },
  responses: {
    200: jsonContent(okSchema, "차단 완료"),
    400: errorResponse("자기 자신은 차단할 수 없음"),
    401: errorResponse("인증 실패"),
    404: errorResponse("대상 없음"),
  },
});

const deleteBlockRoute = createRoute({
  method: "delete",
  path: "/blocks/{userId}",
  tags: ["신고·차단"],
  summary: "차단 해제",
  security: [{ Bearer: [] }],
  request: { params: z.object({ userId: z.string() }) },
  responses: {
    200: jsonContent(okSchema, "해제 완료"),
    401: errorResponse("인증 실패"),
  },
});

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);

export const moderationRoutes = app
  .openapi(createReportRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    // 아무 UUID나 신고해 존재 여부를 떠보지 못하도록, 내가 볼 수 있는 대상만 받는다.
    if (input.targetType === "unit") {
      if (user.unitId !== input.targetId) {
        return c.json({ error: "신고 대상을 찾을 수 없습니다" }, 400);
      }
      const unit = await db
        .select({ id: units.id })
        .from(units)
        .where(eq(units.id, input.targetId))
        .get();
      if (!unit) return c.json({ error: "신고 대상을 찾을 수 없습니다" }, 400);
    } else {
      const target = await db
        .select({ id: users.id, unitId: users.unitId })
        .from(users)
        .where(eq(users.id, input.targetId))
        .get();
      if (!target || !user.unitId || target.unitId !== user.unitId) {
        return c.json({ error: "신고 대상을 찾을 수 없습니다" }, 400);
      }
    }

    const row = {
      id: crypto.randomUUID(),
      reporterId: user.id,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      detail: input.detail ?? null,
      status: "open" as const,
      resolvedAt: null,
      createdAt: new Date().toISOString(),
    };
    await db.insert(contentReports).values(row);
    return c.json(
      {
        report: {
          id: row.id,
          targetType: row.targetType,
          targetId: row.targetId,
          reason: row.reason,
          status: row.status,
          createdAt: row.createdAt,
        },
      },
      201,
    );
  })
  .openapi(listBlocksRoute, async (c) => {
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    const rows = await db
      .select({
        userId: userBlocks.blockedUserId,
        name: users.name,
        createdAt: userBlocks.createdAt,
      })
      .from(userBlocks)
      .leftJoin(users, eq(users.id, userBlocks.blockedUserId))
      .where(eq(userBlocks.userId, user.id))
      .all();
    return c.json(
      {
        blocks: rows.map((row) => ({
          userId: row.userId,
          // 이미 탈퇴한 사용자면 별칭이 없다.
          name: row.name ?? null,
          createdAt: row.createdAt,
        })),
      },
      200,
    );
  })
  .openapi(createBlockRoute, async (c) => {
    const { userId } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    if (userId === user.id) {
      return c.json({ error: "자기 자신은 차단할 수 없습니다" }, 400);
    }
    const target = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    if (!target) return c.json({ error: "사용자를 찾을 수 없습니다" }, 404);

    // 차단과 친구/요청 제거는 한 D1 batch 안에서 함께 끝난다. 중간 상태에서는
    // 차단된 상대가 달력 권한을 계속 갖는 순간이 생겨서는 안 된다.
    const [userAId, userBId] =
      user.id < userId ? [user.id, userId] : [userId, user.id];
    await runBatch(db, [
      db
        .insert(userBlocks)
        .values({
          userId: user.id,
          blockedUserId: userId,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoNothing(),
      db
        .delete(friendships)
        .where(
          and(
            eq(friendships.userAId, userAId),
            eq(friendships.userBId, userBId),
          ),
        ),
    ]);
    return c.json({ ok: true as const }, 200);
  })
  .openapi(deleteBlockRoute, async (c) => {
    const { userId } = c.req.valid("param");
    const user = c.get("user");
    const db = drizzle(c.env.DB);
    await db
      .delete(userBlocks)
      .where(
        and(
          eq(userBlocks.userId, user.id),
          eq(userBlocks.blockedUserId, userId),
        ),
      );
    return c.json({ ok: true as const }, 200);
  });
