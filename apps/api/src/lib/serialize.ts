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
    profileImageKey: user.profileImageKey,
    rank: info.rank,
    rankLabel: info.rankLabel,
    nextPromotionDate: info.nextPromotionDate,
    serviceProgress: info.serviceProgress,
    daysUntilDischarge: info.daysUntilDischarge,
  };
}

export function serializeMember(
  user: UserRow,
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
    profileImageKey: user.profileImageKey,
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
    maxLeaveNumerator: unit.maxLeaveNumerator,
    maxLeaveDenominator: unit.maxLeaveDenominator,
    memberCount,
    adminId: unit.adminId,
    headcount: unit.headcount,
    imageKey: unit.imageKey,
    createdAt: unit.createdAt,
  };
}
