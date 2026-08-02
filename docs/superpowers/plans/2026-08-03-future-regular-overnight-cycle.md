# 미래 정기외박 주기 미리 쓰기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아직 도래하지 않은 정기외박 주기의 날짜로도 그 주기 몫 안에서 휴가를 등록할 수 있게 한다.

**Architecture:** 서버는 이미 주기별로 검증하고 있으므로 실제로 막는 쪽은 폼이다. 서버가 갖고 있던 주기 검증 규칙을 `packages/shared`의 순수 함수로 끌어내 앱·웹·서버가 같은 함수를 쓰게 하고, 거기에 "적립일이 전역일 뒤인 주기는 못 쓴다"는 상한을 새로 넣는다. API 응답 스키마는 바꾸지 않는다 — 폼은 이미 주기 설정·내 휴가·전역일을 모두 갖고 있다.

**Tech Stack:** TypeScript, pnpm workspace + turbo, vitest(shared 단위 테스트), node:test + wrangler dev(API 통합 테스트), React(web), React Native/Expo(native), Hono + Drizzle + D1(api)

## Global Constraints

- 설계 문서: `docs/superpowers/specs/2026-08-03-future-regular-overnight-cycle-design.md`
- 주석과 사용자 문구는 한국어로 쓴다. 기존 파일의 주석 밀도와 어투를 따른다.
- API 요청·응답 스키마는 바꾸지 않는다. 구버전 앱이 그대로 동작해야 한다.
- 전역일 상한 규칙: 주기의 적립일이 전역일보다 **뒤**일 때만 막는다 — `cycle.start > dischargeAt`. `cycle.start === dischargeAt`은 허용한다. 이건 `apps/api/src/lib/leave-grants.ts`의 `buildCycleList`가 "보유 휴가"에서 주기를 세는 기준과 같다.
- 주기 계산에 쓰는 전역일은 항상 `normalizeLegacyDischargeDate(enlistedAt, branch, dischargeAt)`를 거친 값이다. 폼은 `/auth/me`에서 이미 정규화된 값을 받는다(`apps/api/src/lib/serialize.ts`).
- 관리자 앱(`apps/admin/src/components/RecordForm.tsx`)은 잔여 검사를 하지 않으므로 손대지 않는다.
- 커밋 메시지는 한국어, `feat:`/`fix:`/`test:`/`refactor:` 접두어를 쓴다(기존 히스토리와 동일).

---

### Task 1: 공용 주기 검증 함수 `checkRegularOvernight`

서버 `assertRegularOvernightAvailable` 안에 있던 규칙을 순수 함수로 끌어내고 전역일 상한을 더한다.

**Files:**
- Modify: `packages/shared/src/regular-overnight.ts` (파일 끝에 추가)
- Test: `packages/shared/test/regular-overnight.test.ts` (파일 끝에 `describe` 추가)

