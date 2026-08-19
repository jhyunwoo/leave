/**
 * 그룹(부대) 라우트 핸들러.
 *
 * 마운트 위치: `/units` (apps/api/src/index.ts).
 * 명세는 ./units.contract.ts, 공용 규칙은 아래 lib에 있다.
 *  - 권한 판정        → lib/unit-access.ts
 *  - 초대코드 발급    → lib/invites.ts
 *  - 가입·탈퇴 조율   → lib/unit-membership.ts
 *  - 달력 조립        → lib/calendar.ts
 *
 * 여기 남긴 것은 "요청을 받아 권한을 확인하고 DB를 바꾸고 응답을 고르는" 흐름뿐이다.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { unitBlackouts, unitInvites, units, users } from "../db/schema";
import { createApp } from "../lib/app";
import { bumpUnitVersion } from "../lib/cache";
import { buildCalendarPayload, listVisibleMembers } from "../lib/calendar";
import {
  createInvite,
  DEFAULT_INVITE_MAX_USES,
  resolveInviteExpiry,
} from "../lib/invites";
import { serializeUnit } from "../lib/serialize";
import { joinUnitByInviteCode, leaveUnit } from "../lib/unit-membership";
import { checkUnitAdmin, serializeUnitById } from "../lib/unit-access";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";
import { rateLimit } from "../middleware/rate-limit";
import { shiftMonth, todayInSeoul } from "@leave/shared";
import {
  blackoutsRoute,
  calendarRoute,
  createBlackoutRoute,
  createUnitRoute,
  deleteBlackoutRoute,
  getUnitRoute,
  joinRoute,
  leaveUnitRoute,
  membersRoute,
  removeMemberRoute,
  rotateInviteRoute,
  transferRoute,
  updateUnitRoute,
} from "./units.contract";

/**
 * 달력을 조회할 수 있는 범위(현재 월 기준).
 *
 * 휴가 등록 자체에는 날짜 상한이 없으므로, 이 범위가 좁으면 등록은 되는데 그 달의
 * 달력·추천·시뮬레이션만 비는 어긋난 상태가 된다. 복무 기간(약 18개월) 끝까지
 * 계획할 수 있도록 미래를 넉넉히 열어 둔다.
 *
 * 긁어가기는 아래 rate limit이 막는다. 여기서 범위를 두는 목적은 캐시 키
 * (`calendar2:...:{month}`)가 무한정 늘어나지 않게 하는 것뿐이다.
 */
const CALENDAR_PAST_MONTHS = 12;
const CALENDAR_FUTURE_MONTHS = 24;

