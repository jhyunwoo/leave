/**
 * 적립분(leave_grants) 읽기·쓰기와 "보유 휴가" 화면 payload 조립.
 *
 * 배분 규칙 자체는 @leave/shared의 leave-grants.ts에 순수 함수로 있고, 여기서는
 * DB에서 재료를 모아 그 함수에 먹이는 일만 한다.
 */

import {
  addDays,
  allocateAllGrants,
  BALANCE_KEYS,
  BALANCE_LABELS,
  cycleColor,
  cycleState,
  cycleUsedDays,
  cyclesInRange,
  isRegularOvernightCycleBased,
  nextGrantDateAfter,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveGrant,
  type LeaveGrantCreateInput,
  type LeaveGrantUpdateInput,
} from "@leave/shared";
import { and, eq } from "drizzle-orm";
import { type DrizzleD1Database } from "drizzle-orm/d1";
import {
  leaveGrants,
  leaves,
  leaveSegments,
  regularOvernightConfigs,
  type LeaveGrantRow,
  type RegularOvernightConfigRow,
} from "../db/schema";

type Db = DrizzleD1Database;
type User = { id: string; branch: Branch; dischargeAt: string };

/** 주기가 아무리 촘촘해도 화면에 쏟아내지 않도록 두는 상한. */
const MAX_LISTED_CYCLES = 200;

export function toLeaveGrant(row: LeaveGrantRow): LeaveGrant {
  return {
    id: row.id,
    balanceKey: row.balanceKey,
    days: row.days,
    grantedOn: row.grantedOn,
    expiresOn: row.expiresOn,
    note: row.note,
    createdAt: row.createdAt,
  };
}

export async function listGrants(db: Db, userId: string) {
  return db
    .select()
    .from(leaveGrants)
    .where(eq(leaveGrants.userId, userId))
    .all();
}

/** 배분에 쓰는, 이 사용자의 모든 휴가 구간. */
export async function userSegments(db: Db, userId: string) {
  return db
    .select({
      category: leaveSegments.category,
      overnightKind: leaveSegments.overnightKind,
      startDate: leaveSegments.startDate,
      endDate: leaveSegments.endDate,
    })
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .where(eq(leaves.userId, userId))
    .all();
}

export async function regularOvernightConfigOf(db: Db, userId: string) {
  return db
    .select()
    .from(regularOvernightConfigs)
    .where(eq(regularOvernightConfigs.userId, userId))
    .get();
}

/**
 * 자동 적립을 쓰는 동안에는 정기외박 적립분을 손으로 만들 수 없다.
 * 잔여량이 주기 설정에서 파생하므로 적립분을 둬 봐야 셈에 들어가지 않는다.
 */
export function assertGrantEditable(
  balanceKey: BalanceKey,
  config: RegularOvernightConfigRow | undefined,
) {
  if (balanceKey === "regular_overnight" && isRegularOvernightCycleBased(config)) {
    throw new Error(
      "정기외박은 주기 설정에서 자동으로 계산돼 적립분을 따로 만들 수 없어요",
    );
  }
}

