/**
 * 재원별 보유·사용·잔여 계산과 저장.
 *
 * 사용처: `/leaves/balances`, 휴가 저장 전 잔여 검사, 정기외박 설정 저장.
 *
 * "며칠 남았는가"는 단순 뺄셈이 아니다. 적립분마다 유효기간이 다르고,
 * 정기외박은 총량이 아니라 주기별로 따로 센다. 그 규칙을 여기 한곳에 모아
 * 앱·웹·관리자가 같은 숫자를 보게 한다.
 */

import {
  allocateAllGrants,
  BALANCE_KEYS,
  BALANCE_LABELS,
  checkRegularOvernight,
  clipSegmentsTo,
  cycleFor,
  cycleUsedDays,
  fmtDateShort,
  isExpiringSoon,
  isRegularOvernightCycleBased,
  nextGrantDateAfter,
  planTotalChange,
  regularOvernightBlockMessage,
  segmentBalanceKey,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveSegment,
  type RegularOvernightConfigInput,
  type SegmentLike,
} from "@leave/shared";
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
import {
  leaveGrants,
  leaves,
  leaveSegments,
  regularOvernightConfigs,
  type RegularOvernightConfigRow,
} from "../db/schema";
import type { Db } from "./db";
import { LeaveRuleError } from "./errors";
import {
  cycleDischargeDate,
  listGrants,
  regularOvernightSummary,
  toLeaveGrant,
  userSegments,
} from "./leave-grants";

export type LeaveBalanceItem = {
  key: BalanceKey;
  label: string;
  totalDays: number;
  /** 미래 계획까지 포함한 사용 일수. */
  usedDays: number;
  /** 오늘까지 실제로 지나간 사용 일수. */
  usedToDateDays: number;
  /** 미래에 계획만 해둔 일수. 아직 쓴 것이 아니다. */
  plannedDays: number;
  /** 계획까지 미리 뺀 잔여 — 새 휴가를 더 넣을 수 있는지 판단할 때 쓴다. */
  remainingDays: number;
  /** 오늘까지 쓴 것만 뺀 잔여 — 화면에서 "남은 휴가"로 보여주는 값. */
  remainingAsOfTodayDays: number;
  automaticDays: number;
  /**
   * 총량·사용량이 이번 주기 기준인지. 정기외박 자동 적립을 쓰면 true가 되고,
   * 이때 총량은 사용자가 직접 고칠 수 없다(주기 설정에서 파생한다).
   */
  cycleScoped: boolean;
  /** 만료된 적립분 중 못 쓰고 날린 일수. */
  expiredDays: number;
  /** 아직 부여일이 오지 않은 적립분의 미사용분. 미래 계획도 빠진다. */
  upcomingDays: number;
  /** 계획을 빼지 않은 예정분 — 화면의 "남은 휴가"에 더할 때 쓰는 값. */
  upcomingAsOfTodayDays: number;
  /** 어떤 적립분으로도 설명되지 않는 사용 일수. */
  unattributedDays: number;
  /** 이 재원이 가진 적립분 건수. */
  grantCount: number;
  /** 30일 안에 만기가 닥치는, 아직 쓸 수 있는 일수. */
  expiringSoonDays: number;
};

/**
 * 정기외박 잔여량 계산에 필요한, 날짜가 살아 있는 내 정기외박 구간들.
 * excludeLeaveIds를 주면 그 휴가들의 구간은 뺀다(수정 중인 휴가, 그리고 이번 저장으로 흡수될 이웃들).
 */
async function regularOvernightSegments(
  db: Db,
  userId: string,
  excludeLeaveIds: readonly string[] = [],
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
        // 빈 배열로 notInArray를 부르면 드라이버마다 결과가 갈린다. 아예 조건을 뺀다.
        ...(excludeLeaveIds.length
          ? [notInArray(leaveSegments.leaveId, [...excludeLeaveIds])]
          : []),
      ),
    )
    .all();
}