**Interfaces:**
- Consumes: 같은 파일에 이미 있는 `activeConfig`, `firstGrantOf`, `cycleFor`, `cyclesInRange`, `cycleRemainingDays`, `regularOvernightUsageByCycle`, 타입 `RegularOvernightConfig`, `RegularOvernightCycle`, `SegmentLike`. `./calendar`의 `fmtDateShort`, `fmtRangeTiny`. `./dates`의 `ISODate`.
- Produces:
  - `type RegularOvernightBlock = { kind: "before_first_grant"; firstGrantDate: ISODate } | { kind: "after_discharge"; cycle: RegularOvernightCycle } | { kind: "over_cycle"; cycle: RegularOvernightCycle; usedDays: number }`
  - `checkRegularOvernight(input: { config: RegularOvernightConfig | null | undefined; existing: readonly SegmentLike[]; requested: readonly SegmentLike[]; dischargeAt: ISODate }): RegularOvernightBlock | null`
  - `regularOvernightBlockMessage(block: RegularOvernightBlock): string`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/test/regular-overnight.test.ts` 맨 위 import 목록에 `checkRegularOvernight`, `regularOvernightBlockMessage`, `type SegmentLike`를 더한다(기존 import 블록은 `from "../src"` 하나뿐이니 거기에 알파벳 순서 맞춰 끼워 넣는다). 그리고 파일 끝에 아래를 붙인다.

파일 위쪽에 이미 있는 `config`(주기 시작일 `2026-03-30`, 주기 42일, 회당 4일 → 첫 적립 `2026-05-11`, 1주기 `2026-05-11~2026-06-21`, 2주기 `2026-06-22~2026-08-02`, 3주기 `2026-08-03~2026-09-13`)를 그대로 쓴다.

```ts
describe("정기외박 사용 가능 여부", () => {
  const discharge = "2027-06-30";
  const regular = (startDate: string, endDate: string): SegmentLike => ({
    category: "overnight",
    overnightKind: "regular",
    startDate,
    endDate,
  });

  it("설정이 꺼져 있으면 주기로 막지 않는다", () => {
    expect(
      checkRegularOvernight({
        config: { ...config, enabled: false },
        existing: [],
        requested: [regular("2026-08-05", "2026-08-06")],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });

  it("아직 오지 않은 주기라도 그 주기 몫 안이면 쓸 수 있다", () => {
    // 3주기(2026-08-03~09-13)를 오늘보다 한참 뒤로 두고 4일 중 3일만 쓴다.
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [regular("2026-08-20", "2026-08-22")],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });

  it("미래 주기라도 그 주기 몫을 넘기면 막는다", () => {
    const block = checkRegularOvernight({
      config,
      existing: [regular("2026-08-05", "2026-08-07")],
      requested: [regular("2026-08-20", "2026-08-21")],
      dischargeAt: discharge,
    });
    expect(block).toEqual({
      kind: "over_cycle",
      cycle: {
        index: 3,
        start: "2026-08-03",
        end: "2026-09-13",
        grantDays: 4,
      },
      usedDays: 5,
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "정기외박 3주기(8/3–9/13) 몫 4일을 1일 초과했어요",
    );
  });

  it("다른 주기의 사용량은 섞지 않는다", () => {
    // 2주기를 꽉 채워도 3주기 몫은 그대로다.
    expect(
      checkRegularOvernight({
        config,
        existing: [regular("2026-06-22", "2026-06-25")],
        requested: [regular("2026-08-20", "2026-08-23")],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });

  it("첫 적립 전 날짜는 막는다", () => {
    const block = checkRegularOvernight({
      config,
      existing: [],
      requested: [regular("2026-05-09", "2026-05-10")],
      dischargeAt: discharge,
    });
    expect(block).toEqual({
      kind: "before_first_grant",
      firstGrantDate: "2026-05-11",
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "정기외박은 첫 적립일(5월 11일) 이후부터 사용할 수 있습니다",
    );
  });

  it("적립일이 전역일 뒤인 주기는 막는다", () => {
    // 4주기는 2026-09-14에 적립된다. 전역이 그 전이면 그 몫을 받지 못한다.
    const block = checkRegularOvernight({
      config,
      existing: [],
      requested: [regular("2026-09-20", "2026-09-21")],
      dischargeAt: "2026-09-13",
    });
    expect(block).toEqual({
      kind: "after_discharge",
      cycle: {
        index: 4,
        start: "2026-09-14",
        end: "2026-10-25",
        grantDays: 4,
      },
    });
    expect(regularOvernightBlockMessage(block!)).toBe(
      "정기외박 4주기(9/14–10/25)는 적립일이 전역일 뒤라 쓸 수 없어요",
    );
  });

  it("적립일이 전역일 당일인 주기는 쓸 수 있다", () => {
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [regular("2026-09-20", "2026-09-21")],
        dischargeAt: "2026-09-14",
      }),
    ).toBe(null);
  });

  it("정기외박이 아닌 구간은 보지 않는다", () => {
    expect(
      checkRegularOvernight({
        config,
        existing: [],
        requested: [
          { category: "annual", startDate: "2026-05-09", endDate: "2026-05-10" },
        ],
        dischargeAt: discharge,
      }),
    ).toBe(null);
  });
});
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `pnpm --filter @leave/shared exec vitest run test/regular-overnight.test.ts`
Expected: FAIL — `checkRegularOvernight is not a function` 또는 import 해석 실패.

- [ ] **Step 3: 최소 구현을 넣는다**

`packages/shared/src/regular-overnight.ts` 파일 맨 위 import에 `fmtDateShort`, `fmtRangeTiny`를 더한다:

```ts
import { fmtDateShort, fmtRangeTiny } from "./calendar";
```

(`calendar.ts`는 `dates.ts`만 가져다 쓰므로 순환 참조가 생기지 않는다.)

파일 끝에 아래를 붙인다:

```ts
/** 정기외박을 쓸 수 없는 이유. 없으면 null이 온다. */
export type RegularOvernightBlock =
  /** 첫 적립 전이라 아직 받은 몫이 없다. */
  | { kind: "before_first_grant"; firstGrantDate: ISODate }
  /** 적립일이 전역일 뒤라 그 주기 몫을 애초에 받지 못한다. */
  | { kind: "after_discharge"; cycle: RegularOvernightCycle }
  /** 그 주기 몫보다 많이 쓴다. usedDays는 이미 쓴 것까지 더한 값. */
  | { kind: "over_cycle"; cycle: RegularOvernightCycle; usedDays: number };

/**
 * 요청한 구간을 정기외박으로 쓸 수 있는지 본다. 막을 이유가 있으면 첫 번째 이유를,
 * 없으면 null을 돌려준다. 앱·웹 폼과 서버가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
 *
 * 판정은 오늘이 아니라 "그 날짜가 속한 주기" 기준이라, 아직 오지 않은 주기라도
 * 그 몫 안이면 미리 쓸 수 있다. 대신 적립일이 전역 뒤인 주기는 받지 못하므로 막는다.
 *
 * existing은 이미 저장된 구간이다. 수정이라면 부르는 쪽이 그 휴가의 구간을 빼서 넘긴다.
 * 요청이 건드리지 않은 주기는 보지 않는다 — 이미 어긋나 있는 과거를 새 등록의 이유로
 * 삼지 않는다.
 */
export function checkRegularOvernight(input: {
  config: RegularOvernightConfig | null | undefined;
  existing: readonly SegmentLike[];
  requested: readonly SegmentLike[];
  dischargeAt: ISODate;
}): RegularOvernightBlock | null {
  const active = activeConfig(input.config);
  // 자동 적립을 안 쓰면 정기외박도 여느 재원처럼 적립분으로 따진다 — 여기서 막지 않는다.
  if (!active) return null;

  const requestedUsage = regularOvernightUsageByCycle(
    input.config,
    input.requested,
  );
  if (requestedUsage.beforeFirstGrantDays > 0) {
    return { kind: "before_first_grant", firstGrantDate: firstGrantOf(active) };
  }
  if (!requestedUsage.cycles.length) return null;

  for (const { cycle } of requestedUsage.cycles) {
    if (cycle.start > input.dischargeAt) {
      return { kind: "after_discharge", cycle };
    }
  }

  // 이미 저장된 구간에 이번 요청을 더해 주기별 사용량을 다시 센다.
  const after = regularOvernightUsageByCycle(input.config, [
    ...input.existing,
    ...input.requested,
  ]);
  const usedByCycleStart = new Map(
    after.cycles.map((entry) => [entry.cycle.start, entry.usedDays]),
  );
  for (const { cycle } of requestedUsage.cycles) {
    const usedDays = usedByCycleStart.get(cycle.start) ?? 0;
    if (usedDays > cycle.grantDays) {
      return { kind: "over_cycle", cycle, usedDays };
    }
  }
  return null;
}

/** 막힌 이유를 사용자에게 보여줄 한 문장으로. 서버 오류와 폼 오류가 같은 문구를 쓴다. */
export function regularOvernightBlockMessage(
  block: RegularOvernightBlock,
): string {
  if (block.kind === "before_first_grant") {
    return `정기외박은 첫 적립일(${fmtDateShort(block.firstGrantDate)}) 이후부터 사용할 수 있습니다`;
  }
  const { cycle } = block;
  const label = `정기외박 ${cycle.index}주기(${fmtRangeTiny(cycle.start, cycle.end)})`;
  if (block.kind === "after_discharge") {
    return `${label}는 적립일이 전역일 뒤라 쓸 수 없어요`;
  }
  return `${label} 몫 ${cycle.grantDays}일을 ${block.usedDays - cycle.grantDays}일 초과했어요`;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @leave/shared exec vitest run test/regular-overnight.test.ts`
Expected: PASS — 새로 넣은 8개를 포함해 전부 통과.

- [ ] **Step 5: 타입 검사**

Run: `pnpm --filter @leave/shared check-types`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/regular-overnight.ts packages/shared/test/regular-overnight.test.ts
git commit -m "feat: 정기외박 주기 검증을 공용 순수 함수로 빼고 전역일 상한을 넣는다"
```

---

### Task 2: 구간 범위별 잔여 계산 `regularOvernightAvailableIn`

폼의 재원 칩이 "이 구간 날짜 기준 잔여"를 보여주려면 범위를 받아 주기별 잔여의 최솟값을 주는 함수가 필요하다.

**Files:**
- Modify: `packages/shared/src/regular-overnight.ts` (Task 1에서 붙인 내용 뒤)
- Test: `packages/shared/test/regular-overnight.test.ts` (Task 1의 `describe` 뒤)

**Interfaces:**
- Consumes: Task 1이 쓰는 것과 같은 내부 함수들 + `cyclesInRange`, `cycleRemainingDays`, `firstGrantOf`, `activeConfig`.
- Produces: `regularOvernightAvailableIn(input: { config: RegularOvernightConfig | null | undefined; used: readonly SegmentLike[]; dischargeAt: ISODate; from: ISODate; to: ISODate }): number`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

import 목록에 `regularOvernightAvailableIn`을 더하고, Task 1의 `describe` 뒤에 붙인다.

```ts
describe("구간 범위 기준 정기외박 잔여", () => {
  const discharge = "2027-06-30";
  const regular = (startDate: string, endDate: string): SegmentLike => ({
    category: "overnight",
    overnightKind: "regular",
    startDate,
    endDate,
  });

  it("아직 오지 않은 주기의 잔여도 그대로 준다", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(4);
  });

  it("그 주기에 이미 쓴 만큼 뺀다", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [regular("2026-08-05", "2026-08-07")],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(1);
  });

  it("여러 주기에 걸치면 가장 빡빡한 주기를 따른다", () => {
    // 2주기는 3일 썼고(잔여 1) 3주기는 안 썼다(잔여 4). 경계를 걸치면 1.
    expect(
      regularOvernightAvailableIn({
        config,
        used: [regular("2026-06-22", "2026-06-24")],
        dischargeAt: discharge,
        from: "2026-08-01",
        to: "2026-08-05",
      }),
    ).toBe(1);
  });

  it("초과 상태면 음수를 준다 — 칩 숫자와 오류가 어긋나지 않도록", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [regular("2026-08-05", "2026-08-09")],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(-1);
  });

  it("첫 적립 전이 끼거나 주기가 없으면 0", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: discharge,
        from: "2026-05-09",
        to: "2026-05-12",
      }),
    ).toBe(0);
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: discharge,
        from: "2026-04-01",
        to: "2026-04-02",
      }),
    ).toBe(0);
  });

  it("적립일이 전역일 뒤인 주기가 끼면 0", () => {
    expect(
      regularOvernightAvailableIn({
        config,
        used: [],
        dischargeAt: "2026-09-13",
        from: "2026-09-20",
        to: "2026-09-21",
      }),
    ).toBe(0);
  });

  it("설정이 꺼져 있으면 0", () => {
    expect(
      regularOvernightAvailableIn({
        config: { ...config, enabled: false },
        used: [],
        dischargeAt: discharge,
        from: "2026-08-20",
        to: "2026-08-21",
      }),
    ).toBe(0);
  });
});
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `pnpm --filter @leave/shared exec vitest run test/regular-overnight.test.ts`
Expected: FAIL — `regularOvernightAvailableIn is not a function`.

