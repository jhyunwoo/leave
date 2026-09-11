/**
 * 적립분(leave_grants) 읽기·쓰기와 "보유 휴가" 화면 payload 조립.
 *
 * 배분 규칙 자체는 @leave/shared의 leave-grants.ts에 순수 함수로 있고, 여기서는
 * DB에서 재료를 모아 그 함수에 먹이는 일만 한다.
 */

import {
  allocateAllGrants,
  BALANCE_KEYS,
  BALANCE_LABELS,
  BALANCE_LEAVE_STATUSES,
  clipSegmentsTo,
  cycleColor,
  cycleDateAfter,
  cycleState,
  cycleUsedDays,
  cyclesInRange,
  isOutingCycleBased,
  isRegularOvernightCycleBased,
  nextGrantDateAfter,
  normalizeLegacyDischargeDate,
  OUTING_KINDS,
  outingBalanceKey,
  outingKindOfBalanceKey,
  outingUsedDays,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveCycle,
  type LeaveCycleConfig,
  type LeaveGrant,
  type LeaveGrantCreateInput,
  type LeaveGrantUpdateInput,
  type OutingKind,
} from "@leave/shared";
import { and, eq, inArray } from "drizzle-orm";
import {
  leaveGrants,
  leaves,
  leaveSegments,
  outingConfigs,
  regularOvernightConfigs,
  type LeaveGrantRow,
  type OutingConfigRow,
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

/**
 * 배분에 쓰는, 이 사용자의 모든 휴가 구간.
 *
 * `leaveId`까지 읽는 이유는 호출자가 특정 휴가의 구간을 빼고 계산해야 할 때가 있어서다
 * (수정 중인 휴가, 이번 저장으로 흡수될 이웃). 예전에는 그 제외를 `NOT IN (...)`으로
 * SQL에 넣었는데, 목록이 길어지면 D1 바인드 파라미터 상한에 걸려 저장이 죽었다.
 * 한 사용자의 구간은 메모리에서 걸러도 충분히 싸다.
 */
export function userSegmentsQuery(db: Db, userId: string) {
  return db
    .select({
      leaveId: leaveSegments.leaveId,
      category: leaveSegments.category,
      overnightKind: leaveSegments.overnightKind,
      // 갈래를 읽지 않으면 주말 외출이 전부 평일로 접혀(segmentBalanceKey) 한쪽 주머니만
      // 깎인다. 정기외박의 주기 컬럼을 빠뜨렸던 사고와 같은 종류다(아래 주석 참고).
      outingKind: leaveSegments.outingKind,
      startDate: leaveSegments.startDate,
      endDate: leaveSegments.endDate,
      // 사용자가 고른 주기가 있으면 그 주기에서 통째로 빼야 한다
      // (`cycleUsedDays`의 명시 분기). 이 컬럼이 빠져 있던 동안 서버는 항상 레거시
      // 겹침 계산을 탔고, /leaves/mine을 보는 폼과 귀속이 갈려 "칩은 여유가 있다는데
      // 저장하면 400"이 났다.
      regularOvernightCycleStart: leaveSegments.regularOvernightCycleStart,
    })
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .where(
      and(
        eq(leaves.userId, userId),
        // 취소·반려한 휴가는 실제로 나가지 않으므로 잔여가 돌아와야 한다.
        // 초안은 내가 잡아 둔 계획이라 그대로 빠진다(shared의 주석 참고).
        inArray(leaves.status, [...BALANCE_LEAVE_STATUSES]),
      ),
    );
}

export function regularOvernightConfigQuery(db: Db, userId: string) {
  return db
    .select()
    .from(regularOvernightConfigs)
    .where(eq(regularOvernightConfigs.userId, userId));
}

/** 외출 설정은 갈래마다 한 행이라 둘이 함께 온다. */
export function outingConfigQuery(db: Db, userId: string) {
  return db
    .select()
    .from(outingConfigs)
    .where(eq(outingConfigs.userId, userId));
}

/** 갈래별 설정 표. 행이 없는 갈래는 undefined — 아직 한 번도 저장하지 않은 것이다. */
export type OutingConfigMap = Partial<Record<OutingKind, OutingConfigRow>>;

export function foldOutingConfigs(rows: readonly OutingConfigRow[]) {
  const map: OutingConfigMap = {};
  for (const row of rows) map[row.kind] = row;
  return map;
}

/** 위 넷을 한 번의 D1 왕복으로 읽는다. */
export async function loadAllocationInputs(
  db: Db,
  userId: string,
  segmentsQuery = userSegmentsQuery(db, userId),
) {
  const [grantRows, segments, configRows, outingRows] = await db.batch([
    grantsQuery(db, userId),
    segmentsQuery,
    regularOvernightConfigQuery(db, userId),
    outingConfigQuery(db, userId),
  ]);
  return {
    grantRows,
    segments,
    config: configRows[0],
    outing: foldOutingConfigs(outingRows),
  };
}

export async function listGrants(db: Db, userId: string) {
  return grantsQuery(db, userId).all();
}

export async function userSegments(db: Db, userId: string) {
  return userSegmentsQuery(db, userId).all();
}

export async function outingConfigsOf(db: Db, userId: string) {
  return foldOutingConfigs(await outingConfigQuery(db, userId).all());
}

/**
 * 자동 적립을 쓰는 동안에는 그 재원의 적립분을 손으로 만들 수 없다.
 * 잔여량이 주기 설정에서 파생하므로 적립분을 둬 봐야 셈에 들어가지 않는다.
 *
 * 외출도 같다. 다만 갈래마다 설정이 따로라 평일을 켜 두고 주말은 꺼 둘 수 있고,
 * 그때 주말 외출 적립분은 여전히 손으로 만들 수 있어야 한다.
 */
export function assertGrantEditable(
  balanceKey: BalanceKey,
  config: RegularOvernightConfigRow | undefined,
  outing: OutingConfigMap = {},
) {
  if (
    balanceKey === "regular_overnight" &&
    isRegularOvernightCycleBased(config)
  ) {
    throw new LeaveRuleError(
      "정기외박은 주기 설정에서 자동으로 계산돼 적립분을 따로 만들 수 없어요",
    );
  }
  const kind = outingKindOfBalanceKey(balanceKey);
  if (kind && isOutingCycleBased(outing[kind])) {
    throw new LeaveRuleError(
      `${BALANCE_LABELS[balanceKey]}은 주기 설정에서 자동으로 계산돼 적립분을 따로 만들 수 없어요`,
    );
  }
}

export async function createGrant(
  db: Db,
  user: User,
  input: LeaveGrantCreateInput,
) {
  const [configRows, outingRows] = await db.batch([
    regularOvernightConfigQuery(db, user.id),
    outingConfigQuery(db, user.id),
  ]);
  assertGrantEditable(
    input.balanceKey,
    configRows[0],
    foldOutingConfigs(outingRows),
  );
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
  const { grantRows, segments, config, outing } = await loadAllocationInputs(
    db,
    user.id,
  );

  const today = todayInSeoul();
  const dischargeAt = cycleDischargeDate(user);
  const grants = grantRows.map(toLeaveGrant);
  const allocations = allocateAllGrants(grants, segments, today);
  const cycleBased = isRegularOvernightCycleBased(config);
  const cycles = regularOvernightSummary(config, segments, dischargeAt, today);
  const outingFunds = OUTING_KINDS.map((kind) => ({
    kind,
    config: outing[kind],
    summary: outingSummary(kind, outing[kind], segments, dischargeAt, today),
  }));
  const outingScoped = new Set(
    outingFunds
      .filter((fund) => isOutingCycleBased(fund.config))
      .map((fund) => outingBalanceKey(fund.kind)),
  );

  const funds = BALANCE_KEYS.map((key) => {
    const allocation = allocations[key];
    const scoped =
      (key === "regular_overnight" && cycleBased) || outingScoped.has(key);
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
  /**
   * 정기외박의 합계는 적립분이 아니라 주기 목록에서 온다.
   *
   * **외출은 주기 재원인데도 여기 들어가지 않는다.** 이 합계는 "남은 휴가 N일"이고,
   * 외출은 일이 아니라 횟수다 — 당일 복귀라 일과가 사라지지 않는 것이 외출의 정의이고
   * (lib/duty-days.ts), 월 2회를 2일로 더하면 화면이 없는 휴가를 있다고 말한다.
   * 외출은 아래 `outing`에 따로 실어 화면이 제 단위로 그리게 한다.
   */
  const overnightCycleSum = (
    pick: (totals: (typeof cycles)["totals"]) => number,
  ): number => pick(cycles.totals);
  const totals = {
    totalDays: sum((f) => f.totalDays) + overnightCycleSum((c) => c.totalDays),
    usedDays: sum((f) => f.usedDays) + overnightCycleSum((c) => c.usedDays),
    usedToDateDays:
      sum((f) => f.usedToDateDays) + overnightCycleSum((c) => c.usedToDateDays),
    plannedDays:
      sum((f) => f.plannedDays) +
      overnightCycleSum((c) => c.usedDays - c.usedToDateDays),
    // 아직 오지 않은 주기 몫도 남은 휴가로 센다. 만기가 정해진 적립분과 달리 주기 몫은
    // 복무 중이면 반드시 들어오므로, 지금 못 쓴다는 이유로 빼면 실제보다 적게 보인다.
    remainingDays:
      sum((f) => f.remainingDays) +
      overnightCycleSum((c) => c.remainingDays + c.upcomingDays),
    // 화면의 "남은 휴가" — 오늘까지 다녀온 몫만 뺀다. 계획은 plannedDays로 따로 알린다.
    remainingAsOfTodayDays:
      sum((f) => f.remainingAsOfTodayDays) +
      overnightCycleSum(
        (c) => c.remainingAsOfTodayDays + c.upcomingAsOfTodayDays,
      ),
    expiredDays:
      sum((f) => f.expiredDays) + overnightCycleSum((c) => c.expiredDays),
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
      intervalMonths: config?.intervalMonths ?? null,
      daysPerGrant: config?.daysPerGrant ?? null,
      nextGrantDate: nextGrantDateAfter(config, today),
      carryOver: config?.carryOver ?? false,
      cycles: cycles.list,
    },
    outing: outingFunds.map((fund) => ({
      ...serializeOutingConfig(fund.kind, fund.config, today),
      cycles: fund.summary.list,
    })),
  };
}

/**
 * 외출 설정 한 벌을 응답 모양으로. 행이 아예 없는 갈래도 "꺼짐"으로 내보낸다 —
 * 화면이 갈래 둘을 늘 같은 자리에 그리려면 빈 항목이 필요하다.
 */
export function serializeOutingConfig(
  kind: OutingKind,
  config: OutingConfigRow | undefined,
  today: string,
) {
  return {
    kind,
    enabled: config?.enabled ?? false,
    startDate: config?.startDate ?? null,
    intervalDays: config?.intervalDays ?? null,
    intervalMonths: config?.intervalMonths ?? null,
    daysPerGrant: config?.daysPerGrant ?? null,
    // 설정에서 파생하는 표시용 값 — 저장하지 않는다.
    nextGrantDate: nextGrantDateAfter(config, today),
    carryOver: config?.carryOver ?? false,
  };
}

/**
 * 주기 목록과 그 합계.
 *
 * 주기 몫은 (이월을 끄면) 이월되지 않아 재원 하나의 총량이라는 개념이 없다. 그래도
 * 화면에 펼치는 주기를 그대로 합산하면 대시보드 숫자와 아래 주기 목록이 어긋나지 않는다.
 * 지난 주기의 미사용분은 그 주기와 함께 사라지므로 소멸로 센다.
 *
 * 이월을 켜면 **소멸로 세던 몫이 잔여로 옮겨갈 뿐** 나머지 셈은 그대로다. 주기별
 * 잔여의 합이 곧 누적 잔여이기 때문이다(cycleRemainingDays 주석). 덕분에
 * `총량 = 사용 + 잔여 + 소멸 + 적립예정` 항등식이 두 모드에서 똑같이 성립한다.
 */
export function regularOvernightSummary(
  config: RegularOvernightConfigRow | undefined,
  segments: Segments,
  dischargeAt: string,
  today: string,
) {
  const rows = buildCycleList(
    isRegularOvernightCycleBased(config) ? config : undefined,
    segments,
    dischargeAt,
    today,
    cycleUsedDays,
  );
  // 색은 정기외박에만 붙는다 — 달력이 주기 경계를 색 선으로 그리기 때문이다.
  // 외출 주기는 시작일 마커라 색이 필요 없다(outingSummary).
  const list = rows.map((row) => ({ ...row, color: cycleColor(row.index) }));
  return { list, totals: cycleTotals(list, Boolean(config?.carryOver)) };
}

type Segments = Awaited<ReturnType<typeof userSegments>>;

/**
 * 주기 목록을 만든다. 정기외박과 외출이 같은 뼈대를 쓰고, 다른 것은 둘뿐이다 —
 * "그 주기를 며칠 썼는가"(재원마다 다름)와 색을 붙일지(외출은 안 붙인다).
 */
function buildCycleList(
  config: LeaveCycleConfig | undefined,
  segments: Segments,
  dischargeAt: string,
  today: string,
  usedIn: (cycle: LeaveCycle, segments: Segments) => number,
) {
  if (!config?.startDate || !config.enabled) return [];
  // 전역일이 지났거나 첫 적립보다 일러도 1·2주기는 보이게 한다(첫 적립 = 시작일 + 1주기).
  // 주기 단위가 일일 수도 달일 수도 있어 직접 더하지 않고 주기 계산에 맡긴다.
  const floor = cycleDateAfter(config, 2) ?? config.startDate;
  const end = [dischargeAt, today, floor].reduce((a, b) => (a > b ? a : b));

  // 상한을 목록에만 따로 두지 않는다. 예전에는 목록이 200개, 이월 누적이 500개를
  // 세서 화면의 주기 합계와 "누적 잔여"가 조용히 갈렸다. `cyclesInRange`가 이미
  // 공용 상한(MAX_LEAVE_CYCLES)에서 멈추고, 그 상한에 닿는 설정은
  // 저장 단계에서 거절된다(saveRegularOvernightConfig · saveOutingConfig).
  return cyclesInRange(config, config.startDate, end).map((cycle) => {
    const usedDays = usedIn(cycle, segments);
    // 아직 다녀오지 않은 계획은 "쓴 몫"이 아니다 — 주기 안에서도 오늘까지만 센다.
    const usedToDateDays = usedIn(cycle, clipSegmentsTo(segments, today));
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
    };
  });
}

/** 주기 목록을 합산한다. 정기외박과 외출이 같은 항등식을 쓴다. */
type CycleRow = ReturnType<typeof buildCycleList>[number];

function cycleTotals(list: readonly CycleRow[], carryOver: boolean) {
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
    if (cycle.state === "future") {
      totals.upcomingDays += cycle.remainingDays;
      totals.upcomingAsOfTodayDays += cycle.remainingAsOfTodayDays;
    } else if (cycle.state === "past" && !carryOver) {
      // 지난 주기는 이미 끝나 계획이 남을 수 없다 — 두 셈이 같다.
      totals.expiredDays += cycle.remainingDays;
    } else {
      // 이번 주기, 그리고 이월 중이라면 지난 주기의 남은 몫까지 지금 쓸 수 있는 잔여다.
      totals.remainingDays += cycle.remainingDays;
      totals.remainingAsOfTodayDays += cycle.remainingAsOfTodayDays;
    }
  }
  return totals;
}

/**
 * 외출 갈래 하나의 주기 목록과 합계. 정기외박과 같은 셈이되 **색을 붙이지 않는다** —
 * 달력이 외출 주기를 색이 아니라 시작일 마커로 보여주기 때문이다.
 */
export function outingSummary(
  kind: OutingKind,
  config: OutingConfigRow | undefined,
  segments: Segments,
  dischargeAt: string,
  today: string,
) {
  const list = buildCycleList(
    isOutingCycleBased(config) ? config : undefined,
    segments,
    dischargeAt,
    today,
    (cycle, rows) => outingUsedDays(kind, cycle, rows),
  );
  return { list, totals: cycleTotals(list, Boolean(config?.carryOver)) };
}
