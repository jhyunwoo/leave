/**
 * 그룹(부대) 권한 확인 헬퍼.
 *
 * 사용처: apps/api/src/routes/units.ts 의 관리자 전용 라우트 전부.
 *
 * 그룹을 고치는 요청은 예외 없이 같은 세 가지를 확인한다.
 *  1) 요청자가 지금 그 그룹 소속인가            → 아니면 403
 *  2) 그 그룹이 실제로 있는가                   → 없으면 404(또는 403)
 *  3) 요청자가 그 그룹의 관리자인가             → 아니면 403
 *
 * 이 절차를 라우트마다 손으로 적으면 새 라우트에서 한 단계를 빠뜨리기 쉽다.
 * 여기서 한 번에 판정하고, "무엇이 어긋났는지"만 돌려준다. 어떤 상태 코드로
 * 답할지는 라우트마다 OpenAPI 응답 정의가 다르므로 호출한 쪽이 정한다.
 */
import { eq, sql } from "drizzle-orm";
import { units, users, type UnitRow, type UserRow } from "../db/schema";
import type { Db } from "./db";
import { serializeUnit } from "./serialize";

export type UnitAdminCheck =
  /** 통과. 대상 그룹 행을 함께 준다(다시 조회하지 않아도 된다). */
  | { status: "ok"; unit: UnitRow }
  /** 요청자가 이 그룹 소속이 아니다. */
  | { status: "not-member" }
  /** 그룹이 존재하지 않는다. */
  | { status: "missing" }
  /** 소속은 맞지만 관리자가 아니다. */
  | { status: "not-admin" };

/** 관리자 전용 동작을 수행해도 되는지 한 번에 판정한다. */
export async function checkUnitAdmin(
  db: Db,
  user: UserRow,
  unitId: string,
): Promise<UnitAdminCheck> {
  if (user.unitId !== unitId) return { status: "not-member" };
  const unit = await db.select().from(units).where(eq(units.id, unitId)).get();
  if (!unit) return { status: "missing" };
  if (unit.adminId !== user.id) return { status: "not-admin" };
  return { status: "ok", unit };
}

/**
 * 그룹 응답에는 항상 현재 인원수가 붙는다.
 *
 * 인원수는 users.unitId를 세는 값이라 그룹 행만으로는 알 수 없는데, 따로 세면
 * 왕복이 하나 더 든다. 두 조회를 batch로 묶어 왕복 하나로 끝낸다 — 세는 쪽은
 * `users_unit_name_idx`만 읽는 COVERING INDEX 조회라 그대로 싸다.
 */
export async function serializeUnitWithCount(db: Db, unit: UnitRow) {
  const memberCount = await db.$count(users, eq(users.unitId, unit.id));
  return serializeUnit(unit, memberCount);
}

/** 그룹 행 + 현재 인원수를 한 번의 왕복으로 읽는다. */
export async function unitWithMemberCount(db: Db, unitId: string) {
  const [unitRows, countRows] = await db.batch([
    db.select().from(units).where(eq(units.id, unitId)),
    db
      .select({ count: sql<number>`cast(count(*) as integer)` })
      .from(users)
      .where(eq(users.unitId, unitId)),
  ]);
  const unit = unitRows[0];
  if (!unit) return null;
  return { unit, memberCount: countRows[0]?.count ?? 0 };
}

/** id로 그룹을 다시 읽어 인원수까지 붙여 직렬화한다(수정 직후 응답용). */
export async function serializeUnitById(db: Db, unitId: string) {
  const row = await unitWithMemberCount(db, unitId);
  if (!row) return null;
  return serializeUnit(row.unit, row.memberCount);
}
