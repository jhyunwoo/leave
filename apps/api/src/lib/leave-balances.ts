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
  checkOuting,
  checkRegularOvernight,
  clipSegmentsTo,
  COUNTED_LEAVE_STATUSES,
  cycleFor,
  cycleUsedDays,
  eligibleRegularOvernightCycles,
  fmtDateShort,
  isExpiringSoon,
  isOutingCycleBased,
  isRegularOvernightCycleBased,
  leaveCycleCount,
  MAX_LEAVE_CYCLES,
  MAX_REGULAR_OVERNIGHT_CYCLES,
  nextGrantDateAfter,
  OUTING_KINDS,
  outingBalanceKey,
  outingBlockMessage,
  outingKindOfBalanceKey,
  outingUsedDays,
  planTotalChange,
  regularOvernightBlockMessage,
  regularOvernightCycleCount,
  segmentBalanceKey,
  todayInSeoul,
  type BalanceKey,
  type Branch,
  type LeaveSegment,
  type OutingConfigInput,
  type OutingKind,
  type RegularOvernightConfigInput,
  type SegmentLike,
} from "@leave/shared";
import { and, asc, eq, gte, inArray, lte, ne, or } from "drizzle-orm";
import {
  leaveGrants,
  leaves,
  leaveSegments,
  outingConfigs,
  regularOvernightConfigs,
  users,
  type LeaveRow,
  type LeaveSegmentRow,
  type RegularOvernightConfigRow,
} from "../db/schema";
import {
  chunkForParams,
  insertStatements,
  runBatch,
  type BatchItem,
} from "./d1";
import type { Db } from "./db";
import { LeaveRuleError } from "./errors";
import {
  cycleDischargeDate,
  loadAllocationInputs,
  outingSummary,
  regularOvernightSummary,
  serializeOutingConfig,
  toLeaveGrant,
  type OutingConfigMap,
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

/** 이미 읽어 둔 구간 중 정기외박(자동 적립 대상)만 고른다. */
function onlyRegularOvernight<
  T extends { category: string; overnightKind: string | null },
>(segments: readonly T[]): T[] {
  return segments.filter(
    (segment) =>
      segment.category === "overnight" && segment.overnightKind === "regular",
  );
}

/** 이미 읽어 둔 구간 중 외출만. 갈래는 판정 쪽에서 가른다. */
function onlyOuting<T extends { category: string }>(
  segments: readonly T[],
): T[] {
  return segments.filter((segment) => segment.category === "outing");
}

/**
 * 이 재원이 주기 설정에서 파생하는가.
 *
 * 주기 재원은 적립분 원장을 쓰지 않는다 — 총량을 손으로 정할 수도, 적립분을 만들 수도,
 * 스칼라 잔여로 검사할 수도 없다. 그 셋이 같은 조건을 봐야 해서 여기 한 벌만 둔다.
 */
export function isCycleScoped(
  key: BalanceKey,
  config: RegularOvernightConfigRow | undefined,
  outing: OutingConfigMap,
): boolean {
  if (key === "regular_overnight") return isRegularOvernightCycleBased(config);
  const kind = outingKindOfBalanceKey(key);
  return kind ? isOutingCycleBased(outing[kind]) : false;
}

export async function getLeaveBalanceSummary(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
) {
  const { grantRows, segments, config, outing } = await loadAllocationInputs(
    db,
    user.id,
  );

  // 정기외박 구간은 위에서 이미 읽은 전체 구간의 부분집합이다. 같은 조인을
  // 조건만 좁혀 한 번 더 던지면 왕복만 하나 늘고 결과는 같다 — 여기서 걸러 쓴다.
  const regularSegments = onlyRegularOvernight(segments);
  const outingSegments = onlyOuting(segments);

  const today = todayInSeoul();
  const allocations = allocateAllGrants(
    grantRows.map(toLeaveGrant),
    segments,
    today,
  );

  // 자동 적립을 쓰면 정기외박은 주기마다 새로 쌓이고, 이월을 끄면 넘어가지 않는다.
  // 그래서 누적 총량이 아니라 "이번 주기 몫과 그 주기 안 사용량"만 보여준다.
  // 이월을 켜면 반대로 첫 적립일부터의 누적이 이 재원의 셈이 된다.
  const cycleBased = isRegularOvernightCycleBased(config);
  const carryOver = Boolean(config?.carryOver);
  const currentCycle = cycleFor(config, today);
  // 전역까지 앞으로 받을 주기 몫 — 지금 쓸 수는 없지만 보유한 휴가에는 들어간다.
  const cycles = regularOvernightSummary(
    config,
    regularSegments,
    cycleDischargeDate(user),
    today,
  );
  // 외출도 주기 재원이라 같은 셈을 갈래마다 한 벌씩 돌린다.
  const outingCycles = new Map(
    OUTING_KINDS.map((kind) => [
      kind,
      outingSummary(
        kind,
        outing[kind],
        outingSegments,
        cycleDischargeDate(user),
        today,
      ),
    ]),
  );

  const balances: LeaveBalanceItem[] = BALANCE_KEYS.map((key) => {
    const outingKind = outingKindOfBalanceKey(key);
    if (outingKind && isOutingCycleBased(outing[outingKind])) {
      // 정기외박과 같은 규칙이다 — 주기에서 파생하므로 적립분 셈을 쓰지 않는다.
      // 다른 점은 차감 주기 선택이 없다는 것뿐이라(외출은 하루) 여기서는
      // 이번 주기 / 이월 누적을 고르는 갈래만 남는다.
      const summary = outingCycles.get(outingKind)!;
      const carry = Boolean(outing[outingKind]?.carryOver);
      const currentOutingCycle = cycleFor(outing[outingKind], today);
      const pooled = summary.list.filter((cycle) => cycle.state !== "future");
      const sumOf = (pick: (cycle: (typeof pooled)[number]) => number) =>
        pooled.reduce((total, cycle) => total + pick(cycle), 0);

      const grantDays = carry
        ? sumOf((cycle) => cycle.grantDays)
        : (currentOutingCycle?.grantDays ?? 0);
      const usedDays = carry
        ? sumOf((cycle) => cycle.usedDays)
        : currentOutingCycle
          ? outingUsedDays(outingKind, currentOutingCycle, outingSegments)
          : 0;
      const usedToDateDays = carry
        ? sumOf((cycle) => cycle.usedToDateDays)
        : currentOutingCycle
          ? outingUsedDays(
              outingKind,
              currentOutingCycle,
              clipSegmentsTo(outingSegments, today),
            )
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
        expiredDays: 0,
        upcomingDays: summary.totals.upcomingDays,
        upcomingAsOfTodayDays: summary.totals.upcomingAsOfTodayDays,
        unattributedDays: 0,
        grantCount: 0,
        expiringSoonDays: 0,
      };
    }
    if (key === "regular_overnight" && cycleBased) {
      // 이월 중이면 아직 오지 않은 주기만 빼고 전부 합친다. 아래 파생 필드
      // (잔여·계획·자동 적립)는 이 셋에서만 나오므로 여기만 갈라 놓으면 된다.
      const pooled = cycles.list.filter((cycle) => cycle.state !== "future");
      const sumOf = (pick: (cycle: (typeof pooled)[number]) => number) =>
        pooled.reduce((total, cycle) => total + pick(cycle), 0);

      const grantDays = carryOver
        ? sumOf((cycle) => cycle.grantDays)
        : (currentCycle?.grantDays ?? 0);
      const usedDays = carryOver
        ? sumOf((cycle) => cycle.usedDays)
        : currentCycle
          ? cycleUsedDays(currentCycle, regularSegments)
          : 0;
      // 이번 주기 안에서도 아직 다녀오지 않은 계획은 "쓴 것"에 넣지 않는다.
      const usedToDateDays = carryOver
        ? sumOf((cycle) => cycle.usedToDateDays)
        : currentCycle
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
          intervalMonths: config.intervalMonths,
          daysPerGrant: config.daysPerGrant,
          // 설정에서 파생하는 표시용 값 — 저장하지 않는다.
          nextGrantDate: nextGrantDateAfter(config, todayInSeoul()),
          carryOver: config.carryOver,
        }
      : {
          enabled: false,
          startDate: null,
          intervalDays: null,
          intervalMonths: null,
          daysPerGrant: null,
          nextGrantDate: null,
          carryOver: false,
        },
    outing: OUTING_KINDS.map((kind) =>
      serializeOutingConfig(kind, outing[kind], today),
    ),
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
  const { grantRows, segments, config, outing } = await loadAllocationInputs(
    db,
    user.id,
  );
  const allocations = allocateAllGrants(
    grantRows.map(toLeaveGrant),
    segments,
    todayInSeoul(),
  );

  // 주기에서 파생하는 재원은 사용자가 총량을 정할 수 없다. 클라이언트가 전체 재원을
  // 한 번에 보내므로 거절하는 대신 그 항목만 건너뛴다.
  const editable = (Object.entries(totals) as [BalanceKey, number][]).filter(
    ([key]) => !isCycleScoped(key, config, outing),
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

  // 한 요청이 여러 재원을 한꺼번에 보내므로 변경도 여러 건이 된다. 문장마다 await 하면
  // 왕복이 그만큼 늘고, 무엇보다 중간에 실패하면 일부 재원만 바뀐 상태로 남는다.
  // batch는 한 왕복이자 한 트랜잭션이라 둘 다 해결된다.
  const now = new Date().toISOString();
  const statements: BatchItem[] = [];
  for (const { key, plan } of plans) {
    for (const mutation of plan.mutations) {
      if (mutation.kind === "create") {
        statements.push(
          db.insert(leaveGrants).values({
            id: crypto.randomUUID(),
            userId: user.id,
            balanceKey: key,
            days: mutation.days,
            grantedOn: null,
            expiresOn: null,
            note: null,
            createdAt: now,
            updatedAt: now,
          }),
        );
      } else if (mutation.kind === "update") {
        statements.push(
          db
            .update(leaveGrants)
            .set({ days: mutation.days, updatedAt: now })
            .where(
              and(
                eq(leaveGrants.id, mutation.id),
                eq(leaveGrants.userId, user.id),
              ),
            ),
        );
      } else {
        statements.push(
          db
            .delete(leaveGrants)
            .where(
              and(
                eq(leaveGrants.id, mutation.id),
                eq(leaveGrants.userId, user.id),
              ),
            ),
        );
      }
    }
  }
  await runBatch(db, statements);
  return getLeaveBalanceSummary(db, user);
}

export async function saveRegularOvernightConfig(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  input: RegularOvernightConfigInput,
) {
  // 군종별 제한은 두지 않는다. 육군도 분기마다 정기외박을 운영하고(2012.12 개정),
  // 주기 길이와 회당 일수는 어차피 부대마다 달라 사용자가 고치는 값이다.
  //
  // 다만 **주기 수는 막는다.** 주기 시작일에 하한이 없어서 "1900-01-01 + 1일 주기"가
  // 스키마를 통과하는데, 그러면 주기가 4만 개가 되어 `cyclesInRange`의 상한이 조용히
  // 걸린다. 그 순간 이월 누적 잔여와 보유 휴가의 주기 목록이 실제보다 몇십 배 작아진
  // 채로 화면에 나가고, 사용자는 어디서 틀렸는지 알 방법이 없다. 여기서 거절해
  // 그 상태가 저장되지 못하게 한다.
  if (input.enabled) {
    const cycles = regularOvernightCycleCount(
      {
        enabled: true,
        startDate: input.startDate,
        intervalDays: input.intervalDays ?? null,
        intervalMonths: input.intervalMonths ?? null,
        daysPerGrant: input.daysPerGrant,
        carryOver: input.carryOver ?? false,
      },
      cycleDischargeDate(user),
    );
    if (cycles > MAX_REGULAR_OVERNIGHT_CYCLES) {
      throw new LeaveRuleError(
        `이 설정은 전역일까지 주기를 ${cycles}개 만듭니다. 주기 시작일을 복무 기간 안으로 옮기거나 주기를 길게 잡아주세요 (최대 ${MAX_REGULAR_OVERNIGHT_CYCLES}개).`,
      );
    }
  }
  const now = new Date().toISOString();
  const values: typeof regularOvernightConfigs.$inferInsert = input.enabled
    ? {
        userId: user.id,
        enabled: true,
        startDate: input.startDate,
        // 스키마가 둘 중 하나만 통과시키므로 나머지 한쪽은 반드시 비워 둔다 —
        // 남겨 두면 다음 저장에서 두 단위가 섞인 행이 된다.
        intervalDays: input.intervalDays ?? null,
        intervalMonths: input.intervalMonths ?? null,
        daysPerGrant: input.daysPerGrant,
        // 구버전 앱은 이 값을 보내지 않는다. 화면에 없는 스위치를 켠 채로 두면
        // "껐는데 안 꺼진다"가 되므로, 보내지 않으면 꺼진 것으로 저장한다.
        carryOver: input.carryOver ?? false,
        updatedAt: now,
      }
    : {
        userId: user.id,
        enabled: false,
        startDate: null,
        intervalDays: null,
        intervalMonths: null,
        daysPerGrant: null,
        carryOver: false,
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
 * 외출 자동 적립 설정을 갈래 하나만 저장한다.
 *
 * 주기 수 상한을 여기서도 막는 이유는 `saveRegularOvernightConfig`와 같다 — 주기
 * 시작일에 하한이 없어 "1900-01-01 + 1일 주기"가 스키마를 통과하고, 그러면
 * `cyclesInRange`의 상한이 조용히 걸려 잔여가 실제보다 몇십 배 작아진 채 나간다.
 */
export async function saveOutingConfig(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  input: OutingConfigInput,
) {
  if (input.enabled) {
    const cycles = leaveCycleCount(
      {
        enabled: true,
        startDate: input.startDate,
        intervalDays: input.intervalDays ?? null,
        intervalMonths: input.intervalMonths ?? null,
        daysPerGrant: input.daysPerGrant,
        carryOver: input.carryOver ?? false,
      },
      cycleDischargeDate(user),
    );
    if (cycles > MAX_LEAVE_CYCLES) {
      throw new LeaveRuleError(
        `이 설정은 전역일까지 주기를 ${cycles}개 만듭니다. 주기 시작일을 복무 기간 안으로 옮기거나 주기를 길게 잡아주세요 (최대 ${MAX_LEAVE_CYCLES}개).`,
      );
    }
  }
  const now = new Date().toISOString();
  const values: typeof outingConfigs.$inferInsert = input.enabled
    ? {
        userId: user.id,
        kind: input.kind,
        enabled: true,
        startDate: input.startDate,
        // 스키마가 둘 중 하나만 통과시키므로 나머지 한쪽은 반드시 비워 둔다 —
        // 남겨 두면 다음 저장에서 두 단위가 섞인 행이 된다.
        intervalDays: input.intervalDays ?? null,
        intervalMonths: input.intervalMonths ?? null,
        daysPerGrant: input.daysPerGrant,
        carryOver: input.carryOver ?? false,
        updatedAt: now,
      }
    : {
        userId: user.id,
        kind: input.kind,
        enabled: false,
        startDate: null,
        intervalDays: null,
        intervalMonths: null,
        daysPerGrant: null,
        carryOver: false,
        updatedAt: now,
      };
  await db
    .insert(outingConfigs)
    .values(values)
    .onConflictDoUpdate({
      target: [outingConfigs.userId, outingConfigs.kind],
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
function assertRegularOvernightAvailable(
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  config: RegularOvernightConfigRow | undefined,
  requested: SegmentLike[],
  /** 이번 저장으로 사라질 휴가의 구간은 이미 빠져 있어야 한다 — 자기 자신과 부딪히면 안 된다. */
  existing: readonly SegmentLike[],
) {
  const block = checkRegularOvernight({
    config,
    existing,
    requested,
    dischargeAt: cycleDischargeDate(user),
  });
  if (block) throw new LeaveRuleError(regularOvernightBlockMessage(block));
}

/**
 * 외출도 주기마다 따로 쌓이므로 재원 총합이 아니라 갈래별 주기로 따진다.
 * 정기외박과 달리 구간이 하루라 차감 주기를 고를 일이 없다(outing.ts 머리말).
 */
function assertOutingAvailable(
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  outing: OutingConfigMap,
  kind: OutingKind,
  requested: SegmentLike[],
  /** 이번 저장으로 사라질 휴가의 구간은 이미 빠져 있어야 한다. */
  existing: readonly SegmentLike[],
) {
  const block = checkOuting({
    kind,
    config: outing[kind],
    existing,
    requested,
    dischargeAt: cycleDischargeDate(user),
  });
  if (block) throw new LeaveRuleError(outingBlockMessage(kind, block));
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
  const {
    grantRows,
    segments: storedSegments,
    config,
    outing,
  } = await loadAllocationInputs(db, user.id);

  // 이번 저장으로 사라지거나 교체될 휴가의 구간을 뺀다. 예전에는 이 제외를
  // `NOT IN (...)`으로 SQL에 넣었는데, 흡수 대상이 100건을 넘으면 바인드 파라미터
  // 상한에 걸려 저장이 통째로 죽었다. 한 사용자의 구간은 메모리에서 걸러도 싸다.
  const replacing = new Set(replacingLeaveIds);
  const allSegments = replacing.size
    ? storedSegments.filter((segment) => !replacing.has(segment.leaveId))
    : storedSegments;

  const today = todayInSeoul();
  const grants = grantRows.map(toLeaveGrant);
  const before = allocateAllGrants(grants, allSegments, today);
  const after = allocateAllGrants(grants, [...allSegments, ...segments], today);
  const cycleBased = isRegularOvernightCycleBased(config);

  // 구버전 클라이언트도 한 주기만 겹치는 구간은 그대로 저장할 수 있다. 여러 주기와
  // 겹치면 공용 판정이 선택을 요구하며, 임의로 어느 주기를 차감하지 않는다.
  if (cycleBased) {
    for (const segment of segments) {
      if (
        segment.category !== "overnight" ||
        segment.overnightKind !== "regular" ||
        segment.regularOvernightCycleStart
      ) {
        continue;
      }
      const candidates = eligibleRegularOvernightCycles(
        config,
        segment.startDate,
        segment.endDate,
        cycleDischargeDate(user),
      );
      if (candidates.length === 1) {
        segment.regularOvernightCycleStart = candidates[0]!.start;
      }
    }
  }

  const requested = new Set(
    segments.map((segment) => segmentBalanceKey(segment)),
  );
  for (const key of requested) {
    // 주기 단위 재원은 총합이 아니라 주기별로 따로 확인한다.
    if (isCycleScoped(key, config, outing)) continue;
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
    assertRegularOvernightAvailable(
      user,
      config,
      segments,
      onlyRegularOvernight(allSegments),
    );
  }

  for (const kind of OUTING_KINDS) {
    if (!requested.has(outingBalanceKey(kind))) continue;
    if (!isOutingCycleBased(outing[kind])) continue;
    assertOutingAvailable(
      user,
      outing,
      kind,
      segments,
      onlyOuting(allSegments),
    );
  }
}

function segmentRowsFor(leaveId: string, segments: LeaveSegment[]) {
  return segments.map((segment) => ({
    id: crypto.randomUUID(),
    leaveId,
    category: segment.category,
    overnightKind: segment.overnightKind ?? null,
    outingKind: segment.outingKind ?? null,
    startDate: segment.startDate,
    endDate: segment.endDate,
    days: segment.days,
    regularOvernightCycleStart: segment.regularOvernightCycleStart ?? null,
  }));
}

/**
 * 구간을 저장하는 INSERT 문들. 한 문장에 몰아넣지 않는 이유가 있다.
 *
 * 휴가 한 건은 구간을 30개까지 가질 수 있는데(스키마 상한), 한 행이 컬럼 7개를
 * 바인드하므로 15개부터 D1의 100개 상한을 넘겨 저장이 500으로 죽었다. 문장 단위
 * 상한이라 나눠 담으면 된다 — 호출자가 같은 batch에 넣으면 왕복도 하나고
 * 원자성도 그대로다.
 */
export function segmentInsertStatements(
  db: Db,
  leaveId: string,
  segments: LeaveSegment[],
): BatchItem[] {
  return insertStatements(db, leaveSegments, segmentRowsFor(leaveId, segments));
}

/** 주어진 휴가들의 구간을 지우는 DELETE 문들(id 목록도 상한을 넘을 수 있다). */
export function deleteSegmentsOfStatements(
  db: Db,
  leaveIds: readonly string[],
): BatchItem[] {
  return chunkForParams(leaveIds, 1).map((ids) =>
    db.delete(leaveSegments).where(inArray(leaveSegments.leaveId, ids)),
  );
}

/** 구간 조회가 돌려주는 행 — 응답 조립에 필요한 컬럼만. */
type SegmentPick = {
  leaveId: string;
  category: LeaveSegment["category"];
  overnightKind: LeaveSegmentRow["overnightKind"];
  outingKind: LeaveSegmentRow["outingKind"];
  startDate: string;
  endDate: string;
  days: number;
  regularOvernightCycleStart: string | null;
};

/** 구간 행들을 leaveId별 Map으로 접는다. */
export function foldSegmentRows(rows: readonly SegmentPick[]) {
  const result = new Map<string, LeaveSegment[]>();
  for (const row of rows) {
    const values = result.get(row.leaveId) ?? [];
    values.push({
      category: row.category,
      ...(row.overnightKind ? { overnightKind: row.overnightKind } : {}),
      ...(row.outingKind ? { outingKind: row.outingKind } : {}),
      startDate: row.startDate,
      endDate: row.endDate,
      days: row.days,
      ...(row.regularOvernightCycleStart
        ? { regularOvernightCycleStart: row.regularOvernightCycleStart }
        : {}),
    });
    result.set(row.leaveId, values);
  }
  return result;
}

/** 구간 조회에서 쓰는 공통 투영 — 응답에 필요한 컬럼만 읽는다. */
const segmentColumns = {
  leaveId: leaveSegments.leaveId,
  category: leaveSegments.category,
  overnightKind: leaveSegments.overnightKind,
  outingKind: leaveSegments.outingKind,
  startDate: leaveSegments.startDate,
  endDate: leaveSegments.endDate,
  days: leaveSegments.days,
  regularOvernightCycleStart: leaveSegments.regularOvernightCycleStart,
} as const;

export async function segmentsForLeaves(db: Db, leaveIds: string[]) {
  if (!leaveIds.length) return new Map<string, LeaveSegment[]>();
  const rows: SegmentPick[] = [];
  for (const chunk of chunkForParams(leaveIds, 1)) {
    rows.push(
      ...(await db
        .select(segmentColumns)
        .from(leaveSegments)
        .where(inArray(leaveSegments.leaveId, chunk))
        .orderBy(asc(leaveSegments.startDate))
        .all()),
    );
  }
  return foldSegmentRows(rows);
}

/**
 * 한 사용자의 휴가 구간 전부를 휴가 조인으로 한 번에 읽는다.
 *
 * 예전에는 휴가 id 목록을 먼저 뽑아 IN(...)에 넣었다. 왕복이 한 번 더 들고,
 * 휴가가 100건을 넘으면 바인드 파라미터 상한에 걸려 요청이 죽었다.
 */
export function segmentsOfUserQuery(
  db: Db,
  userId: string,
  options: { status?: LeaveRow["status"]; excludeLeaveId?: string } = {},
) {
  return db
    .select(segmentColumns)
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .where(
      and(
        eq(leaves.userId, userId),
        ...(options.status ? [eq(leaves.status, options.status)] : []),
        ...(options.excludeLeaveId
          ? [ne(leaves.id, options.excludeLeaveId)]
          : []),
      ),
    )
    .orderBy(asc(leaveSegments.startDate));
}

/** 위 조회를 바로 실행해 leaveId별 Map으로 돌려준다. */
export async function segmentsOfUser(
  db: Db,
  userId: string,
  options: { status?: LeaveRow["status"]; excludeLeaveId?: string } = {},
) {
  return foldSegmentRows(await segmentsOfUserQuery(db, userId, options).all());
}

/**
 * 한 부대의 특정 기간에 걸친 휴가 구간을 조인으로 읽는다(달력용).
 * 집계에 들어가는 상태이거나 조회자 본인 것만 — 남의 초안 구간은 읽지 않는다.
 */
export async function segmentsOfUnitDuring(
  db: Db,
  input: { unitId: string; start: string; end: string; viewerId: string },
) {
  const rows = await db
    .select(segmentColumns)
    .from(leaveSegments)
    .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
    .innerJoin(users, eq(leaves.userId, users.id))
    .where(
      and(
        eq(users.unitId, input.unitId),
        lte(leaves.startDate, input.end),
        gte(leaves.endDate, input.start),
        or(
          inArray(leaves.status, [...COUNTED_LEAVE_STATUSES]),
          eq(leaves.userId, input.viewerId),
        ),
      ),
    )
    .orderBy(asc(leaveSegments.startDate))
    .all();
  return foldSegmentRows(rows);
}