- [ ] **Step 3: 최소 구현을 넣는다**

`packages/shared/src/regular-overnight.ts` 끝에 붙인다:

```ts
/**
 * [from, to]가 걸친 주기들 기준으로 쓸 수 있는 정기외박 일수. 여러 주기에 걸치면
 * 가장 빡빡한 주기를 따른다(그 주기가 먼저 막히므로).
 *
 * 폼의 재원 칩 숫자에 쓴다. 초과분은 음수로 그대로 내보내서 "칩 숫자 < 0"과
 * checkRegularOvernight이 막는 순간이 어긋나지 않게 한다.
 * 쓸 수 있는 주기가 하나도 없으면(설정이 꺼졌거나, 첫 적립 전이 끼었거나,
 * 적립일이 전역 뒤인 주기가 끼었거나) 0.
 */
export function regularOvernightAvailableIn(input: {
  config: RegularOvernightConfig | null | undefined;
  used: readonly SegmentLike[];
  dischargeAt: ISODate;
  from: ISODate;
  to: ISODate;
}): number {
  const active = activeConfig(input.config);
  if (!active) return 0;
  // cyclesInRange는 첫 적립 전을 잘라내므로, 범위가 그 앞에서 시작하면 따로 막는다.
  if (input.from < firstGrantOf(active)) return 0;

  const cycles = cyclesInRange(input.config, input.from, input.to);
  if (!cycles.length) return 0;

  let available = Infinity;
  for (const cycle of cycles) {
    if (cycle.start > input.dischargeAt) return 0;
    const remaining = cycleRemainingDays(cycle, input.used);
    if (remaining < available) available = remaining;
  }
  return available;
}
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @leave/shared exec vitest run test/regular-overnight.test.ts`
Expected: PASS.

