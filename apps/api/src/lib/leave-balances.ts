import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  cycleFor,
  cycleUsedDays,
  DEFAULT_ANNUAL_DAYS,
  isRegularOvernightCycleBased,
  nextGrantDateAfter,
  regularOvernightUsageByCycle,
  segmentBalanceKey,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveSegment,
  type RegularOvernightConfigInput,
  type SegmentLike,
} from "@leave/shared";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import { type DrizzleD1Database } from "drizzle-orm/d1";
import {
  leaves,
  leaveSegments,
  regularOvernightConfigs,
  userLeaveBalances,
  type RegularOvernightConfigRow,
} from "../db/schema";

type Db = DrizzleD1Database;

export type LeaveBalanceItem = {
  key: BalanceKey;
  label: string;
  totalDays: number;
  usedDays: number;
  remainingDays: number;
  automaticDays: number;
  /**
   * 총량·사용량이 이번 주기 기준인지. 정기외박 자동 적립을 쓰면 true가 되고,
   * 이때 총량은 사용자가 직접 고칠 수 없다(주기 설정에서 파생한다).
   */
  cycleScoped: boolean;
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

/**
 * 정기외박 잔여량 계산에 필요한, 날짜가 살아 있는 내 정기외박 구간들.
 * excludeLeaveId를 주면 그 휴가의 구간은 뺀다(수정 중인 휴가를 자기 자신과 겹쳐 세지 않도록).
 */
async function regularOvernightSegments(
  db: Db,
  userId: string,
  excludeLeaveId?: string,
) {
  return db
    .select({
      category: leaveSegments.category,
      overnightKind: leaveSegments.overnightKind,
      startDate: leaveSegments.startDate,
      endDate: leaveSegments.endDate,
    })
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .where(
      and(
        eq(leaves.userId, userId),
        eq(leaveSegments.category, "overnight"),
        eq(leaveSegments.overnightKind, "regular"),
        ...(excludeLeaveId ? [ne(leaveSegments.leaveId, excludeLeaveId)] : []),
      ),
    )
    .all();
}

export async function getLeaveBalanceSummary(
  db: Db,
  user: { id: string; branch: Branch },
) {
  await ensureLeaveBalances(db, user);

  const [manualRows, usedRows, config, regularSegments] = await Promise.all([
    db
      .select()
      .from(userLeaveBalances)
      .where(eq(userLeaveBalances.userId, user.id))
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
    regularOvernightSegments(db, user.id),
  ]);

  const manual = new Map(
    manualRows.map((row) => [row.balanceKey, row.adjustmentDays]),
  );
  const used = new Map<BalanceKey, number>();
  for (const row of usedRows) {
    const key = segmentBalanceKey({
      category: row.category,
      overnightKind: row.overnightKind ?? undefined,
    });
    used.set(key, (used.get(key) ?? 0) + (row.days ?? 0));
  }

  // 자동 적립을 쓰면 정기외박은 주기마다 새로 쌓이고 이월되지 않는다.
  // 그래서 누적 총량이 아니라 "이번 주기 몫과 그 주기 안 사용량"만 보여준다.
  const cycleBased = isRegularOvernightCycleBased(config);
  const currentCycle = cycleFor(config, todayInSeoul());

  const balances: LeaveBalanceItem[] = BALANCE_KEYS.map((key) => {
    if (key === "regular_overnight" && cycleBased) {
      const grantDays = currentCycle?.grantDays ?? 0;
      const usedDays = currentCycle
        ? cycleUsedDays(currentCycle, regularSegments)
        : 0;
      return {
        key,
        label: BALANCE_LABELS[key],
        totalDays: grantDays,
        usedDays,
        remainingDays: grantDays - usedDays,
        automaticDays: grantDays,
        cycleScoped: true,
      };
    }
    const totalDays = manual.get(key) ?? defaultDays(key, user.branch);
    const usedDays = used.get(key) ?? 0;
    return {
      key,
      label: BALANCE_LABELS[key],
      totalDays,
      usedDays,
      remainingDays: totalDays - usedDays,
      automaticDays: 0,
      cycleScoped: false,
    };
  });

  return {
    balances,
    regularOvernight: config
      ? {
          enabled: config.enabled,
          startDate: config.startDate,
          intervalDays: config.intervalDays,
          daysPerGrant: config.daysPerGrant,
          // 설정에서 파생하는 표시용 값 — 저장하지 않는다.
          nextGrantDate: nextGrantDateAfter(config, todayInSeoul()),
        }
      : {
          enabled: false,
          startDate: null,
          intervalDays: null,
          daysPerGrant: null,
          nextGrantDate: null,
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
  // 주기에서 파생하는 재원은 사용자가 총량을 정할 수 없다. 클라이언트가 전체 재원을
  // 한 번에 보내므로 거절하는 대신 그 항목만 건너뛴다.
  const editable = (Object.entries(totals) as [BalanceKey, number][]).filter(
    ([key]) => !byKey.get(key)?.cycleScoped,
  );

  for (const [key, total] of editable) {
    const item = byKey.get(key);
    if (!item) continue;
    if (total < item.usedDays) {
      throw new Error(
        `${item.label}는 이미 ${item.usedDays}일을 사용해 총량을 그보다 작게 설정할 수 없습니다`,
      );
    }
  }

  const now = new Date().toISOString();
  for (const [key, total] of editable) {
    await db
      .insert(userLeaveBalances)
      .values({
        id: crypto.randomUUID(),
        userId: user.id,
        balanceKey: key,
        adjustmentDays: total,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [userLeaveBalances.userId, userLeaveBalances.balanceKey],
        set: { adjustmentDays: total, updatedAt: now },
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
        startDate: input.startDate,
        intervalDays: input.intervalDays,
        daysPerGrant: input.daysPerGrant,
        updatedAt: now,
      }
    : {
        userId: user.id,
        enabled: false,
        startDate: null,
        intervalDays: null,
        daysPerGrant: null,
        updatedAt: now,
      };
  await db.insert(regularOvernightConfigs).values(values).onConflictDoUpdate({
    target: regularOvernightConfigs.userId,
    set: values,
  });
  // 잔여량은 설정에서 파생하므로 따로 정리할 적립 원장이 없다.
  return getLeaveBalanceSummary(db, user);
}

/**
 * 정기외박은 주기마다 따로 쌓이고 이월되지 않으므로 재원 총합이 아니라
 * 구간이 걸친 주기별로 따져야 한다. 지난 주기에 휴가를 넣더라도 그 주기 몫에서 빠진다.
 */
async function assertRegularOvernightAvailable(
  db: Db,
  userId: string,
  config: RegularOvernightConfigRow | undefined,
  requested: SegmentLike[],
  replacingLeaveId?: string,
) {
  const requestedUsage = regularOvernightUsageByCycle(config, requested);
  if (requestedUsage.beforeStartDays > 0) {
    throw new Error(
      "정기외박 주기가 시작되기 전 날짜에는 정기외박을 사용할 수 없습니다",
    );
  }
  if (!requestedUsage.cycles.length) return;

  // 이미 저장된 구간에 이번 요청을 더해 주기별 사용량을 다시 센다.
  // 수정이면 교체될 휴가의 구간은 빼야 자기 자신과 부딪히지 않는다.
  const kept = await regularOvernightSegments(db, userId, replacingLeaveId);
  const after = regularOvernightUsageByCycle(config, [...kept, ...requested]);
  const usageByCycleStart = new Map(
    after.cycles.map((entry) => [entry.cycle.start, entry.usedDays]),
  );

  for (const { cycle } of requestedUsage.cycles) {
    const used = usageByCycleStart.get(cycle.start) ?? 0;
    if (used > cycle.grantDays) {
      throw new Error(
        cycle.grantDays === 0
          ? `정기외박 ${cycle.index}주기(${cycle.start}~${cycle.end})는 첫 적립 전이라 사용할 수 있는 정기외박이 없습니다`
          : `정기외박 ${cycle.index}주기(${cycle.start}~${cycle.end})에 쓸 수 있는 ${cycle.grantDays}일보다 많이 사용할 수 없습니다`,
      );
    }
  }
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
  const cycleScoped = new Set(
    summary.balances.filter((item) => item.cycleScoped).map((item) => item.key),
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
    // 주기 단위 재원은 총합이 아니라 주기별로 따로 확인한다.
    if (cycleScoped.has(key)) continue;
    const remaining = available.get(key) ?? 0;
    if (days > remaining) {
      throw new Error(
        `${BALANCE_LABELS[key]} 잔여 ${remaining}일보다 많이 사용할 수 없습니다`,
      );
    }
  }

  if (cycleScoped.has("regular_overnight")) {
    const config = await db
      .select()
      .from(regularOvernightConfigs)
      .where(eq(regularOvernightConfigs.userId, user.id))
      .get();
    await assertRegularOvernightAvailable(
      db,
      user.id,
      config,
      segments,
      replacingLeaveId,
    );
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
