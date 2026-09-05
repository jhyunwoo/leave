/**
 * 그룹 가입·탈퇴 — 여러 표를 함께 바꾸고 동시 요청까지 견뎌야 하는 작업.
 *
 * 사용처: `POST /units/join`, `POST /units/leave` (routes/units.ts).
 *
 * 라우트에서 떼어 둔 이유는 경합 때문이다. 초대코드에는 사용 횟수 상한이 있는데,
 * "읽어서 확인하고 → 늘린다"로 짜면 같은 순간에 들어온 두 요청이 둘 다 통과해
 * 상한을 넘겨 쓴다. 아래 두 함수는 그 처리를 조건부 UPDATE 한 번으로 눌러 두었고,
 * 그 의도가 HTTP 응답 코드를 고르는 코드와 섞이면 읽다가 놓치기 쉽다.
 */

import { normalizeInviteCode } from "@leave/shared";
import { and, eq, gt, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { unitInvites, units, users } from "../db/schema";
import { sha256Hex } from "./crypto";
import type { Db } from "./db";

/** 초대코드가 통하지 않는 이유는 구분해서 알려주지 않는다 — 코드 탐색의 단서가 된다. */
export type JoinFailure =
  | { ok: false; reason: "invalid-code" }
  | { ok: false; reason: "already-in-unit" };

export type JoinResult = { ok: true; unitId: string } | JoinFailure;

/**
 * 이 입력이 가리킬 수 있는 코드 해시들.
 *
 * 새 형식(6자)은 정규화한 값으로 저장돼 있고, 아직 만료되지 않은 옛 32자
 * base64url 코드는 대소문자를 구분하는 원문 그대로 저장돼 있다. 정규화가 옛
 * 코드를 건드리지 않도록 만들어 두었지만(`normalizeInviteCode`), 두 값이 같아도
 * 중복 없이 한 번의 `inArray` 조회로 끝나므로 왕복은 그대로 하나다.
 */
async function candidateHashes(code: string): Promise<string[]> {
  const candidates = new Set([normalizeInviteCode(code), code.trim()]);
  return Promise.all([...candidates].map(sha256Hex));
}

/**
 * 초대코드로 그룹에 즉시 편입한다.
 *
 * 세 단계 모두 조건부로 쓴다.
 *  1) 코드 소진: `usedCount < maxUses`인 동안에만 +1 한다. 동시 요청이 상한을 넘길 수 없다.
 *  2) 편입: 아직 소속이 없을 때만 unitId를 채운다.
 *  3) 2가 실패하면 1에서 쓴 사용 횟수를 되돌린다 — 같은 사용자의 중복 요청이
 *     남의 몫까지 태워 없애면 안 된다.
 */
export async function joinUnitByInviteCode(
  db: Db,
  user: { id: string; unitId: string | null },
  code: string,
): Promise<JoinResult> {
  if (user.unitId) return { ok: false, reason: "already-in-unit" };

  const now = new Date().toISOString();
  const invite = await db
    .select()
    .from(unitInvites)
    .where(inArray(unitInvites.codeHash, await candidateHashes(code)))
    .get();
  if (
    !invite ||
    invite.revokedAt !== null ||
    invite.expiresAt <= now ||
    invite.usedCount >= invite.maxUses
  ) {
    return { ok: false, reason: "invalid-code" };
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
  if (consumed.meta.changes !== 1) return { ok: false, reason: "invalid-code" };

  const joined = await db
    .update(users)
    .set({ unitId: invite.unitId })
    .where(and(eq(users.id, user.id), isNull(users.unitId)))
    .run();
  if (joined.meta.changes !== 1) {
    await db
      .update(unitInvites)
      .set({ usedCount: sql`${unitInvites.usedCount} - 1` })
      .where(and(eq(unitInvites.id, invite.id), gt(unitInvites.usedCount, 0)))
      .run();
    return { ok: false, reason: "already-in-unit" };
  }

  return { ok: true, unitId: invite.unitId };
}

export type LeaveUnitResult =
  { ok: true } | { ok: false; reason: "admin-must-transfer" };

/**
 * 그룹에서 나간다.
 *
 * 관리자는 다른 부대원이 남아 있는 동안 나갈 수 없다 — 나가면 그 그룹은 설정도
 * 초대코드도 바꿀 수 없는 상태로 잠긴다. 혼자였다면 나가는 김에 빈 그룹과 살아 있는
 * 초대코드를 함께 정리한다.
 */
export async function leaveUnit(
  db: Db,
  user: { id: string; unitId: string | null },
): Promise<LeaveUnitResult> {
  const unitId = user.unitId;
  // 애초에 소속이 없으면 탈퇴는 이미 이뤄진 상태다.
  if (!unitId) return { ok: true };

  const unit = await db.select().from(units).where(eq(units.id, unitId)).get();
  const isAdmin = unit?.adminId === user.id;

  if (isAdmin) {
    const otherCount = await db.$count(
      users,
      and(eq(users.unitId, unitId), ne(users.id, user.id)),
    );
    if (otherCount > 0) return { ok: false, reason: "admin-must-transfer" };
  }

  await db.update(users).set({ unitId: null }).where(eq(users.id, user.id));
  if (isAdmin) {
    await db.delete(unitInvites).where(eq(unitInvites.unitId, unitId));
    await db.delete(units).where(eq(units.id, unitId));
  }
  return { ok: true };
}