- [ ] **Step 5: 타입 검사**

Run: `pnpm --filter @leave/shared check-types`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/regular-overnight.ts packages/shared/test/regular-overnight.test.ts
git commit -m "feat: 구간 날짜가 속한 주기 기준으로 정기외박 잔여를 계산한다"
```

---

### Task 3: 서버가 공용 함수를 쓰고 전역일을 정규화한다

**Files:**
- Modify: `apps/api/src/lib/leave-grants.ts` (`User` 타입, `buildGrantsPage`, 새 `cycleDischargeDate` 헬퍼)
- Modify: `apps/api/src/lib/leave-balances.ts` (`getLeaveBalanceSummary`, `updateLeaveBalanceTotals`, `saveRegularOvernightConfig`, `assertRegularOvernightAvailable`, `assertSegmentsAvailable`)
- Test: `apps/api/test/leaves.test.mjs` (기존 정기외박 테스트 수정 + 새 테스트 추가)

**Interfaces:**
- Consumes: Task 1의 `checkRegularOvernight`, `regularOvernightBlockMessage`. 기존 `normalizeLegacyDischargeDate(enlistedAt, branch, dischargeAt)`(`@leave/shared`).
- Produces: `cycleDischargeDate(user: { enlistedAt: string; branch: Branch; dischargeAt: string }): string` — `apps/api/src/lib/leave-grants.ts`에서 export.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/api/test/leaves.test.mjs`에서 두 가지를 한다.

(1) 기존 테스트 `"해군·공군 정기외박은 주기 안에서만 쓰이고 이월되지 않는다"` 안의 초과 거절 단언을 새 문구에 맞춘다. 아래 줄을

```js
  assert.match(over.data.error, /주기.*3일보다 많이/);
```

이렇게 바꾼다:

```js
  assert.match(over.data.error, /주기.*몫 3일을 1일 초과/);
```

