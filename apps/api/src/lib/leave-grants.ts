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
  clipSegmentsTo,
  cycleColor,
  cycleState,
  cycleUsedDays,
  cyclesInRange,
  isRegularOvernightCycleBased,
  nextGrantDateAfter,
  normalizeLegacyDischargeDate,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveGrant,
  type LeaveGrantCreateInput,
  type LeaveGrantUpdateInput,
} from "@leave/shared";
import { and, eq } from "drizzle-orm";
import {
  leaveGrants,
  leaves,
  leaveSegments,
  regularOvernightConfigs,
  type LeaveGrantRow,
  type RegularOvernightConfigRow,
} from "../db/schema";
import type { Db } from "./db";
import { LeaveRuleError } from "./errors";
type User = {
  id: string;
  branch: Branch;
  enlistedAt: string;
  dischargeAt: string;
};

/** 주기가 아무리 촘촘해도 화면에 쏟아내지 않도록 두는 상한. */
const MAX_LISTED_CYCLES = 200;

/**
 * 주기 계산에 쓰는 전역일.
 *
 * DB 원본은 구버전 기본값이 그대로 남아 있을 수 있어, 폼이 /auth/me에서 받는 값과
 * 다를 수 있다. 정규화해서 폼과 서버가 같은 상한을 보게 한다.
 */
export function cycleDischargeDate(user: {
  enlistedAt: string;
  branch: Branch;
  dischargeAt: string;
}): string {
  return normalizeLegacyDischargeDate(
    user.enlistedAt,
    user.branch,
    user.dischargeAt,
  );
}

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

/*
 * 아래 셋은 실행하지 않은 쿼리(빌더)를 돌려준다.
 *
 * 잔여 계산은 늘 "적립분 + 구간 + 주기 설정" 셋을 함께 본다. `Promise.all`로 묶으면
 * 동시에 나가기는 해도 D1 왕복은 그대로 셋이다. 빌더로 넘겨 호출하는 쪽이
 * `db.batch()`로 묶으면 왕복이 하나가 된다. 셋 다 서로의 결과에 기대지 않으므로
 * 한 배치에 담아도 뜻이 바뀌지 않는다.
 */
export function grantsQuery(db: Db, userId: string) {
  return db.select().from(leaveGrants).where(eq(leaveGrants.userId, userId));
}

/** 배분에 쓰는, 이 사용자의 모든 휴가 구간. */
export function userSegmentsQuery(db: Db, userId: string) {
  return db
    .select({
      category: leaveSegments.category,
      overnightKind: leaveSegments.overnightKind,
      startDate: leaveSegments.startDate,
      endDate: leaveSegments.endDate,
    })
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .where(eq(leaves.userId, userId));
}

export function regularOvernightConfigQuery(db: Db, userId: string) {
  return db
    .select()
    .from(regularOvernightConfigs)
    .where(eq(regularOvernightConfigs.userId, userId));
}

/** 위 셋을 한 번의 D1 왕복으로 읽는다. */
export async function loadAllocationInputs(
  db: Db,
  userId: string,
  segmentsQuery = userSegmentsQuery(db, userId),
) {
  const [grantRows, segments, configRows] = await db.batch([
    grantsQuery(db, userId),
    segmentsQuery,
    regularOvernightConfigQuery(db, userId),
  ]);
  return { grantRows, segments, config: configRows[0] };
}

export async function listGrants(db: Db, userId: string) {
  return grantsQuery(db, userId).all();
}

export async function userSegments(db: Db, userId: string) {
  return userSegmentsQuery(db, userId).all();
}

export async function regularOvernightConfigOf(db: Db, userId: string) {
  return regularOvernightConfigQuery(db, userId).get();
}

/**
 * 자동 적립을 쓰는 동안에는 정기외박 적립분을 손으로 만들 수 없다.
 * 잔여량이 주기 설정에서 파생하므로 적립분을 둬 봐야 셈에 들어가지 않는다.
 */