export async function createGrant(
  db: Db,
  user: User,
  input: LeaveGrantCreateInput,
) {
  const config = await regularOvernightConfigOf(db, user.id);
  assertGrantEditable(input.balanceKey, config);
  const now = new Date().toISOString();
  await db.insert(leaveGrants).values({
    id: crypto.randomUUID(),
    userId: user.id,
    balanceKey: input.balanceKey,
    days: input.days,
    grantedOn: input.grantedOn ?? null,
    expiresOn: input.expiresOn ?? null,
    note: input.note ?? null,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateGrant(
  db: Db,
  user: User,
  id: string,
  input: LeaveGrantUpdateInput,
) {
  const existing = await db
    .select()
    .from(leaveGrants)
    .where(and(eq(leaveGrants.id, id), eq(leaveGrants.userId, user.id)))
    .get();
  if (!existing) return false;

  await db
    .update(leaveGrants)
    .set({
      // 재원은 바꾸지 않는다 — 옮기면 두 재원의 사용분 귀속이 조용히 뒤집힌다.
      days: input.days ?? existing.days,
      grantedOn: input.grantedOn === undefined ? existing.grantedOn : input.grantedOn,
      expiresOn: input.expiresOn === undefined ? existing.expiresOn : input.expiresOn,
      note: input.note === undefined ? existing.note : input.note,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(leaveGrants.id, id));
  return true;
}

export async function deleteGrant(db: Db, user: User, id: string) {
  const existing = await db
    .select({ id: leaveGrants.id })
    .from(leaveGrants)
    .where(and(eq(leaveGrants.id, id), eq(leaveGrants.userId, user.id)))
    .get();
  if (!existing) return false;
  await db.delete(leaveGrants).where(eq(leaveGrants.id, id));
  return true;
}

/**
 * 보유 휴가 화면 payload.
 *
 * 주기 목록은 첫 적립일(1주기 첫날)부터 전역일까지 전부 보여준다. 전역일이 이미
 * 지났거나 첫 적립일보다 이르더라도 1·2주기는 보이도록 하한을 둔다.
 */
export async function buildGrantsPage(db: Db, user: User) {
  const [grantRows, segments, config] = await Promise.all([
    listGrants(db, user.id),
    userSegments(db, user.id),
    regularOvernightConfigOf(db, user.id),
  ]);

  const today = todayInSeoul();
  const grants = grantRows.map(toLeaveGrant);
  const allocations = allocateAllGrants(grants, segments, today);
  const cycleBased = isRegularOvernightCycleBased(config);

  const funds = BALANCE_KEYS.map((key) => {
    const allocation = allocations[key];
    const scoped = key === "regular_overnight" && cycleBased;
    return {
      key,
      label: BALANCE_LABELS[key],
      cycleScoped: scoped,
      totalDays: allocation.totalDays,
      usedDays: allocation.usedDays,
      remainingDays: allocation.remainingDays,
      expiredDays: allocation.expiredDays,
      upcomingDays: allocation.upcomingDays,
      // 주기 재원은 주기별로 따로 따지므로 재원 총합의 미귀속은 의미가 없다.
      unattributedDays: scoped ? 0 : allocation.unattributedDays,
      grants: allocation.grants.map((entry) => ({
        id: entry.grant.id,
        balanceKey: entry.grant.balanceKey,
        days: entry.grant.days,
        usedDays: entry.usedDays,
        availableDays: entry.availableDays,
        unusedDays: entry.unusedDays,
        grantedOn: entry.grant.grantedOn,
        expiresOn: entry.grant.expiresOn,
        note: entry.grant.note ?? null,
        status: entry.status,
        daysUntilExpiry: entry.daysUntilExpiry,
        createdAt: entry.grant.createdAt ?? "",
      })),
    };
  });

  // 대시보드 합계는 주기 재원을 뺀 값이다(주기 몫은 이월되지 않아 총량 개념이 다르다).
  const countable = funds.filter((fund) => !fund.cycleScoped);
  const totals = {
    totalDays: countable.reduce((sum, f) => sum + f.totalDays, 0),
    usedDays: countable.reduce((sum, f) => sum + f.usedDays, 0),
    remainingDays: countable.reduce((sum, f) => sum + f.remainingDays, 0),
    expiredDays: countable.reduce((sum, f) => sum + f.expiredDays, 0),
    upcomingDays: countable.reduce((sum, f) => sum + f.upcomingDays, 0),
    unattributedDays: countable.reduce((sum, f) => sum + f.unattributedDays, 0),
  };

  return {
    today,
    totals,
    funds,
    regularOvernight: {
      enabled: config?.enabled ?? false,
      startDate: config?.startDate ?? null,
      intervalDays: config?.intervalDays ?? null,
      daysPerGrant: config?.daysPerGrant ?? null,
      nextGrantDate: nextGrantDateAfter(config, today),
      cycles: buildCycleList(config, segments, user.dischargeAt, today),
    },
  };
}

function buildCycleList(
  config: RegularOvernightConfigRow | undefined,
  segments: Awaited<ReturnType<typeof userSegments>>,
  dischargeAt: string,
  today: string,
) {
  if (!config?.startDate || !isRegularOvernightCycleBased(config)) return [];
  // 전역일이 지났거나 첫 적립보다 일러도 1·2주기는 보이게 한다(첫 적립 = 시작일 + 1주기).
  const floor = addDays(config.startDate, 2 * (config.intervalDays ?? 1));
  const end = [dischargeAt, today, floor].reduce((a, b) => (a > b ? a : b));

  return cyclesInRange(config, config.startDate, end)
    .slice(0, MAX_LISTED_CYCLES)
    .map((cycle) => {
      const usedDays = cycleUsedDays(cycle, segments);
      return {
        index: cycle.index,
        start: cycle.start,
        end: cycle.end,
        grantDays: cycle.grantDays,
        usedDays,
        remainingDays: cycle.grantDays - usedDays,
        state: cycleState(cycle, today),
        color: cycleColor(cycle.index),
      };
    });
}