(2) 그 테스트 함수 바로 뒤에 새 테스트를 추가한다. `signup` 기본값은 육군이라 정기외박 설정이 거부되므로 `branch: "navy"`를 준다. 기본 `dischargeAt`은 `2027-07-04`이다.

```js
test("아직 오지 않은 정기외박 주기도 그 몫 안에서 미리 쓸 수 있다", async () => {
  const owner = await signup({ branch: "navy" });
  await createUnit(owner.token, { name: uniq("미래주기부대-") });
  const token = owner.token;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const shift = (from, days) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // 주기 시작일이 42일 전이면 첫 적립이 오늘이다. 1주기는 오늘~오늘+41,
  // 2주기는 오늘+42~오늘+83, 3주기는 오늘+84부터.
  const saved = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: shift(today, -42),
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });
  assert.equal(saved.status, 200);

  // 이번 주기 몫을 다 써도 다음 주기에는 영향이 없다.
  const thisCycle = await req("POST", "/leaves", {
    token,
    body: {
      title: "이번 주기",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: today,
          endDate: shift(today, 2),
        },
      ],
    },
  });
  assert.equal(thisCycle.status, 201);

  // 아직 오지 않은 2주기 날짜로 등록된다 — 이게 이번 변경의 핵심.
  const nextCycle = await req("POST", "/leaves", {
    token,
    body: {
      title: "다음 주기 미리 등록",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: shift(today, 50),
          endDate: shift(today, 52),
        },
      ],
    },
  });
  assert.equal(
    nextCycle.status,
    201,
    `미래 주기는 허용해야 함: ${JSON.stringify(nextCycle.data)}`,
  );

  // 그 미래 주기 몫을 넘기면 여전히 막는다.
  const tooMuch = await req("POST", "/leaves", {
    token,
    body: {
      title: "다음 주기 초과",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: shift(today, 60),
          endDate: shift(today, 60),
        },
      ],
    },
  });
  assert.equal(tooMuch.status, 400);
  assert.match(tooMuch.data.error, /몫 3일을 1일 초과/);
});

test("적립일이 전역일 뒤인 정기외박 주기는 미리 쓸 수 없다", async () => {
  // 전역이 2026-12-31이고 주기 시작일이 2026-01-01, 주기 42일이면
  // 첫 적립은 2026-02-12, 이후 42일마다. 2027년 날짜가 속한 주기는
  // 적립일이 전역 뒤라 몫을 받지 못한다.
  const owner = await signup({
    branch: "air_force",
    enlistedAt: "2026-01-05",
    dischargeAt: "2026-12-31",
  });
  await createUnit(owner.token, { name: uniq("전역후부대-") });
  const token = owner.token;

  const saved = await req("PUT", "/leaves/regular-overnight", {
    token,
    body: {
      enabled: true,
      startDate: "2026-01-01",
      intervalDays: 42,
      daysPerGrant: 3,
    },
  });
  assert.equal(saved.status, 200);

  const afterDischarge = await req("POST", "/leaves", {
    token,
    body: {
      title: "전역 후 주기",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2027-03-01",
          endDate: "2027-03-02",
        },
      ],
    },
  });
  assert.equal(afterDischarge.status, 400);
  assert.match(afterDischarge.data.error, /전역일 뒤/);
});
```

- [ ] **Step 2: 실패하는지 확인한다**

Run: `pnpm --filter @leave/api test`
Expected: FAIL — 기존 테스트는 문구가 안 맞아서(`/몫 3일을 1일 초과/` 불일치), 새 두 테스트는 전역일 상한이 없어서(전역 후 주기가 201로 통과) 깨진다. "미래 주기는 허용해야 함" 단언은 서버가 이미 허용하므로 통과할 수 있다 — 그건 회귀 방지용이다.

- [ ] **Step 3: `cycleDischargeDate` 헬퍼를 넣는다**

`apps/api/src/lib/leave-grants.ts`의 import 블록에서 `@leave/shared`에 `normalizeLegacyDischargeDate`를 더한다(알파벳 순서상 `nextGrantDateAfter` 앞).

같은 파일에서 `User` 타입에 `enlistedAt`을 더한다:

```ts
type User = {
  id: string;
  branch: Branch;
  enlistedAt: string;
  dischargeAt: string;
};
```

`toLeaveGrant` 위(파일 상단 `MAX_LISTED_CYCLES` 아래)에 헬퍼를 넣는다:

```ts
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
```

`buildGrantsPage` 안의 `regularOvernightSummary` 호출에서 `user.dischargeAt`을 `cycleDischargeDate(user)`로 바꾼다:

```ts
  const cycles = regularOvernightSummary(
    config,
    segments,
    cycleDischargeDate(user),
    today,
  );
```

- [ ] **Step 4: `leave-balances.ts`를 공용 함수로 갈아끼운다**

`apps/api/src/lib/leave-balances.ts`에서:

