import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  DEFAULT_ANNUAL_DAYS,
  segmentBalanceKey,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveSegment,
  type RegularOvernightConfigInput,
} from "@leave/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { type DrizzleD1Database } from "drizzle-orm/d1";
import {
  leaveBalanceGrants,
  leaves,
  leaveSegments,
  regularOvernightConfigs,
  userLeaveBalances,
} from "../db/schema";

type Db = DrizzleD1Database;

export type LeaveBalanceItem = {
  key: BalanceKey;
  label: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  automaticDays: number;
};

function defaultDays(key: BalanceKey, branch: Branch): number {
  return key === "annual" ? DEFAULT_ANNUAL_DAYS[branch] : 0;
}

export async function ensureLeaveBalances(
  db: Db,
  user: { id: string; branch: Branch },
) {
  const existing = await db
    .select({ key: userLeaveBalances.balanceKey })
    .from(userLeaveBalances)
    .where(eq(userLeaveBalances.userId, user.id))
    .all();
  const existingKeys = new Set(existing.map((row) => row.key));
  const now = new Date().toISOString();
  const missing = BALANCE_KEYS.filter((key) => !existingKeys.has(key)).map(
    (key) => ({
      id: crypto.randomUUID(),
      userId: user.id,
      balanceKey: key,
      adjustmentDays: defaultDays(key, user.branch),
      updatedAt: now,
    }),
  );
  if (missing.length) {
    await db.insert(userLeaveBalances).values(missing).onConflictDoNothing();
  }
}

export async function accrueRegularOvernight(
  db: Db,
  userId: string,
  on = todayInSeoul(),
) {
  const config = await db
    .select()
    .from(regularOvernightConfigs)
    .where(eq(regularOvernightConfigs.userId, userId))
    .get();
  if (
    !config?.enabled ||
    !config.nextGrantDate ||
    !config.intervalDays ||
    !config.daysPerGrant ||
    config.nextGrantDate > on
  ) {
    return;
  }

  const grants: (typeof leaveBalanceGrants.$inferInsert)[] = [];
  let due = config.nextGrantDate;
  for (let count = 0; due <= on && count < 500; count += 1) {
    grants.push({
      id: crypto.randomUUID(),
      userId,
      balanceKey: "regular_overnight",
      days: config.daysPerGrant,
      effectiveDate: due,
      createdAt: new Date().toISOString(),
    });
    due = addDays(due, config.intervalDays);
  }
  if (!grants.length) return;

  await db.batch([
    db.insert(leaveBalanceGrants).values(grants).onConflictDoNothing(),
    db
      .update(regularOvernightConfigs)
      .set({ nextGrantDate: due, updatedAt: new Date().toISOString() })
      .where(
        and(
          eq(regularOvernightConfigs.userId, userId),
          eq(regularOvernightConfigs.nextGrantDate, config.nextGrantDate),
        ),
      ),
  ]);
}

export async function accrueAllRegularOvernights(db: Db, on = todayInSeoul()) {
  const configs = await db
    .select({ userId: regularOvernightConfigs.userId })
    .from(regularOvernightConfigs)
    .where(eq(regularOvernightConfigs.enabled, true))
    .all();
  for (const config of configs) {
    await accrueRegularOvernight(db, config.userId, on);
  }
}

export async function getLeaveBalanceSummary(
  db: Db,
  user: { id: string; branch: Branch },
) {
  await ensureLeaveBalances(db, user);
  await accrueRegularOvernight(db, user.id);

  const [manualRows, automaticRows, usedRows, config] = await Promise.all([
    db
      .select()
      .from(userLeaveBalances)
      .where(eq(userLeaveBalances.userId, user.id))
      .all(),
    db
      .select({
        key: leaveBalanceGrants.balanceKey,
        days: sql<number>`cast(sum(${leaveBalanceGrants.days}) as integer)`,
      })
      .from(leaveBalanceGrants)
      .where(eq(leaveBalanceGrants.userId, user.id))
      .groupBy(leaveBalanceGrants.balanceKey)
      .all(),
    db
      .select({
        category: leaveSegments.category,
        overnightKind: leaveSegments.overnightKind,
        days: sql<number>`cast(sum(${leaveSegments.days}) as integer)`,
      })
      .from(leaveSegments)
      .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
      .where(eq(leaves.userId, user.id))
      .groupBy(leaveSegments.category, leaveSegments.overnightKind)
      .all(),
    db
      .select()
      .from(regularOvernightConfigs)
      .where(eq(regularOvernightConfigs.userId, user.id))
      .get(),
  ]);

  const manual = new Map(
    manualRows.map((row) => [row.balanceKey, row.adjustmentDays]),
  );
  const automatic = new Map(
    automaticRows.map((row) => [row.key, row.days ?? 0]),
  );
  const used = new Map<BalanceKey, number>();
  for (const row of usedRows) {
    const key = segmentBalanceKey({
      category: row.category,
      overnightKind: row.overnightKind ?? undefined,
    });
    used.set(key, (used.get(key) ?? 0) + (row.days ?? 0));
  }

  const balances: LeaveBalanceItem[] = BALANCE_KEYS.map((key) => {
    const automaticDays = automatic.get(key) ?? 0;
    const totalDays =
      (manual.get(key) ?? defaultDays(key, user.branch)) + automaticDays;
    const usedDays = used.get(key) ?? 0;
    return {
      key,
      label: BALANCE_LABELS[key],
      totalDays,
      usedDays,
      remainingDays: totalDays - usedDays,
      automaticDays,
    };
  });

  return {
    balances,
    regularOvernight: config
      ? {
          enabled: config.enabled,
          nextGrantDate: config.nextGrantDate,
          intervalDays: config.intervalDays,
          daysPerGrant: config.daysPerGrant,
        }
      : {
          enabled: false,
          nextGrantDate: null,
          intervalDays: null,
          daysPerGrant: null,
        },
  };
}