const app = createApp();
app.use("*", authMiddleware);
app.use("*", async (c, next) => {
  const path = new URL(c.req.url).pathname;
  if (c.req.method === "POST" && (path === "/units" || path === "/units/join"))
    return next();
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- Hono 미들웨어 합성 타이핑 한계 (apps/api/src/index.ts 주석 참고)
  return onboardingMiddleware(c, next);
});
// 초대코드를 무차별 대입으로 찾아내지 못하게 막는 마지막 방어선.
// (코드 자체가 192비트라 현실적으로 불가능하지만, 시도 비용을 0으로 두지 않는다.)
app.use(
  "/join",
  rateLimit({ name: "unit-join", limit: 5, windowSeconds: 600 }),
);
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
    const inviteExpiresAt = resolveInviteExpiry(input.inviteExpiresAt);
    if (inviteExpiresAt <= now) {
      return c.json(
        { error: "초대코드 만료 시각은 현재보다 뒤여야 합니다" },
        400,
      );
    }

    // 기준 인원을 처음 넣는 순간이 곧 "최근 갱신 시각"이다. 인원을 비워 두면
    // 갱신 시각도 없어야 화면에서 "언제 기준인지 모를 숫자"가 생기지 않는다.
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
    // 만든 사람이 곧 첫 구성원이므로 인원수는 1이다.
    return c.json({ unit: serializeUnit(unit, 1), invite }, 201);
  })

  .openapi(getUnitRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "현재 그룹의 부대원만 조회할 수 있습니다" }, 403);
    }
    const db = drizzle(c.env.DB);
    const unit = await serializeUnitById(db, id);
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    return c.json({ unit }, 200);
  })

  .openapi(updateUnitRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const db = drizzle(c.env.DB);

    const check = await checkUnitAdmin(db, c.get("user"), id);
    if (check.status === "missing") {
      return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    }
    if (check.status !== "ok") {
      return c.json({ error: "현재 그룹 관리자만 수정할 수 있습니다" }, 403);
    }

    // undefined는 "안 건드림", null은 "비움"이다. 둘을 구분해야 기준 인원을
    // 의도적으로 지우는 것과 다른 필드만 고치는 것이 섞이지 않는다.
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

    const unit = await serializeUnitById(db, id);
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    return c.json({ unit }, 200);
  })

  .openapi(joinRoute, async (c) => {
    const { code } = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const joined = await joinUnitByInviteCode(db, user, code);
    if (!joined.ok) {
      return joined.reason === "already-in-unit"
        ? c.json(
            {
              error:
                "이미 그룹에 소속되어 있습니다. 먼저 현재 그룹에서 나가주세요",
            },
            409,
          )
        : c.json({ error: "유효하지 않은 초대코드입니다" }, 400);
    }

    const unit = await serializeUnitById(db, joined.unitId);
    if (!unit) {
      return c.json({ error: "유효하지 않은 초대코드입니다" }, 400);
    }
    await bumpUnitVersion(c.env.CACHE, unit.id);
    return c.json({ joined: true as const, unit }, 200);
  })

  .openapi(rotateInviteRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const check = await checkUnitAdmin(db, user, id);
    if (check.status !== "ok") {
      return c.json({ error: "현재 그룹 관리자만 재발급할 수 있습니다" }, 403);
    }

    const now = new Date().toISOString();
    const expiresAt = resolveInviteExpiry(input.expiresAt);
    if (expiresAt <= now) {
      return c.json(
        { error: "초대코드 만료 시각은 현재보다 뒤여야 합니다" },
        400,
      );
    }
    // 재발급은 곧 회전이다. 기존 코드를 먼저 폐기해야 옛 코드가 계속 통하지 않는다.
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

    const check = await checkUnitAdmin(db, admin, id);
    if (check.status === "missing") {
      return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    }
    if (check.status !== "ok") {
      return c.json({ error: "현재 그룹 관리자만 제거할 수 있습니다" }, 403);
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
    const db = drizzle(c.env.DB);

    const check = await checkUnitAdmin(db, c.get("user"), id);
    if (check.status === "missing") {
      return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    }
    if (check.status !== "ok") {
      return c.json({ error: "현재 그룹 관리자만 이관할 수 있습니다" }, 403);
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

    const unit = await serializeUnitById(db, id);
    if (!unit) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    return c.json({ unit }, 200);
  })

  .openapi(leaveUnitRoute, async (c) => {
    const left = await leaveUnit(drizzle(c.env.DB), c.env.CACHE, c.get("user"));
    if (!left.ok) {
      return c.json(
        { error: "관리자는 다른 부대원에게 관리자를 넘긴 뒤 나갈 수 있습니다" },
        409,
      );
    }
    return c.json({ ok: true as const }, 200);
  })

  .openapi(membersRoute, async (c) => {
    const { id } = c.req.valid("param");
    const user = c.get("user");
    if (user.unitId !== id) {
      return c.json({ error: "부대원만 조회할 수 있습니다" }, 403);
    }
    const db = drizzle(c.env.DB);
    return c.json({ members: await listVisibleMembers(db, id, user.id) }, 200);
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

    const check = await checkUnitAdmin(db, user, id);
    if (check.status !== "ok") {
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
    const db = drizzle(c.env.DB);

    const check = await checkUnitAdmin(db, c.get("user"), id);
    if (check.status !== "ok") {
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
      month < shiftMonth(currentMonth, -CALENDAR_PAST_MONTHS) ||
      month > shiftMonth(currentMonth, CALENDAR_FUTURE_MONTHS)
    ) {
      return c.json(
        {
          error: `달력은 현재 월 기준 과거 ${CALENDAR_PAST_MONTHS}개월 ~ 미래 ${CALENDAR_FUTURE_MONTHS}개월만 조회할 수 있습니다`,
        },
        400,
      );
    }

    // 부대 행 조회도 달력 조립의 batch 안으로 들어간다 — 여기서 따로 읽으면 왕복이 하나 더 든다.
    const payload = await buildCalendarPayload({
      db: drizzle(c.env.DB),
      unitId: id,
      viewerId: user.id,
      month,
    });
    if (!payload) return c.json({ error: "부대를 찾을 수 없습니다" }, 404);
    return c.json(payload, 200);
  });