export async function getLeaveBalanceSummary(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
) {
  const [grantRows, segments, config, regularSegments] = await Promise.all([
    listGrants(db, user.id),
    userSegments(db, user.id),
    db
      .select()
      .from(regularOvernightConfigs)
      .where(eq(regularOvernightConfigs.userId, user.id))
      .get(),
    regularOvernightSegments(db, user.id),
  ]);

  const today = todayInSeoul();
  const allocations = allocateAllGrants(
    grantRows.map(toLeaveGrant),
    segments,
    today,
  );

  // 자동 적립을 쓰면 정기외박은 주기마다 새로 쌓이고 이월되지 않는다.
  // 그래서 누적 총량이 아니라 "이번 주기 몫과 그 주기 안 사용량"만 보여준다.
  const cycleBased = isRegularOvernightCycleBased(config);
  const currentCycle = cycleFor(config, today);
  // 전역까지 앞으로 받을 주기 몫 — 지금 쓸 수는 없지만 보유한 휴가에는 들어간다.
  const cycles = regularOvernightSummary(
    config,
    regularSegments,
    cycleDischargeDate(user),
    today,
  );

  const balances: LeaveBalanceItem[] = BALANCE_KEYS.map((key) => {
    if (key === "regular_overnight" && cycleBased) {
      const grantDays = currentCycle?.grantDays ?? 0;
      const usedDays = currentCycle
        ? cycleUsedDays(currentCycle, regularSegments)
        : 0;
      // 이번 주기 안에서도 아직 다녀오지 않은 계획은 "쓴 것"에 넣지 않는다.
      const usedToDateDays = currentCycle
        ? cycleUsedDays(currentCycle, clipSegmentsTo(regularSegments, today))
        : 0;
      return {
        key,
        label: BALANCE_LABELS[key],
        totalDays: grantDays,
        usedDays,
        usedToDateDays,
        plannedDays: usedDays - usedToDateDays,
        remainingDays: grantDays - usedDays,
        remainingAsOfTodayDays: grantDays - usedToDateDays,
        automaticDays: grantDays,
        cycleScoped: true,
        // 지난 주기에서 날린 몫은 주기별로 봐야 뜻이 통해 보유 휴가 화면에만 둔다.
        expiredDays: 0,
        upcomingDays: cycles.totals.upcomingDays,
        upcomingAsOfTodayDays: cycles.totals.upcomingAsOfTodayDays,
        unattributedDays: 0,
        grantCount: 0,
        expiringSoonDays: 0,
      };
    }
    const allocation = allocations[key];
    return {
      key,
      label: BALANCE_LABELS[key],
      totalDays: allocation.totalDays,
      usedDays: allocation.usedDays,
      usedToDateDays: allocation.usedToDateDays,
      plannedDays: allocation.plannedDays,
      remainingDays: allocation.remainingDays,
      remainingAsOfTodayDays: allocation.remainingAsOfTodayDays,
      automaticDays: 0,
      cycleScoped: false,
      expiredDays: allocation.expiredDays,
      upcomingDays: allocation.upcomingDays,
      upcomingAsOfTodayDays: allocation.upcomingAsOfTodayDays,
      unattributedDays: allocation.unattributedDays,
      grantCount: allocation.grants.length,
      expiringSoonDays: allocation.grants
        .filter((entry) => isExpiringSoon(entry.grant, today))
        .reduce((sum, entry) => sum + entry.availableDays, 0),
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

/**
 * 구버전 앱이 쓰는 "재원 총량을 N일로" API를 적립분 모델에 얹는다.
 *
 * 어느 적립분을 뜻하는지는 알 수 없으므로 관행을 정해 둔다: 늘릴 때는 만기 없는
 * 기본 적립분 하나만 키우고, 줄일 때는 기본 적립분부터 그다음 만기가 늦은 것부터
 * 흡수한다(만기 임박분을 최대한 살린다). 만기가 붙은 적립분은 이 API로 만들 수 없고,
 * 보유 휴가 화면에서만 다룬다. 손실이 있는 매핑이지만 예측 가능한 쪽을 골랐다.
 */
export async function updateLeaveBalanceTotals(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  totals: Partial<Record<BalanceKey, number>>,
) {
  const [grantRows, segments, config] = await Promise.all([
    listGrants(db, user.id),
    userSegments(db, user.id),
    db
      .select()
      .from(regularOvernightConfigs)
      .where(eq(regularOvernightConfigs.userId, user.id))
      .get(),
  ]);
  const allocations = allocateAllGrants(
    grantRows.map(toLeaveGrant),
    segments,
    todayInSeoul(),
  );
  const cycleBased = isRegularOvernightCycleBased(config);

  // 주기에서 파생하는 재원은 사용자가 총량을 정할 수 없다. 클라이언트가 전체 재원을
  // 한 번에 보내므로 거절하는 대신 그 항목만 건너뛴다.
  const editable = (Object.entries(totals) as [BalanceKey, number][]).filter(
    ([key]) => !(key === "regular_overnight" && cycleBased),
  );

  const plans = editable.map(([key, total]) => {
    const plan = planTotalChange(allocations[key], total);
    if (!plan.ok) {
      throw new LeaveRuleError(
        `${BALANCE_LABELS[key]}는 이미 ${plan.minimumTotal}일을 사용해 총량을 그보다 작게 설정할 수 없습니다`,
      );
    }
    return { key, plan };
  });

  const now = new Date().toISOString();
  for (const { key, plan } of plans) {
    for (const mutation of plan.mutations) {
      if (mutation.kind === "create") {
        await db.insert(leaveGrants).values({
          id: crypto.randomUUID(),
          userId: user.id,
          balanceKey: key,
          days: mutation.days,
          grantedOn: null,
          expiresOn: null,
          note: null,
          createdAt: now,
          updatedAt: now,
        });
      } else if (mutation.kind === "update") {
        await db
          .update(leaveGrants)
          .set({ days: mutation.days, updatedAt: now })
          .where(
            and(
              eq(leaveGrants.id, mutation.id),
              eq(leaveGrants.userId, user.id),
            ),
          );
      } else {
        await db
          .delete(leaveGrants)
          .where(
            and(
              eq(leaveGrants.id, mutation.id),
              eq(leaveGrants.userId, user.id),
            ),
          );
      }
    }
  }
  return getLeaveBalanceSummary(db, user);
}

export async function saveRegularOvernightConfig(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  input: RegularOvernightConfigInput,
) {
  if (user.branch === "army" && input.enabled) {
    throw new LeaveRuleError(
      "정기외박 자동 적립은 해군과 공군에서 설정할 수 있습니다",
    );
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
 * 구간이 걸친 주기별로 따져야 한다. 지난 주기에 휴가를 넣더라도 그 주기 몫에서 빠지고,
 * 아직 오지 않은 주기도 그 몫 안이면 미리 쓸 수 있다.
 *
 * 판정 규칙은 폼과 공유하려고 @leave/shared에 있다 — 여기서는 재료만 모은다.
 */
async function assertRegularOvernightAvailable(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  config: RegularOvernightConfigRow | undefined,
  requested: SegmentLike[],
  replacingLeaveIds: readonly string[],
) {
  // 이번 저장으로 사라질 휴가들의 구간은 빼야 자기 자신과 부딪히지 않는다.
  const existing = await regularOvernightSegments(
    db,
    user.id,
    replacingLeaveIds,
  );
  const block = checkRegularOvernight({
    config,
    existing,
    requested,
    dischargeAt: cycleDischargeDate(user),
  });
  if (block) throw new LeaveRuleError(regularOvernightBlockMessage(block));
}

/**
 * 요청한 구간을 실제로 지불할 적립분이 있는지 확인한다.
 *
 * "이 요청을 넣기 전"과 "넣은 뒤"를 각각 배분해 보고, 어떤 재원에서든 설명되지 않는
 * 사용분(unattributedDays)이 늘어나면 거절한다. 이 한 조건이 "잔여 초과"와
 * "만기가 지난 날짜에 사용"을 모두 흡수한다.
 *
 * 수정이거나 이웃을 흡수할 때 사라질 구간을 빼고 배분하므로 환급 계산이 따로 필요 없고, 이미 미귀속이
 * 쌓여 있는 사용자도 그것을 더 악화시키지 않는 한 다른 휴가를 계속 고칠 수 있다.
 */
export async function assertSegmentsAvailable(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  segments: LeaveSegment[],
  replacingLeaveIds: readonly string[] = [],
) {
  const [grantRows, allSegments, config] = await Promise.all([
    listGrants(db, user.id),
    replacingLeaveIds.length
      ? userSegmentsExcluding(db, user.id, replacingLeaveIds)
      : userSegments(db, user.id),
    db
      .select()
      .from(regularOvernightConfigs)
      .where(eq(regularOvernightConfigs.userId, user.id))
      .get(),
  ]);

  const today = todayInSeoul();
  const grants = grantRows.map(toLeaveGrant);
  const before = allocateAllGrants(grants, allSegments, today);
  const after = allocateAllGrants(grants, [...allSegments, ...segments], today);
  const cycleBased = isRegularOvernightCycleBased(config);

  const requested = new Set(
    segments.map((segment) => segmentBalanceKey(segment)),
  );
  for (const key of requested) {
    // 주기 단위 재원은 총합이 아니라 주기별로 따로 확인한다.
    if (key === "regular_overnight" && cycleBased) continue;
    const gained = after[key].unattributedDays - before[key].unattributedDays;
    if (gained <= 0) continue;

    // 이번 요청 범위 안의 날짜를 짚을 수 있으면 그 날짜를 알려준다.
    const blocked = after[key].unattributedDates.find((date) =>
      segments.some(
        (segment) => segment.startDate <= date && date <= segment.endDate,
      ),
    );
    throw new LeaveRuleError(
      blocked
        ? `${BALANCE_LABELS[key]} — ${fmtDateShort(blocked)}에 쓸 수 있는 적립분이 없어요 (만료됐거나 잔여가 부족합니다)`
        : `${BALANCE_LABELS[key]} 잔여 ${before[key].remainingDays}일보다 많이 사용할 수 없습니다`,
    );
  }

  if (cycleBased && requested.has("regular_overnight")) {
    await assertRegularOvernightAvailable(
      db,
      user,
      config,
      segments,
      replacingLeaveIds,
    );
  }
}

/** 이번 저장으로 사라지거나 교체될 휴가의 구간을 뺀, 이 사용자의 나머지 구간들. */
async function userSegmentsExcluding(
  db: Db,
  userId: string,
  excludeLeaveIds: readonly string[],
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
        notInArray(leaveSegments.leaveId, [...excludeLeaveIds]),
      ),
    )
    .all();
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