(a) `@leave/shared` import 목록을 손본다 — `checkRegularOvernight`, `regularOvernightBlockMessage`를 더하고, 더 이상 쓰지 않는 `firstGrantDate`, `fmtDateShort`(아래 (e) 확인 후), `regularOvernightUsageByCycle`을 뺀다. `fmtDateShort`는 `assertSegmentsAvailable`의 다른 오류 문구에서 계속 쓰므로 **남긴다**.

정리하면: `firstGrantDate`와 `regularOvernightUsageByCycle` 두 개를 빼고, `checkRegularOvernight`와 `regularOvernightBlockMessage` 두 개를 더한다.

(b) `../lib/leave-grants` import 목록에 `cycleDischargeDate`를 더한다:

```ts
import {
  cycleDischargeDate,
  listGrants,
  regularOvernightSummary,
  toLeaveGrant,
  userSegments,
} from "./leave-grants";
```

(c) 이 파일에 나오는 사용자 파라미터 타입 셋에 `enlistedAt: string`을 더한다. `getLeaveBalanceSummary`, `updateLeaveBalanceTotals`, `saveRegularOvernightConfig`는 모두 `user: { id: string; branch: Branch; dischargeAt: string }`인데 다음으로 바꾼다:

```ts
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
```

`assertSegmentsAvailable`은 `user: { id: string; branch: Branch }`인데 다음으로 바꾼다:

```ts
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
```

세 함수의 호출자는 모두 전체 사용자 행(`typeof users.$inferSelect`)을 넘기므로 호출 쪽은 고칠 게 없다.

(d) `getLeaveBalanceSummary` 안의 `regularOvernightSummary` 호출에서 `user.dischargeAt`을 `cycleDischargeDate(user)`로 바꾼다.

(e) `assertRegularOvernightAvailable`을 통째로 교체한다:

```ts
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
  replacingLeaveId?: string,
) {
  // 수정이면 교체될 휴가의 구간은 빼야 자기 자신과 부딪히지 않는다.
  const existing = await regularOvernightSegments(db, user.id, replacingLeaveId);
  const block = checkRegularOvernight({
    config,
    existing,
    requested,
    dischargeAt: cycleDischargeDate(user),
  });
  if (block) throw new Error(regularOvernightBlockMessage(block));
}
```

(f) `assertSegmentsAvailable` 끝의 호출을 새 시그니처에 맞춘다:

```ts
  if (cycleBased && requested.has("regular_overnight")) {
    await assertRegularOvernightAvailable(
      db,
      user,
      config,
      segments,
      replacingLeaveId,
    );
  }
```

- [ ] **Step 5: 타입 검사**

Run: `pnpm --filter @leave/api check-types`
Expected: 오류 없음. `firstGrantDate`/`regularOvernightUsageByCycle` 미사용 import가 남아 있으면 여기서 걸린다.

- [ ] **Step 6: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @leave/api test`
Expected: PASS — 기존 정기외박 테스트와 새 두 테스트 모두 통과.

- [ ] **Step 7: 커밋**

```bash
git add apps/api/src/lib/leave-grants.ts apps/api/src/lib/leave-balances.ts apps/api/test/leaves.test.mjs
git commit -m "refactor: 서버 정기외박 검증을 공용 함수로 옮기고 전역일 상한을 적용한다"
```

---

### Task 4: 앱 휴가 폼이 주기별로 따진다

**Files:**
- Modify: `apps/native/src/components/leave-form-modal.tsx`

**Interfaces:**
- Consumes: Task 1의 `checkRegularOvernight`, `regularOvernightBlockMessage`, Task 2의 `regularOvernightAvailableIn`. 기존 `isRegularOvernightCycleBased`, `balanceKeyToCategory`(`@leave/shared`). 기존 훅 `useMe()`, `useMyLeaves()`(`@/api/queries`).
- Produces: 없음(화면 변경).

- [ ] **Step 1: 훅과 주기 재료를 붙인다**

`@leave/shared` import 목록에 다음을 더한다: `balanceKeyToCategory`, `checkRegularOvernight`, `isRegularOvernightCycleBased`, `regularOvernightAvailableIn`, `regularOvernightBlockMessage`, `type SegmentLike`.

`@/api/queries` import 목록에 `useMe`, `useMyLeaves`를 더한다.

컴포넌트 안, `const balances = useLeaveBalances();` 바로 아래에 추가한다:

```ts
  const me = useMe();
  const myLeaves = useMyLeaves();