export async function updateLeaveBalanceTotals(
  db: Db,
  user: { id: string; branch: Branch },
  totals: Partial<Record<BalanceKey, number>>,
) {
  const current = await getLeaveBalanceSummary(db, user);
  const byKey = new Map(current.balances.map((item) => [item.key, item]));
  for (const [key, total] of Object.entries(totals) as [BalanceKey, number][]) {
    const item = byKey.get(key);
    if (!item) continue;
    if (total < item.usedDays) {
      throw new Error(
        `${item.label}는 이미 ${item.usedDays}일을 사용해 총량을 그보다 작게 설정할 수 없습니다`,
      );
    }
  }

  const now = new Date().toISOString();
  for (const [key, total] of Object.entries(totals) as [BalanceKey, number][]) {
    const automaticDays = byKey.get(key)?.automaticDays ?? 0;
    await db
      .insert(userLeaveBalances)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        balanceKey: key,
        adjustmentDays: total - automaticDays,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userLeaveBalances.userId, userLeaveBalances.balanceKey],
        set: { adjustmentDays: total - automaticDays, updatedAt: now },
      });
  }
  return getLeaveBalanceSummary(db, user);
}

export async function saveRegularOvernightConfig(
  db: Db,
  user: { id: string; branch: Branch },
  input: RegularOvernightConfigInput,
) {
  if (user.branch === "army" && input.enabled) {
    throw new Error("정기외박 자동 적립은 해군과 공군에서 설정할 수 있습니다");
  }
  const now = new Date().toISOString();
  const values: typeof regularOvernightConfigs.$inferInsert = input.enabled
    ? {
        userId: user.id,
        enabled: true,
        nextGrantDate: input.nextGrantDate,
        intervalDays: input.intervalDays,
        daysPerGrant: input.daysPerGrant,
        updatedAt: now,
      }
    : {
        userId: user.id,
        enabled: false,
        nextGrantDate: null,
        intervalDays: null,
        daysPerGrant: null,
        updatedAt: now,
      };
  await db.insert(regularOvernightConfigs).values(values).onConflictDoUpdate({
    target: regularOvernightConfigs.userId,
    set: values,
  });
  return getLeaveBalanceSummary(db, user);
}

/** 구간을 재원별로 합산해 잔여량을 넘지 않는지 확인한다. */
export async function assertSegmentsAvailable(
  db: Db,
  user: { id: string; branch: Branch },
  segments: LeaveSegment[],
  replacingLeaveId?: string,
) {
  const summary = await getLeaveBalanceSummary(db, user);
  const available = new Map(
    summary.balances.map((item) => [item.key, item.remainingDays]),
  );

  // 수정이면 기존 구간만큼은 다시 쓸 수 있으므로 잔여량에 되돌려준다.
  if (replacingLeaveId) {
    const old = await db
      .select()
      .from(leaveSegments)
      .where(eq(leaveSegments.leaveId, replacingLeaveId))
      .all();
    for (const segment of old) {
      const key = segmentBalanceKey({
        category: segment.category,
        overnightKind: segment.overnightKind ?? undefined,
      });
      available.set(key, (available.get(key) ?? 0) + segment.days);
    }
  }

  const requested = new Map<BalanceKey, number>();
  for (const segment of segments) {
    const key = segmentBalanceKey(segment);
    requested.set(key, (requested.get(key) ?? 0) + segment.days);
  }
  for (const [key, days] of requested) {
    const remaining = available.get(key) ?? 0;
    if (days > remaining) {
      throw new Error(
        `${BALANCE_LABELS[key]} 잔여 ${remaining}일보다 많이 사용할 수 없습니다`,
      );
    }
  }
}

export function segmentRowsFor(leaveId: string, segments: LeaveSegment[]) {
  return segments.map((segment) => ({
    id: crypto.randomUUID(),
    leaveId,
    category: segment.category,
    overnightKind: segment.overnightKind ?? null,
    startDate: segment.startDate,
    endDate: segment.endDate,
    days: segment.days,
  }));
}

export async function insertLeaveSegments(
  db: Db,
  leaveId: string,
  segments: LeaveSegment[],
) {
  await db.insert(leaveSegments).values(segmentRowsFor(leaveId, segments));
}

export async function segmentsForLeaves(db: Db, leaveIds: string[]) {
  if (!leaveIds.length) return new Map<string, LeaveSegment[]>();
  const rows = await db
    .select()
    .from(leaveSegments)
    .where(inArray(leaveSegments.leaveId, leaveIds))
    .orderBy(asc(leaveSegments.startDate))
    .all();
  const result = new Map<string, LeaveSegment[]>();
  for (const row of rows) {
    const values = result.get(row.leaveId) ?? [];
    values.push({
      category: row.category,
      ...(row.overnightKind ? { overnightKind: row.overnightKind } : {}),
      startDate: row.startDate,
      endDate: row.endDate,
      days: row.days,
    });
    result.set(row.leaveId, values);
  }
  return result;
}
