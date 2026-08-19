/**
 * DB 행 → API 응답 변환.
 *
 * 사용처: 인증·그룹·달력 라우트가 사용자/구성원/그룹을 응답에 담을 때.
 *
 * 여기를 반드시 거쳐야 하는 이유는 두 가지다.
 *  - 계급은 저장값이 아니라 입대일에서 매번 계산한다(진급이 자동 반영된다).
 *  - 비밀번호 해시 같은 내부 컬럼이 실수로 응답에 섞이지 않는다.
 */

import type { z } from "@hono/zod-openapi";
import {
  BRANCH_LABELS,
  getRankInfo,
  normalizeLegacyDischargeDate,
  todayInSeoul,
} from "@leave/shared";
import type { UnitRow, UserRow } from "../db/schema";
import type { memberSchema, unitSchema, userSchema } from "./responses";

export function serializeUser(
  user: UserRow,
  on: string = todayInSeoul(),
): z.infer<typeof userSchema> {
  const dischargeAt = normalizeLegacyDischargeDate(
    user.enlistedAt,
    user.branch,
    user.dischargeAt,
  );
  const info = getRankInfo({
    enlistedAt: user.enlistedAt,
    dischargeAt,
    signupRank: user.signupRank,
    on,
  });
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    branch: user.branch,
    branchLabel: BRANCH_LABELS[user.branch],
    enlistedAt: user.enlistedAt,
    dischargeAt,
    unitId: user.unitId,
    rank: info.rank,
    rankLabel: info.rankLabel,
    nextPromotionDate: info.nextPromotionDate,
    serviceProgress: info.serviceProgress,
    daysUntilDischarge: info.daysUntilDischarge,
  };
}

/**
 * 구성원 직렬화에 실제로 필요한 컬럼.
 *
 * `UserRow` 전체를 요구하면 호출하는 쿼리가 `select *`를 쓸 수밖에 없다 —
 * 부대원 수만큼 비밀번호 해시·소금·이메일을 읽게 된다. 필요한 것만 받는다.
 */
export type MemberFields = Pick<
  UserRow,
  "id" | "name" | "branch" | "enlistedAt" | "dischargeAt" | "signupRank"
>;

export function serializeMember(
  user: MemberFields,
  on: string = todayInSeoul(),
): z.infer<typeof memberSchema> {
  const dischargeAt = normalizeLegacyDischargeDate(
    user.enlistedAt,
    user.branch,
    user.dischargeAt,
  );
  const info = getRankInfo({
    enlistedAt: user.enlistedAt,
    dischargeAt,
    signupRank: user.signupRank,
    on,
  });
  return {
    id: user.id,
    name: user.name,
    branch: user.branch,
    branchLabel: BRANCH_LABELS[user.branch],
    rank: info.rank,
    rankLabel: info.rankLabel,
    enlistedAt: user.enlistedAt,
    dischargeAt,
  };
}

export function serializeUnit(
  unit: UnitRow,
  memberCount: number,
): z.infer<typeof unitSchema> {
  return {
    id: unit.id,
    name: unit.name,
    description: unit.description,
    referenceMemberTotal: unit.referenceMemberTotal,
    maxLeaveCount: unit.maxLeaveCount,
    returnDayCounts: unit.returnDayCounts,
    lastTotalUpdatedAt: unit.lastTotalUpdatedAt,
    memberCount,
    adminId: unit.adminId,
    createdAt: unit.createdAt,
  };
}