```

- [ ] **Step 2: 주기 판정에 쓸 값들을 만든다**

`availableByKey` `useMemo` 바로 앞(즉 `remainingByKey` 다음)에 넣는다:

```ts
  const regularConfig = balances.data?.regularOvernight ?? null;
  const cycleBased = isRegularOvernightCycleBased(regularConfig);
  const dischargeAt = me.data?.dischargeAt ?? "";

  // 이미 저장된 내 정기외박 구간. 수정 중이면 그 휴가 몫은 빼야 자기 자신과 부딪히지 않는다.
  const savedRegular = useMemo<SegmentLike[]>(
    () =>
      (myLeaves.data?.leaves ?? [])
        .filter((leave) => leave.id !== editing?.id)
        .flatMap((leave) => leave.segments),
    [myLeaves.data, editing],
  );

  // 폼이 이번에 정기외박으로 잡아둔 구간.
  const draftRegular = useMemo<SegmentLike[]>(
    () =>
      resolved
        .filter((draft) => draft.key === "regular_overnight")
        .map((draft) => ({
          ...balanceKeyToCategory(draft.key),
          startDate: draft.startDate,
          endDate: draft.endDate,
        })),
    [resolved],
  );

  // 주기 재원은 총합이 아니라 날짜가 속한 주기로 따진다.
  const regularBlock = useMemo(() => {
    if (!cycleBased || !dischargeAt || !draftRegular.length) return null;
    return checkRegularOvernight({
      config: regularConfig,
      existing: savedRegular,
      requested: draftRegular,
      dischargeAt,
    });
  }, [cycleBased, dischargeAt, regularConfig, savedRegular, draftRegular]);
```

`SegmentLike`의 `category`/`overnightKind`는 `balanceKeyToCategory`가 채워 준다. `MyLeave["segments"]`는 `category`, `overnightKind?`, `startDate`, `endDate`, `days`를 갖고 있어 `SegmentLike`에 그대로 맞는다.

- [ ] **Step 3: 블로커와 오류 문구를 갈아끼운다**

`availableByKey` `useMemo`에서 정기외박은 주기로 따로 보므로 스칼라 계산에서 뺀다. 기존:

```ts
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    return result;
  }, [remainingByKey, validRange, startDate, drafts]);

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    title.trim().length > 0;
```

를 이렇게 바꾼다:

```ts
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    // 주기 재원은 스칼라 잔여가 "이번 주기" 값이라 미래 주기를 잘못 막는다.
    // 구간 행마다 그 날짜의 주기로 따로 계산한다(아래 rowAvailable).
    if (cycleBased) result.delete("regular_overnight");
    return result;
  }, [remainingByKey, validRange, startDate, drafts, cycleBased]);

  /** 이 구간 날짜가 속한 주기까지 반영한, 행 하나짜리 잔여 표. */
  const rowAvailable = (from: string, to: string) => {
    if (!cycleBased) return availableByKey;
    return new Map(availableByKey).set(
      "regular_overnight",
      regularOvernightAvailableIn({
        config: regularConfig,
        used: [...savedRegular, ...draftRegular],
        dischargeAt,
        from,
        to,
      }),
    );
  };

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    !regularBlock &&
    title.trim().length > 0;
```

- [ ] **Step 4: 구간 행과 오류 표시를 연결한다**

`SegmentRow`에 넘기는 `remainingByKey={availableByKey}`를 다음으로 바꾼다:

```tsx
                    remainingByKey={rowAvailable(
                      draft.startDate,
                      draft.endDate,
                    )}