export function assertGrantEditable(
  balanceKey: BalanceKey,
  config: RegularOvernightConfigRow | undefined,
) {
  if (
    balanceKey === "regular_overnight" &&
    isRegularOvernightCycleBased(config)
  ) {
    throw new LeaveRuleError(
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
      grantedOn:
        input.grantedOn === undefined ? existing.grantedOn : input.grantedOn,
      expiresOn:
        input.expiresOn === undefined ? existing.expiresOn : input.expiresOn,
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
  const { grantRows, segments, config } = await loadAllocationInputs(
    db,
    user.id,
  );

  const today = todayInSeoul();
  const grants = grantRows.map(toLeaveGrant);
  const allocations = allocateAllGrants(grants, segments, today);
  const cycleBased = isRegularOvernightCycleBased(config);
  const cycles = regularOvernightSummary(
    config,
    segments,
    cycleDischargeDate(user),
    today,
  );

  const funds = BALANCE_KEYS.map((key) => {
    const allocation = allocations[key];
    const scoped = key === "regular_overnight" && cycleBased;
    return {
      key,
      label: BALANCE_LABELS[key],
      cycleScoped: scoped,
      totalDays: allocation.totalDays,
      usedDays: allocation.usedDays,
      usedToDateDays: allocation.usedToDateDays,
      plannedDays: allocation.plannedDays,
      remainingDays: allocation.remainingDays,
      remainingAsOfTodayDays: allocation.remainingAsOfTodayDays,
      expiredDays: allocation.expiredDays,
      upcomingDays: allocation.upcomingDays,
      // 주기 재원은 주기별로 따로 따지므로 재원 총합의 미귀속은 의미가 없다.
      unattributedDays: scoped ? 0 : allocation.unattributedDays,
      grants: allocation.grants.map((entry) => ({
        id: entry.grant.id,
        balanceKey: entry.grant.balanceKey,
        days: entry.grant.days,
        usedDays: entry.usedDays,
        usedToDateDays: entry.usedToDateDays,
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

  // 주기 재원은 적립분 원장이 없어 재원 합계로는 0이다. 대신 아래 주기 목록에서 뽑은
  // 합계를 얹는다 — 전역까지 받을 몫까지 세야 "앞으로 쓸 수 있는 휴가"가 된다.
  const countable = funds.filter((fund) => !fund.cycleScoped);
  const sum = (pick: (fund: (typeof funds)[number]) => number) =>
    countable.reduce((acc, fund) => acc + pick(fund), 0);
  const totals = {
    totalDays: sum((f) => f.totalDays) + cycles.totals.totalDays,
    usedDays: sum((f) => f.usedDays) + cycles.totals.usedDays,
    usedToDateDays: sum((f) => f.usedToDateDays) + cycles.totals.usedToDateDays,
    plannedDays:
      sum((f) => f.plannedDays) +
      (cycles.totals.usedDays - cycles.totals.usedToDateDays),
    // 아직 오지 않은 주기 몫도 남은 휴가로 센다. 만기가 정해진 적립분과 달리 주기 몫은
    // 복무 중이면 반드시 들어오므로, 지금 못 쓴다는 이유로 빼면 실제보다 적게 보인다.
    remainingDays:
      sum((f) => f.remainingDays) +
      cycles.totals.remainingDays +
      cycles.totals.upcomingDays,
    // 화면의 "남은 휴가" — 오늘까지 다녀온 몫만 뺀다. 계획은 plannedDays로 따로 알린다.
    remainingAsOfTodayDays:
      sum((f) => f.remainingAsOfTodayDays) +
      cycles.totals.remainingAsOfTodayDays +
      cycles.totals.upcomingAsOfTodayDays,
    expiredDays: sum((f) => f.expiredDays) + cycles.totals.expiredDays,
    upcomingDays: sum((f) => f.upcomingDays),
    unattributedDays: sum((f) => f.unattributedDays),
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
      cycles: cycles.list,
    },
  };
}

/**
 * 주기 목록과 그 합계.
 *
 * 주기 몫은 이월되지 않아 재원 하나의 총량이라는 개념이 없다. 그래도 화면에 펼치는
 * 주기를 그대로 합산하면 대시보드 숫자와 아래 주기 목록이 어긋나지 않는다.
 * 지난 주기의 미사용분은 그 주기와 함께 사라지므로 소멸로 센다.
 */
export function regularOvernightSummary(
  config: RegularOvernightConfigRow | undefined,
  segments: Awaited<ReturnType<typeof userSegments>>,
  dischargeAt: string,
  today: string,
) {
  const list = buildCycleList(config, segments, dischargeAt, today);
  const totals = {
    totalDays: 0,
    usedDays: 0,
    /** 그중 오늘까지 지나간 몫. */
    usedToDateDays: 0,
    /** 이번 주기의 잔여 — 지금 쓸 수 있는 몫. */
    remainingDays: 0,
    /** 이번 주기의 잔여 중 오늘까지 쓴 것만 뺀 값. */
    remainingAsOfTodayDays: 0,
    /** 아직 오지 않은 주기의 잔여 — 앞으로 받을 몫. */
    upcomingDays: 0,
    /** 앞으로 받을 몫 중 오늘까지 쓴 것만 뺀 값(미래 주기는 늘 그 주기 몫 전체). */
    upcomingAsOfTodayDays: 0,
    /** 지난 주기에서 못 쓰고 날린 몫. */
    expiredDays: 0,
  };
  for (const cycle of list) {
    totals.totalDays += cycle.grantDays;
    totals.usedDays += cycle.usedDays;
    totals.usedToDateDays += cycle.usedToDateDays;
    if (cycle.state === "past") {
      // 지난 주기는 이미 끝나 계획이 남을 수 없다 — 두 셈이 같다.
      totals.expiredDays += cycle.remainingDays;
    } else if (cycle.state === "future") {
      totals.upcomingDays += cycle.remainingDays;
      totals.upcomingAsOfTodayDays += cycle.remainingAsOfTodayDays;
    } else {
      totals.remainingDays += cycle.remainingDays;
      totals.remainingAsOfTodayDays += cycle.remainingAsOfTodayDays;
    }
  }
  return { list, totals };
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
      // 아직 다녀오지 않은 계획은 "쓴 몫"이 아니다 — 주기 안에서도 오늘까지만 센다.
      const usedToDateDays = cycleUsedDays(
        cycle,
        clipSegmentsTo(segments, today),
      );
      return {
        index: cycle.index,
        start: cycle.start,
        end: cycle.end,
        grantDays: cycle.grantDays,
        usedDays,
        usedToDateDays,
        remainingDays: cycle.grantDays - usedDays,
        remainingAsOfTodayDays: cycle.grantDays - usedToDateDays,
        state: cycleState(cycle, today),
        color: cycleColor(cycle.index),
      };
    });
}