```

오류 표시 블록(`{overused.length > 0 && (…)}`)을 다음으로 바꾼다:

```tsx
          {(overused.length > 0 || regularBlock) && (
            <Text selectable style={styles.error}>
              {[
                ...overused.map(
                  ([key, remaining]) =>
                    `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
                ),
                ...(regularBlock
                  ? [regularOvernightBlockMessage(regularBlock)]
                  : []),
              ].join(", ")}
            </Text>
          )}
```

- [ ] **Step 5: 타입 검사**

Run: `pnpm --filter @leave/native check-types`
Expected: 오류 없음.

- [ ] **Step 6: 커밋**

```bash
git add apps/native/src/components/leave-form-modal.tsx
git commit -m "fix: 앱 휴가 폼이 미래 정기외박 주기를 주기별로 따진다"
```

---

### Task 5: 웹 휴가 폼이 주기별로 따진다

앱과 같은 변경을 웹 모달에 대칭으로 넣는다. 훅 이름(`useMe(true)`)과 렌더 방식만 다르다.

**Files:**
- Modify: `apps/web/src/components/LeaveFormModal.tsx`

**Interfaces:**
- Consumes: Task 1의 `checkRegularOvernight`, `regularOvernightBlockMessage`, Task 2의 `regularOvernightAvailableIn`, 기존 `isRegularOvernightCycleBased`, `balanceKeyToCategory`. 기존 훅 `useMe(enabled: boolean)`, `useMyLeaves()`(`../api/queries`).
- Produces: 없음(화면 변경).

- [ ] **Step 1: 훅과 주기 재료를 붙인다**

`@leave/shared` import 목록에 다음을 더한다: `balanceKeyToCategory`, `checkRegularOvernight`, `isRegularOvernightCycleBased`, `regularOvernightAvailableIn`, `regularOvernightBlockMessage`, `type SegmentLike`.

`../api/queries` import 목록에 `useMe`, `useMyLeaves`를 더한다.

`const balances = useLeaveBalances();` 아래에 추가한다:

```ts
  const me = useMe(true);
  const myLeaves = useMyLeaves();
```

- [ ] **Step 2: 주기 판정에 쓸 값들을 만든다**

`remainingByKey` `useMemo` 다음에 넣는다(앱과 같은 내용):

```ts
  const regularConfig = balances.data?.regularOvernight ?? null;
  const cycleBased = isRegularOvernightCycleBased(regularConfig);
  const dischargeAt = me.data?.dischargeAt ?? "";

  // 이미 저장된 내 정기외박 구간. 수정 중이면 그 휴가 몫은 빼야 자기 자신과 부딪히지 않는다.
  const savedRegular = useMemo<SegmentLike[]>(
    () =>
      (myLeaves.data?.leaves ?? [])
        .filter((leave) => leave.id !== editing?.id)
        .flatMap((leave) => leave.segments),
    [myLeaves.data, editing],
  );

  // 폼이 이번에 정기외박으로 잡아둔 구간.
  const draftRegular = useMemo<SegmentLike[]>(
    () =>
      resolved
        .filter((draft) => draft.key === "regular_overnight")
        .map((draft) => ({
          ...balanceKeyToCategory(draft.key),
          startDate: draft.startDate,
          endDate: draft.endDate,
        })),
    [resolved],
  );

  // 주기 재원은 총합이 아니라 날짜가 속한 주기로 따진다.
  const regularBlock = useMemo(() => {
    if (!cycleBased || !dischargeAt || !draftRegular.length) return null;
    return checkRegularOvernight({
      config: regularConfig,
      existing: savedRegular,
      requested: draftRegular,
      dischargeAt,
    });
  }, [cycleBased, dischargeAt, regularConfig, savedRegular, draftRegular]);
```

- [ ] **Step 3: 블로커와 잔여 표를 갈아끼운다**

기존:

```ts
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    return result;
  }, [remainingByKey, validRange, startDate, drafts]);

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    title.trim().length > 0;
```

를 이렇게 바꾼다:

```ts
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    // 주기 재원은 스칼라 잔여가 "이번 주기" 값이라 미래 주기를 잘못 막는다.
    // 구간 행마다 그 날짜의 주기로 따로 계산한다(아래 rowAvailable).
    if (cycleBased) result.delete("regular_overnight");
    return result;
  }, [remainingByKey, validRange, startDate, drafts, cycleBased]);

  /** 이 구간 날짜가 속한 주기까지 반영한, 행 하나짜리 잔여 표. */
  const rowAvailable = (from: string, to: string) => {
    if (!cycleBased) return availableByKey;
    return new Map(availableByKey).set(
      "regular_overnight",
      regularOvernightAvailableIn({
        config: regularConfig,
        used: [...savedRegular, ...draftRegular],
        dischargeAt,
        from,
        to,
      }),
    );
  };

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    !regularBlock &&
    title.trim().length > 0;
```

- [ ] **Step 4: 재원 `<select>`와 오류 표시를 연결한다**

`resolved.map((draft, index) => {` 블록 안, `const maxEnd = …` 다음 줄에 추가한다:

```ts
                const available = rowAvailable(draft.startDate, draft.endDate);
```

`<option>`의 잔여 표시를 `availableByKey` 대신 `available`로 바꾼다:

```tsx
                      {BALANCE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {BALANCE_LABELS[key]} (잔여 {available.get(key) ?? 0}
                          일)
                        </option>
                      ))}
```

오류 표시 블록(`{overused.length > 0 && (…)}`)을 다음으로 바꾼다:

```tsx
          {(overused.length > 0 || regularBlock) && (
            <p
              className="field-error"
              role="alert"
              style={{ marginTop: "var(--sp-sm)" }}
            >
              {[
                ...overused.map(
                  ([key, remaining]) =>
                    `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
                ),
                ...(regularBlock
                  ? [regularOvernightBlockMessage(regularBlock)]
                  : []),
              ].join(", ")}
            </p>
          )}
```

- [ ] **Step 5: 타입 검사와 전체 테스트**

Run: `pnpm check-types`
Expected: 모든 워크스페이스 통과.

Run: `pnpm test`
Expected: shared 단위 테스트와 API 통합 테스트 모두 통과.

- [ ] **Step 6: 커밋**

```bash
git add apps/web/src/components/LeaveFormModal.tsx
git commit -m "fix: 웹 휴가 폼이 미래 정기외박 주기를 주기별로 따진다"
```

---

## 수동 확인

계획을 다 실행한 뒤 한 번 눈으로 본다:

1. 정기외박 자동 적립이 켜진 계정으로 로그인한다.
2. 이번 주기 몫을 다 쓴 상태에서 **다음 주기 날짜**로 휴가를 등록한다 → 등록된다.
3. 그 다음 주기 몫을 넘겨 등록해 본다 → `정기외박 N주기(…) 몫 X일을 Y일 초과했어요`가 뜨고 등록 버튼이 막힌다.
4. 재원 선택 칩의 정기외박 잔여 숫자가 고른 날짜의 주기 기준으로 바뀌는지 본다.
5. 전역일을 지나서 적립되는 주기 날짜로 등록해 본다 → `적립일이 전역일 뒤라 쓸 수 없어요`.
