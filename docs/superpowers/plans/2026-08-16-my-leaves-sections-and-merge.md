# 내 휴가 섹션 분리와 붙은 휴가 병합 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 내 휴가 목록을 "다가오는 / 지난" 두 섹션으로 나누고, 날짜가 붙어 있는 휴가를 저장 시점에 서버가 한 건으로 합친다.

**Architecture:** 병합 규칙은 DB를 모르는 순수 함수(`@leave/shared`)에 두고 vitest로 전부 덮는다. `apps/api`의 얇은 헬퍼가 후보 조회 → 규칙 호출 → `db.batch` 쓰기를 맡고, `routes/leaves.ts`의 POST·PATCH는 그 헬퍼 하나만 부른다. 화면의 분류·정렬은 `@leave/client`의 순수 함수 한 벌을 웹·네이티브가 함께 쓴다.

**Tech Stack:** TypeScript, pnpm workspace + turbo, Hono + `@hono/zod-openapi` + drizzle-orm(D1), React(웹) / Expo React Native(네이티브), vitest(`packages/*`) + `node:test`(`apps/api`), agent-browser.

**Spec:** `docs/superpowers/specs/2026-08-16-my-leaves-sections-and-merge-design.md`

## Global Constraints

- 날짜는 전부 `YYYY-MM-DD` 문자열(KST 달력 날짜)이다. `Date` 산술 대신 `@leave/shared`의 `addDays`/`diffDays`/`todayInSeoul`/`rangesOverlap`을 쓴다.
- `@leave/shared`는 플랫폼 API(fetch·localStorage·React)를 쓰지 않는다. 순수 함수만 둔다.
- 한 휴가의 구간은 **빈틈도 겹침도 없이** 이어져야 하고 **최대 30개**다(`leaveCreateSchema`). 사유는 **최대 500자**, 제목은 최대 80자.
- 재원이 다른 구간은 **절대 합치지 않는다.** 같은 재원(`segmentBalanceKey`)이 연달아 올 때만 한 구간으로 잇는다.
- 병합은 **`status`가 같은 휴가끼리만** 한다.
- 기존 데이터 마이그레이션은 하지 않는다.
- `apps/native/src/lib/query-persistence.ts`의 `CACHE_BUSTER`는 **범프하지 않는다**(응답 모양이 안 바뀐다).
- 주석과 커밋 메시지는 한국어로 쓴다. 기존 파일의 주석 밀도와 어투를 따른다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
  ```

---

### Task 1: 제목 규칙을 `@leave/shared`로 옮긴다

서버가 병합 후 자동 제목을 다시 지어야 하는데, 지금 규칙은 `@leave/client`에 있다. 두 함수 모두 `BALANCE_LABELS`와 `SegmentDraft`(둘 다 이미 shared)에만 의존하는 순수 함수라 옮기는 데 걸림돌이 없다. 구간에서 바로 제목을 짓는 `titleFromSegments`를 함께 만든다.

**Files:**
- Create: `packages/shared/src/leave-title.ts`
- Create: `packages/shared/test/leave-title.test.ts` (아래 Delete한 파일 내용을 옮겨 씀)
- Delete: `packages/client/test/leave-title.test.ts`
- Modify: `packages/shared/src/index.ts`
- Modify: `packages/client/src/forms/use-leave-form.ts` (`titleFromDrafts`/`isDerivedTitle` 정의 삭제 + 재수출)
- Modify: `apps/native/src/components/leave-form-modal.tsx:19-30` (import 출처 변경)

**Interfaces:**
- Consumes: `BALANCE_KEYS`, `BALANCE_LABELS`, `segmentBalanceKey`, `LeaveSegment` (`./leave`), `SegmentDraft` (`./leave-draft`)
- Produces:
  - `titleFromDrafts(drafts: readonly SegmentDraft[]): string`
  - `titleFromSegments(segments: readonly Pick<LeaveSegment, "category" | "overnightKind">[]): string`
  - `isDerivedTitle(title: string): boolean`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/test/leave-title.test.ts`를 새로 만든다. 기존 `packages/client/test/leave-title.test.ts`의 내용을 그대로 옮기고 `titleFromSegments` 케이스를 더한다.

```ts
/**
 * 자동 제목과 사용자가 직접 지은 이름을 가르는 규칙.
 *
 * 네이티브 수정 시트는 이 판정으로 제목 입력을 어떻게 열지 정하고, 서버는 붙은 휴가를
 * 합친 뒤 자동 제목을 다시 지을 때 쓴다. 잘못 판정하면 사용자가 붙인 이름을
 * "연가 계획" 같은 자동 제목이 조용히 덮는다.
 */

import { describe, expect, it } from "vitest";
import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  isDerivedTitle,
  titleFromDrafts,
  titleFromSegments,
  type LeaveSegment,
  type SegmentDraft,
} from "../src/index";

/** 첫 구간만 제목을 정하므로 종료일은 아무 날이나 좋다. */
function draft(key: SegmentDraft["key"]): SegmentDraft {
  return { key, endDate: "2026-08-20" };
}

function segment(
  category: LeaveSegment["category"],
  overnightKind?: LeaveSegment["overnightKind"],
): LeaveSegment {
  return {
    category,
    overnightKind,
    startDate: "2026-08-18",
    endDate: "2026-08-20",
    days: 3,
  };
}

describe("titleFromDrafts / isDerivedTitle", () => {
  it("모든 재원의 자동 제목을 자동으로 판정한다", () => {
    for (const key of BALANCE_KEYS) {
      const title = titleFromDrafts([draft(key)]);
      expect(title).toBe(`${BALANCE_LABELS[key]} 계획`);
      expect(isDerivedTitle(title)).toBe(true);
    }
  });

  it("구간이 없을 때의 기본 제목도 자동으로 본다", () => {
    expect(titleFromDrafts([])).toBe("휴가 계획");
    expect(isDerivedTitle("휴가 계획")).toBe(true);
  });

  it("사용자가 직접 지은 이름은 자동으로 보지 않는다", () => {
    expect(isDerivedTitle("제주도 가족여행")).toBe(false);
    // 자동 제목을 조금이라도 고쳤으면 그 사람 이름이다.
    expect(isDerivedTitle("연가 계획 (부모님)")).toBe(false);
    expect(isDerivedTitle("연가")).toBe(false);
  });

  it("빈 제목은 자동으로 지은 제목이 아니다", () => {
    // 서버 스키마가 빈 제목을 막아 실제로는 오지 않는다. 판정은 문자열만 본다.
    expect(isDerivedTitle("")).toBe(false);
  });
});

describe("titleFromSegments", () => {
  it("첫 구간의 재원으로 제목을 짓는다 — drafts 판본과 같은 결과다", () => {
    expect(titleFromSegments([segment("annual")])).toBe("연가 계획");
    expect(titleFromSegments([segment("overnight", "regular")])).toBe(
      "정기외박 계획",
    );
    expect(titleFromSegments([segment("overnight", "other")])).toBe(
      "기타 외박 계획",
    );
  });

  it("첫 구간만 본다 — 뒤에 다른 재원이 붙어도 제목은 그대로다", () => {
    expect(
      titleFromSegments([segment("annual"), segment("overnight", "regular")]),
    ).toBe("연가 계획");
  });

  it("구간이 없으면 기본 제목이다", () => {
    expect(titleFromSegments([])).toBe("휴가 계획");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @leave/shared test`
Expected: FAIL — `../src/index`에 `titleFromDrafts`/`isDerivedTitle`/`titleFromSegments`가 없다는 타입/런타임 오류.

- [ ] **Step 3: `packages/shared/src/leave-title.ts`를 만든다**

```ts
/**
 * 휴가 제목 — 자동으로 지은 제목과 사용자가 직접 붙인 이름을 가른다.
 *
 * 사용처: 네이티브 등록·수정 시트(제목 입력을 어떻게 열지), 서버의 휴가 병합(합친 뒤
 * 자동 제목을 다시 지을 때).
 *
 * 두 쓰임이 같은 규칙을 봐야 한다. 화면이 "연가 계획"을 자동으로 보고 서버가 사람이
 * 지은 이름으로 보면, 병합이 사용자가 붙인 이름을 덮거나 반대로 낡은 자동 제목을
 * 영영 남긴다.
 */

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  segmentBalanceKey,
  type LeaveSegment,
} from "./leave";
import type { SegmentDraft } from "./leave-draft";

/** 제목을 정하는 건 언제나 첫 구간이다 — 그날 나가는 이유가 그 휴가의 이름이다. */
function derive(label: string | undefined): string {
  return label ? `${label} 계획` : "휴가 계획";
}

/** 네이티브처럼 제목 입력을 두지 않는 화면이 쓰는 기본 제목 생성기. */
export function titleFromDrafts(drafts: readonly SegmentDraft[]): string {
  const first = drafts[0];
  return derive(first && BALANCE_LABELS[first.key]);
}

/** 저장된 구간에서 같은 규칙으로 제목을 짓는다. 서버의 병합이 쓴다. */
export function titleFromSegments(
  segments: readonly Pick<LeaveSegment, "category" | "overnightKind">[],
): string {
  const first = segments[0];
  return derive(first && BALANCE_LABELS[segmentBalanceKey(first)]);
}

/**
 * 자동으로 지어진 제목인지 판별한다.
 *
 * 자동 제목과 사용자가 직접 붙인 이름을 갈라야, 종류를 바꿨을 때 자동 제목만
 * 따라 바뀌고 손으로 지은 이름은 그대로 남는다.
 */
export function isDerivedTitle(title: string): boolean {
  const trimmed = title.trim();
  return (
    trimmed === "휴가 계획" ||
    BALANCE_KEYS.some((key) => trimmed === `${BALANCE_LABELS[key]} 계획`)
  );
}
```

- [ ] **Step 4: `packages/shared/src/index.ts`에서 내보낸다**

`export * from "./leave-draft";` 바로 아래 줄에 넣는다:

```ts
export * from "./leave-title";
```

파일 상단 주석의 구성 목록에서 `- leave          : 휴가 종류·상태·구간의 정의` 다음 줄에 한 줄 더한다:

```
 *  - leave-title    : 자동 제목과 사람이 지은 이름의 구분
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @leave/shared test`
Expected: PASS (`leave-title.test.ts` 포함 전부)

- [ ] **Step 6: `@leave/client`에서 정의를 걷어내고 재수출한다**

`packages/client/src/forms/use-leave-form.ts`에서 `titleFromDrafts`와 `isDerivedTitle`의 **정의 블록 전체**(`/** 네이티브처럼 제목 입력을 두지 않는 화면이 쓰는 기본 제목 생성기. */`부터 `isDerivedTitle` 함수의 닫는 중괄호까지)를 지우고, 그 자리에 재수출 한 줄을 둔다:

```ts
// 제목 규칙은 서버도 쓰므로 @leave/shared에 산다. 기존 import 경로를 깨지 않도록 재수출한다.
export { isDerivedTitle, titleFromDrafts } from "@leave/shared";
```

같은 파일 상단 import에서 이제 쓰지 않는 심볼을 정리한다 — `BALANCE_KEYS`가 이 파일의 다른 곳에서 쓰이지 않으면 `@leave/shared` import 목록에서 뺀다(`BALANCE_LABELS`, `SegmentDraft`는 남을 수 있으니 실제 사용 여부를 grep으로 확인하고 지운다).

Run: `grep -n "BALANCE_KEYS\|BALANCE_LABELS\|SegmentDraft" packages/client/src/forms/use-leave-form.ts`

- [ ] **Step 7: 네이티브 시트의 import를 `@leave/shared`로 옮긴다**

`apps/native/src/components/leave-form-modal.tsx`에서 `isDerivedTitle`, `titleFromDrafts`를 `@leave/client` import 목록에서 빼고 `@leave/shared` import 목록에 넣는다. 호출부(`85`, `92`, `96`줄 근처)는 그대로 둔다.

- [ ] **Step 8: 기존 client 테스트를 지우고 전체를 돌린다**

```bash
rm packages/client/test/leave-title.test.ts
```

Run: `pnpm test && pnpm check-types`
Expected: PASS. `apps/api` 통합 테스트는 dev 서버가 없으면 실패할 수 있다 — 그 경우 `pnpm --filter @leave/shared --filter @leave/client test`와 `pnpm check-types`만 확인한다.

- [ ] **Step 9: 커밋**

```bash
git add packages/shared/src/leave-title.ts packages/shared/src/index.ts \
        packages/shared/test/leave-title.test.ts \
        packages/client/src/forms/use-leave-form.ts \
        packages/client/test/leave-title.test.ts \
        apps/native/src/components/leave-form-modal.tsx
git commit -F - <<'EOF'
refactor(shared): 휴가 제목 규칙을 서버도 쓸 수 있는 자리로 옮긴다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 2: 병합 규칙 `planLeaveMerge`

DB를 모르는 순수 함수가 "누구를 흡수할지 · 어떻게 이어 붙일지 · 제목과 사유는 무엇인지 · 어느 행이 살아남을지"를 전부 결정한다.

**Files:**
- Create: `packages/shared/src/leave-merge.ts`
- Create: `packages/shared/test/leave-merge.test.ts`
- Modify: `packages/shared/src/index.ts`

**Interfaces:**
- Consumes: `addDays`, `rangesOverlap`, `ISODate` (`./dates`); `inclusiveDays`, `segmentBalanceKey`, `segmentsRange`, `sortSegments`, `LeaveSegment`, `LeaveStatus` (`./leave`); `isDerivedTitle`, `titleFromSegments` (`./leave-title`, Task 1)
- Produces:
  - `type MergeCandidate = { id: string; title: string; reason: string | null; status: LeaveStatus; createdAt: string; segments: LeaveSegment[] }`
  - `type LeaveMergePlan` — `{ kind: "conflict"; conflictWith: MergeCandidate; overlapStart: ISODate }` | `{ kind: "alone" }` | `{ kind: "merged"; hostId: string; createdAt: string; title: string; reason: string | null; segments: LeaveSegment[]; absorbedIds: string[] }`
  - `planLeaveMerge(incoming: MergeCandidate, others: readonly MergeCandidate[]): LeaveMergePlan`
  - `MAX_LEAVE_SEGMENTS = 30`, `MAX_LEAVE_REASON = 500`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/test/leave-merge.test.ts`:

```ts
/**
 * 붙어 있는 휴가를 한 건으로 합치는 규칙.
 *
 * 여기서 지켜야 하는 것은 두 가지다. (1) 재원이 다른 구간은 절대 합치지 않는다 —
 * 연가 3일 + 정기외박 4일은 합친 뒤에도 연가 3일 + 정기외박 4일이어야 한다.
 * (2) 사용자가 직접 붙인 이름을 자동 제목이 덮지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  planLeaveMerge,
  type LeaveSegment,
  type LeaveStatus,
  type MergeCandidate,
} from "../src/index";

function seg(
  category: LeaveSegment["category"],
  startDate: string,
  endDate: string,
  overnightKind?: LeaveSegment["overnightKind"],
): LeaveSegment {
  const days =
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) /
      86_400_000 +
    1;
  return { category, overnightKind, startDate, endDate, days };
}

function leave(
  id: string,
  segments: LeaveSegment[],
  extra: Partial<Omit<MergeCandidate, "id" | "segments">> = {},
): MergeCandidate {
  return {
    id,
    title: "연가 계획",
    reason: null,
    status: "shared" as LeaveStatus,
    createdAt: `2026-01-01T00:00:0${id.length % 10}.000Z`,
    segments,
    ...extra,
  };
}

describe("planLeaveMerge — 붙음/겹침/상태", () => {
  it("이웃이 없으면 alone이다", () => {
    const plan = planLeaveMerge(leave("a", [seg("annual", "2026-02-03", "2026-02-05")]), []);
    expect(plan.kind).toBe("alone");
  });

  it("앞 휴가 끝 다음 날에 시작하면 합친다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.hostId).toBe("a");
    expect(plan.absorbedIds).toEqual(["b"]);
  });

  it("하루라도 비면 합치지 않는다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-07", "2026-02-09")]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });

  it("겹치면 conflict와 겹치기 시작한 날짜를 돌려준다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-07")]);
    const incoming = leave("b", [seg("annual", "2026-02-05", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("conflict");
    if (plan.kind !== "conflict") return;
    expect(plan.overlapStart).toBe("2026-02-05");
    expect(plan.conflictWith.id).toBe("a");
  });

  it("겹침은 붙은 이웃이 있어도 먼저 알린다", () => {
    const touching = leave("a", [seg("annual", "2026-02-01", "2026-02-02")]);
    const overlapping = leave("c", [seg("annual", "2026-02-04", "2026-02-06")]);
    const incoming = leave("b", [seg("annual", "2026-02-03", "2026-02-05")]);
    expect(planLeaveMerge(incoming, [touching, overlapping]).kind).toBe("conflict");
  });

  it("상태가 다르면 붙어 있어도 손대지 않는다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      status: "draft",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });

  it("상태가 다르면 겹쳐도 오류가 아니다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-07")], {
      status: "draft",
    });
    const incoming = leave("b", [seg("annual", "2026-02-05", "2026-02-09")]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });

  it("앞뒤 양쪽에 붙으면 셋이 하나가 된다", () => {
    const before = leave("a", [seg("annual", "2026-02-01", "2026-02-02")]);
    const after = leave("c", [seg("annual", "2026-02-10", "2026-02-12")]);
    const incoming = leave("b", [seg("annual", "2026-02-03", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before, after]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.hostId).toBe("a");
    expect(plan.absorbedIds.sort()).toEqual(["b", "c"]);
    expect(plan.segments).toEqual([
      { category: "annual", overnightKind: undefined, startDate: "2026-02-01", endDate: "2026-02-12", days: 12 },
    ]);
  });

  it("한 홉 건너 붙어 있는 기존 데이터도 연쇄로 흡수한다", () => {
    // a(2/1~2/2) — b(2/3~2/5) 는 이미 붙은 채 저장돼 있고, 새로 c(2/6~2/9)가 온다.
    const a = leave("a", [seg("annual", "2026-02-01", "2026-02-02")]);
    const b = leave("b", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("c", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [a, b]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.hostId).toBe("a");
    expect(plan.absorbedIds.sort()).toEqual(["b", "c"]);
  });
});

describe("planLeaveMerge — 구간과 일수 보존", () => {
  it("재원이 다르면 구간을 따로 남기고 일수를 유지한다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("overnight", "2026-02-06", "2026-02-09", "regular")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.segments).toEqual([
      { category: "annual", overnightKind: undefined, startDate: "2026-02-03", endDate: "2026-02-05", days: 3 },
      { category: "overnight", overnightKind: "regular", startDate: "2026-02-06", endDate: "2026-02-09", days: 4 },
    ]);
  });

  it("같은 재원이 연달아 오면 한 구간으로 잇고 일수 합이 같다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.segments).toHaveLength(1);
    expect(plan.segments[0]!.days).toBe(7);
  });

  it("외박은 종류가 다르면 따로 남는다", () => {
    const before = leave("a", [seg("overnight", "2026-02-03", "2026-02-04", "regular")]);
    const incoming = leave("b", [seg("overnight", "2026-02-05", "2026-02-06", "other")]);
    const plan = planLeaveMerge(incoming, [before]);
    expect(plan.kind).toBe("merged");
    if (plan.kind !== "merged") return;
    expect(plan.segments).toHaveLength(2);
  });

  it("30구간을 넘기면 병합을 포기한다", () => {
    // 재원을 번갈아 두면 합쳐지지 않으므로 구간 수가 그대로 쌓인다.
    const many: LeaveSegment[] = [];
    for (let i = 0; i < 29; i += 1) {
      const day = `2026-03-${String(i + 1).padStart(2, "0")}`;
      many.push(seg(i % 2 === 0 ? "annual" : "award", day, day));
    }
    const before = leave("a", many);
    const incoming = leave("b", [
      seg("award", "2026-03-30", "2026-03-30"),
      seg("annual", "2026-03-31", "2026-03-31"),
    ]);
    expect(planLeaveMerge(incoming, [before]).kind).toBe("alone");
  });
});

describe("planLeaveMerge — 제목·사유·살아남는 행", () => {
  it("직접 지은 이름이 하나면 그것을 쓴다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      title: "제주도 가족여행",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.title).toBe("제주도 가족여행");
  });

  it("직접 지은 이름이 여럿이면 시작일이 이른 쪽을 쓴다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      title: "본가",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      title: "제주도 가족여행",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.title).toBe("본가");
  });

  it("전부 자동 제목이면 합친 첫 구간으로 다시 짓는다", () => {
    const before = leave("a", [seg("overnight", "2026-02-03", "2026-02-05", "regular")], {
      title: "정기외박 계획",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      title: "연가 계획",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.title).toBe("정기외박 계획");
  });

  it("사유를 시작일 순으로 줄바꿈해 잇고 중복은 한 번만 넣는다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      reason: "본가 방문",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      reason: "가족 행사",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.reason).toBe("본가 방문\n가족 행사");

    const same = planLeaveMerge(
      leave("b", [seg("annual", "2026-02-06", "2026-02-09")], { reason: "본가 방문" }),
      [before],
    );
    if (same.kind !== "merged") throw new Error("merged가 아니다");
    expect(same.reason).toBe("본가 방문");
  });

  it("사유가 둘 다 없으면 null이다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")]);
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.reason).toBeNull();
  });

  it("사유가 500자를 넘으면 자른다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      reason: "가".repeat(400),
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      reason: "나".repeat(400),
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.reason).toHaveLength(500);
  });

  it("살아남는 행의 id와 createdAt은 시작일이 이른 쪽이다", () => {
    const before = leave("a", [seg("annual", "2026-02-03", "2026-02-05")], {
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const incoming = leave("b", [seg("annual", "2026-02-06", "2026-02-09")], {
      createdAt: "2026-02-01T00:00:00.000Z",
    });
    const plan = planLeaveMerge(incoming, [before]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.hostId).toBe("a");
    expect(plan.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("새 휴가가 앞에 오면 새 휴가가 살아남는다", () => {
    const after = leave("a", [seg("annual", "2026-02-06", "2026-02-09")]);
    const incoming = leave("b", [seg("annual", "2026-02-03", "2026-02-05")]);
    const plan = planLeaveMerge(incoming, [after]);
    if (plan.kind !== "merged") throw new Error("merged가 아니다");
    expect(plan.hostId).toBe("b");
    expect(plan.absorbedIds).toEqual(["a"]);
  });

  it("others에 자기 자신이 섞여 와도 무시한다", () => {
    const incoming = leave("a", [seg("annual", "2026-02-03", "2026-02-05")]);
    expect(planLeaveMerge(incoming, [incoming]).kind).toBe("alone");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @leave/shared test leave-merge`
Expected: FAIL — `planLeaveMerge`가 없다.

- [ ] **Step 3: `packages/shared/src/leave-merge.ts`를 만든다**

```ts
/**
 * 붙어 있는 내 휴가를 한 건으로 합치는 규칙.
 *
 * 사용처: 서버의 휴가 등록·수정(`apps/api/src/lib/leave-merge.ts`).
 *
 * 2/3~2/5 휴가를 만든 뒤 2/6~2/9 휴가를 따로 만들면 실제로는 2/3부터 9일까지 한 번
 * 나갔다 오는 일정이다. 휴가 한 건은 이미 여러 구간을 가질 수 있으므로, 합치는 일은
 * 새 모델을 만드는 게 아니라 구간을 이어 붙이는 일이다.
 *
 * 지켜야 하는 것 두 가지:
 *  - **재원이 다른 구간은 절대 합치지 않는다.** 잔여 차감은 휴가가 아니라 구간 단위로
 *    움직이므로, 연가 3일 + 정기외박 4일을 한 구간으로 뭉개면 재원별 사용량이 틀어진다.
 *  - **사람이 붙인 이름을 자동 제목이 덮지 않는다.**
 *
 * 상태(status)가 같은 휴가끼리만 본다. 초안은 나만 보는 시뮬레이션이라 확정과 합쳐지면
 * 조용히 공개되거나 반대로 확정이 초안으로 내려간다.
 */

import { addDays, rangesOverlap, type ISODate } from "./dates";
import {
  inclusiveDays,
  segmentBalanceKey,
  segmentsRange,
  sortSegments,
  type LeaveSegment,
  type LeaveStatus,
} from "./leave";
import { isDerivedTitle, titleFromSegments } from "./leave-title";

/** `leaveCreateSchema`의 상한과 같아야 한다 — 넘기면 저장 자체가 거절된다. */
export const MAX_LEAVE_SEGMENTS = 30;
export const MAX_LEAVE_REASON = 500;

/** 병합 판정에 필요한 만큼의 휴가 한 건. 서버가 DB 행에서 만들어 넘긴다. */
export type MergeCandidate = {
  id: string;
  title: string;
  reason: string | null;
  status: LeaveStatus;
  createdAt: string;
  segments: LeaveSegment[];
};

export type LeaveMergePlan =
  /** 같은 상태의 휴가와 기간이 겹친다. 서버가 400으로 돌려준다. */
  | { kind: "conflict"; conflictWith: MergeCandidate; overlapStart: ISODate }
  /** 합칠 이웃이 없다. 지금까지처럼 저장하면 된다. */
  | { kind: "alone" }
  | {
      kind: "merged";
      /** 살아남는 행의 id. incoming일 수도, 이웃일 수도 있다. */
      hostId: string;
      createdAt: string;
      title: string;
      reason: string | null;
      segments: LeaveSegment[];
      /** 사라질 휴가 id들. hostId는 들어 있지 않다. */
      absorbedIds: string[];
    };

function rangeOf(candidate: MergeCandidate) {
  // 구간이 하나도 없는 휴가는 저장될 수 없다(스키마가 min(1)).
  return segmentsRange(candidate.segments)!;
}

function byStart(a: MergeCandidate, b: MergeCandidate): number {
  return rangeOf(a).startDate.localeCompare(rangeOf(b).startDate);
}

/**
 * 모아 놓은 구간을 하나의 휴가가 될 수 있는 형태로 잇는다.
 * 빈틈·겹침이 있거나 구간이 30개를 넘으면 null — 그때는 병합을 포기한다.
 */
function combineSegments(
  parts: readonly MergeCandidate[],
): LeaveSegment[] | null {
  const sorted = sortSegments(parts.flatMap((part) => part.segments));
  const out: LeaveSegment[] = [];
  for (const segment of sorted) {
    const days = inclusiveDays(segment.startDate, segment.endDate);
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...segment, days });
      continue;
    }
    // 앞 구간 끝 다음 날에 시작하지 않으면 빈틈이거나 겹침이다.
    if (segment.startDate !== addDays(last.endDate, 1)) return null;
    // 같은 재원끼리만 잇는다. 재원이 다르면 구간을 그대로 남겨야 일수가 보존된다.
    if (segmentBalanceKey(last) === segmentBalanceKey(segment)) {
      last.endDate = segment.endDate;
      last.days = inclusiveDays(last.startDate, last.endDate);
      continue;
    }
    out.push({ ...segment, days });
  }
  return out.length > MAX_LEAVE_SEGMENTS ? null : out;
}

/** 합쳐진 사유 — 시작일 순으로 잇고, 같은 문구는 한 번만, 상한에서 자른다. */
function combineReasons(parts: readonly MergeCandidate[]): string | null {
  const texts: string[] = [];
  for (const part of parts) {
    const text = part.reason?.trim();
    if (!text || texts.includes(text)) continue;
    texts.push(text);
  }
  const joined = texts.join("\n");
  return joined ? joined.slice(0, MAX_LEAVE_REASON) : null;
}

export function planLeaveMerge(
  incoming: MergeCandidate,
  others: readonly MergeCandidate[],
): LeaveMergePlan {
  const pool = others
    .filter((other) => other.id !== incoming.id && other.status === incoming.status)
    .sort(byStart);

  // 겹침이 먼저다. 합칠 이웃이 있더라도 겹치는 게 있으면 그걸 알리는 쪽이 먼저다.
  const incomingRange = rangeOf(incoming);
  for (const other of pool) {
    const range = rangeOf(other);
    if (
      !rangesOverlap(
        incomingRange.startDate,
        incomingRange.endDate,
        range.startDate,
        range.endDate,
      )
    ) {
      continue;
    }
    return {
      kind: "conflict",
      conflictWith: other,
      overlapStart:
        incomingRange.startDate > range.startDate
          ? incomingRange.startDate
          : range.startDate,
    };
  }

  // 흡수할 때마다 기간이 늘어나므로 더 붙을 이웃이 없을 때까지 반복한다.
  // 이 규칙이 처음부터 있었다면 한 홉이면 끝이지만, 기존 데이터에는 이미 붙은 채로
  // 저장된 휴가들이 남아 있다.
  const parts: MergeCandidate[] = [incoming];
  const rest = [...pool];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < rest.length; i += 1) {
      const other = rest[i]!;
      const merged = rangeOf({ ...incoming, segments: parts.flatMap((p) => p.segments) });
      const range = rangeOf(other);
      const touches =
        addDays(merged.endDate, 1) === range.startDate ||
        addDays(range.endDate, 1) === merged.startDate;
      if (!touches) continue;
      // 이어 붙였을 때 성립하지 않으면(기존 데이터의 겹침, 30구간 초과) 건드리지 않는다.
      // 기존 데이터 때문에 사용자가 자기 휴가를 못 고치게 되면 안 된다.
      if (!combineSegments([...parts, other])) continue;
      parts.push(other);
      rest.splice(i, 1);
      grew = true;
      break;
    }
  }

  if (parts.length === 1) return { kind: "alone" };

  const segments = combineSegments(parts)!;
  const ordered = [...parts].sort(byStart);
  const host = ordered[0]!;
  const named = ordered.filter((part) => !isDerivedTitle(part.title));

  return {
    kind: "merged",
    hostId: host.id,
    createdAt: host.createdAt,
    title: named.length ? named[0]!.title : titleFromSegments(segments),
    reason: combineReasons(ordered),
    segments,
    absorbedIds: ordered
      .filter((part) => part.id !== host.id)
      .map((part) => part.id),
  };
}
```

- [ ] **Step 4: `packages/shared/src/index.ts`에서 내보낸다**

`export * from "./leave-title";` 아래 줄에 넣는다:

```ts
export * from "./leave-merge";
```

상단 주석의 구성 목록에도 한 줄 더한다:

```
 *  - leave-merge    : 붙어 있는 휴가를 한 건으로 합치는 규칙
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @leave/shared test leave-merge`
Expected: PASS (모든 케이스)

- [ ] **Step 6: 전체 타입 검사**

Run: `pnpm --filter @leave/shared test && pnpm check-types`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add packages/shared/src/leave-merge.ts packages/shared/src/index.ts packages/shared/test/leave-merge.test.ts
git commit -F - <<'EOF'
feat(shared): 붙어 있는 휴가를 한 건으로 합치는 규칙을 세운다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 3: `assertSegmentsAvailable`이 여러 휴가를 제외할 수 있게 한다

병합에서는 흡수될 이웃들의 구간이 **이미 DB에 있다.** 지금은 제외할 휴가를 하나만 받아서, 그대로 두면 같은 날을 두 번 세고 "잔여가 부족합니다"로 잘못 막는다.

**Files:**
- Modify: `apps/api/src/lib/leave-balances.ts` (`assertSegmentsAvailable`, `assertRegularOvernightAvailable`, `userSegmentsExcluding`, `regularOvernightSegments`, import 줄)
- Modify: `apps/api/src/routes/leaves.ts` (호출부 2곳)

**Interfaces:**
- Produces: `assertSegmentsAvailable(db, user, segments: LeaveSegment[], replacingLeaveIds?: readonly string[]): Promise<void>` — 네 번째 인자가 `string`에서 `readonly string[]`으로 바뀐다. 빈 배열/`undefined`면 아무것도 제외하지 않는다.

- [ ] **Step 1: `regularOvernightSegments`를 여러 제외로 바꾼다**

`apps/api/src/lib/leave-balances.ts`의 `regularOvernightSegments`(88줄 근처) 시그니처와 `where`를 고친다.

```ts
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
```

주석의 "excludeLeaveId를 주면 그 휴가의 구간은 뺀다"를 "excludeLeaveIds를 주면 그 휴가들의 구간은 뺀다(수정 중인 휴가, 그리고 이번 저장으로 흡수될 이웃들)"로 고친다.

- [ ] **Step 2: `userSegmentsExcluding`을 여러 제외로 바꾼다**

같은 파일의 `userSegmentsExcluding`(437줄 근처):

```ts
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
```

- [ ] **Step 3: import에서 `ne`를 `notInArray`로 바꾼다**

같은 파일 33줄 근처. `ne`가 이 파일의 다른 곳에서 쓰이지 않는지 확인하고 지운다.

Run: `grep -n "\bne(" apps/api/src/lib/leave-balances.ts`

```ts
import { and, asc, eq, inArray, notInArray } from "drizzle-orm";
```

- [ ] **Step 4: `assertRegularOvernightAvailable`과 `assertSegmentsAvailable`의 시그니처를 바꾼다**

```ts
async function assertRegularOvernightAvailable(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  config: RegularOvernightConfigRow | undefined,
  requested: SegmentLike[],
  replacingLeaveIds: readonly string[],
) {
  // 이번 저장으로 사라질 휴가들의 구간은 빼야 자기 자신과 부딪히지 않는다.
  const existing = await regularOvernightSegments(db, user.id, replacingLeaveIds);
  ...
}
```

```ts
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
    ...
  ]);
  ...
}
```

함수 끝의 호출부도 바꾼다:

```ts
  if (cycleBased && requested.has("regular_overnight")) {
    await assertRegularOvernightAvailable(
      db,
      user,
      config,
      segments,
      replacingLeaveIds,
    );
  }
```

`assertSegmentsAvailable`의 doc 주석에서 "수정일 때 기존 구간을 빼고 배분하므로"를 "수정이거나 이웃을 흡수할 때 사라질 구간을 빼고 배분하므로"로 고친다.

- [ ] **Step 5: 라우트의 호출부 2곳을 배열로 바꾼다**

`apps/api/src/routes/leaves.ts`:
- POST(`createLeaveRoute`) 안의 `await assertSegmentsAvailable(db, user, segments);` — 그대로 둔다(기본값 `[]`).
- PATCH(`updateLeaveRoute`) 안의 `await assertSegmentsAvailable(db, user, segments, id);` → `await assertSegmentsAvailable(db, user, segments, [id]);`

- [ ] **Step 6: 타입 검사와 기존 통합 테스트**

```bash
pnpm check-types
pnpm --filter @leave/api exec wrangler dev --port 8799 &
# 8799가 응답할 때까지 기다린 뒤
pnpm --filter @leave/api test
```

Expected: `pnpm check-types` PASS. 통합 테스트도 이번 변경 전과 같은 결과여야 한다(동작 변화 없음, 시그니처만 넓어짐).

- [ ] **Step 7: 커밋**

```bash
git add apps/api/src/lib/leave-balances.ts apps/api/src/routes/leaves.ts
git commit -F - <<'EOF'
refactor(api): 잔여 검사에서 여러 휴가를 한꺼번에 뺄 수 있게 한다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 4: 서버가 저장할 때 실제로 합친다

`planLeaveMerge`를 DB에 붙인다. POST·PATCH가 같은 헬퍼 하나를 부르게 해서 규칙이 두 벌로 갈라지지 않게 한다.

**Files:**
- Create: `apps/api/src/lib/leave-merge.ts`
- Modify: `apps/api/src/routes/leaves.ts` (POST·PATCH 핸들러 본문)
- Modify: `apps/api/test/leaves.test.mjs` (테스트 추가)

**Interfaces:**
- Consumes: `planLeaveMerge`, `MergeCandidate`, `LeaveMergePlan`, `fmtDateShort`, `segmentsRange` (`@leave/shared`); `assertSegmentsAvailable`, `segmentRowsFor`, `segmentsForLeaves` (`./leave-balances`); `LeaveRow`, `leaves`, `leaveSegments` (`../db/schema`)
- Produces:
  - `saveLeaveWithMerge(db, user, incoming: MergeCandidate, options: { existingId?: string }): Promise<SaveLeaveResult>`
  - `type SaveLeaveResult = { ok: false; error: string } | { ok: true; row: LeaveRow; segments: LeaveSegment[] }`

- [ ] **Step 1: 실패하는 통합 테스트를 쓴다**

`apps/api/test/leaves.test.mjs` 끝에 붙인다.

```js
/**
 * 정기외박·포상 같은 재원은 가입 직후 잔여가 0이라 그대로 쓰면 잔여 검사에서 막힌다.
 * 병합을 보려는 테스트가 잔여 때문에 실패하지 않도록 먼저 채워 둔다.
 */
async function seedBalances(token, overrides) {
  const totals = {};
  for (const item of (await req("GET", "/leaves/balances", { token })).data
    .balances) {
    totals[item.key] = item.totalDays;
  }
  Object.assign(totals, overrides);
  await req("PUT", "/leaves/balances", { token, body: { totals } });
}

test("붙어 있는 휴가는 한 건으로 합쳐진다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("병합부대-") });
  await seedBalances(token, { regular_overnight: 8 });

  const first = await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-02-03", endDate: "2026-02-05" },
      ],
    },
  });
  assert.equal(first.status, 201);

  const second = await req("POST", "/leaves", {
    token,
    body: {
      title: "정기외박 계획",
      segments: [
        {
          category: "overnight",
          overnightKind: "regular",
          startDate: "2026-02-06",
          endDate: "2026-02-09",
        },
      ],
    },
  });
  assert.equal(second.status, 201);
  // 앞 휴가에 흡수되므로 살아남는 id는 먼저 만든 쪽이다.
  assert.equal(second.data.leave.id, first.data.leave.id);

  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.data.leaves.length, 1);
  const merged = mine.data.leaves[0];
  assert.equal(merged.startDate, "2026-02-03");
  assert.equal(merged.endDate, "2026-02-09");
  // 재원이 다르므로 구간은 둘로 남고 일수가 보존된다.
  assert.equal(merged.segments.length, 2);
  assert.equal(merged.segments[0].category, "annual");
  assert.equal(merged.segments[0].days, 3);
  assert.equal(merged.segments[1].overnightKind, "regular");
  assert.equal(merged.segments[1].days, 4);
});

test("같은 재원이 붙으면 한 구간으로 이어진다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("병합부대-") });

  await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-04-01", endDate: "2026-04-03" },
      ],
    },
  });
  await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-04-04", endDate: "2026-04-06" },
      ],
    },
  });

  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.data.leaves.length, 1);
  assert.equal(mine.data.leaves[0].segments.length, 1);
  assert.equal(mine.data.leaves[0].segments[0].days, 6);
});

test("겹치는 휴가는 날짜를 짚어 막는다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("병합부대-") });

  await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-05-10", endDate: "2026-05-14" },
      ],
    },
  });
  const overlapping = await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-05-12", endDate: "2026-05-16" },
      ],
    },
  });
  assert.equal(overlapping.status, 400);
  assert.match(overlapping.data.error, /5월 12일/);

  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.data.leaves.length, 1);
});

test("상태가 다르면 붙어 있어도 따로 남는다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("병합부대-") });

  await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      status: "draft",
      segments: [
        { category: "annual", startDate: "2026-06-01", endDate: "2026-06-02" },
      ],
    },
  });
  await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-06-03", endDate: "2026-06-04" },
      ],
    },
  });

  const mine = await req("GET", "/leaves/mine", { token });
  assert.equal(mine.data.leaves.length, 2);
});

test("흡수된 휴가의 id는 더 이상 수정할 수 없다", async () => {
  const { token } = await signup();
  await createUnit(token, { name: uniq("병합부대-") });

  const first = await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-07-01", endDate: "2026-07-02" },
      ],
    },
  });
  const second = await req("POST", "/leaves", {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-06-29", endDate: "2026-06-30" },
      ],
    },
  });
  // 새 휴가가 앞에 오므로 이번에는 새 휴가가 살아남고 먼저 것이 흡수된다.
  assert.equal(second.status, 201);
  assert.notEqual(second.data.leave.id, first.data.leave.id);
  assert.equal(second.data.leave.startDate, "2026-06-29");
  assert.equal(second.data.leave.endDate, "2026-07-02");

  const gone = await req("PATCH", `/leaves/${first.data.leave.id}`, {
    token,
    body: {
      title: "연가 계획",
      segments: [
        { category: "annual", startDate: "2026-07-01", endDate: "2026-07-02" },
      ],
    },
  });
  assert.equal(gone.status, 404);
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm --filter @leave/api test
```

`apps/api/scripts/run-tests.mjs`가 격리된 상태(`--persist-to`)로 dev 서버를 직접 띄우고
마이그레이션을 적용한 뒤 정리한다. **따로 `wrangler dev`를 띄우지 않는다** — 같은 포트에
두 서버가 뜨면 이 변경과 무관한 401·레이트리밋 실패가 난다.

Expected: 새 테스트 5건 FAIL (`/leaves/mine`이 2건을 주고, 겹치는 등록이 201로 통과한다).

- [ ] **Step 3: `apps/api/src/lib/leave-merge.ts`를 만든다**

```ts
/**
 * 휴가를 저장하면서 붙어 있는 이웃을 흡수하는 경로.
 *
 * 사용처: `/leaves` POST·PATCH.
 *
 * 규칙 자체는 `@leave/shared`의 `planLeaveMerge`가 갖고 있다. 여기서는 후보를 읽어
 * 넘기고, 결정된 모습을 한 번의 batch로 쓰는 일만 한다. 등록과 수정이 같은 함수를
 * 지나야 규칙이 두 벌로 갈라지지 않는다.
 */

import {
  fmtDateShort,
  planLeaveMerge,
  segmentsRange,
  type Branch,
  type LeaveSegment,
  type LeaveStatus,
  type MergeCandidate,
} from "@leave/shared";
import { and, eq, inArray, ne } from "drizzle-orm";
import { leaves, leaveSegments, type LeaveRow } from "../db/schema";
import type { Db } from "./db";
import {
  assertSegmentsAvailable,
  segmentRowsFor,
  segmentsForLeaves,
} from "./leave-balances";

export type SaveLeaveResult =
  | { ok: false; error: string }
  | { ok: true; row: LeaveRow; segments: LeaveSegment[] };

/**
 * 병합 후보 — 상태가 같은 내 휴가 전부.
 *
 * 날짜로 좁히지 않는다. 흡수할 때마다 기간이 늘어나므로 요청 기간 언저리로 창을
 * 좁히면 창 밖의 이웃이 애초에 안 읽혀 연쇄 병합이 한 홉에서 멈춘다. 한 사용자의
 * 휴가는 수십 건 규모라 상태로만 좁혀도 충분히 싸다.
 */
async function loadMergeCandidates(
  db: Db,
  userId: string,
  input: { status: LeaveStatus; excludeLeaveId?: string },
): Promise<MergeCandidate[]> {
  const rows = await db
    .select()
    .from(leaves)
    .where(
      and(
        eq(leaves.userId, userId),
        eq(leaves.status, input.status),
        ...(input.excludeLeaveId ? [ne(leaves.id, input.excludeLeaveId)] : []),
      ),
    )
    .all();
  if (!rows.length) return [];
  const segments = await segmentsForLeaves(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    segments: segments.get(row.id) ?? [],
  }));
}

/**
 * 휴가 한 건을 저장한다. 붙어 있는 같은 상태의 이웃이 있으면 흡수해 한 건으로 만든다.
 *
 * `options.existingId`가 있으면 수정, 없으면 등록이다. 어느 쪽이든 **살아남는 행이
 * 요청한 행이 아닐 수 있다** — 앞 휴가에 흡수되면 그쪽 id와 createdAt이 남는다.
 * 호출자는 반환된 `row.id`를 응답에 그대로 실어야 한다.
 */
export async function saveLeaveWithMerge(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  incoming: MergeCandidate,
  options: { existingId?: string } = {},
): Promise<SaveLeaveResult> {
  const plan = planLeaveMerge(
    incoming,
    await loadMergeCandidates(db, user.id, {
      status: incoming.status,
      excludeLeaveId: options.existingId,
    }),
  );

  if (plan.kind === "conflict") {
    return {
      ok: false,
      error: `${fmtDateShort(plan.overlapStart)}에 이미 등록한 휴가가 있어요. 기간이 겹치면 저장할 수 없습니다.`,
    };
  }

  const saved =
    plan.kind === "merged"
      ? {
          id: plan.hostId,
          createdAt: plan.createdAt,
          title: plan.title,
          reason: plan.reason,
          segments: plan.segments,
          // incoming은 아직 행이 없을 수 있다(등록). 지울 대상에서 뺀다.
          absorbedIds: plan.absorbedIds.filter((id) => id !== incoming.id),
        }
      : {
          id: incoming.id,
          createdAt: incoming.createdAt,
          title: incoming.title,
          reason: incoming.reason,
          segments: incoming.segments,
          absorbedIds: [] as string[],
        };

  const range = segmentsRange(saved.segments)!;
  const row: LeaveRow = {
    id: saved.id,
    userId: user.id,
    title: saved.title,
    startDate: range.startDate,
    endDate: range.endDate,
    reason: saved.reason,
    status: incoming.status,
    createdAt: saved.createdAt,
  };

  try {
    // 흡수될 이웃의 구간은 이미 DB에 있다. 빼지 않으면 같은 날을 두 번 세고
    // 잔여가 모자란다고 잘못 막는다.
    await assertSegmentsAvailable(db, user, saved.segments, [
      incoming.id,
      ...(options.existingId ? [options.existingId] : []),
      ...saved.absorbedIds,
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "잔여량이 부족합니다",
    };
  }

  // 살아남는 행이 이미 DB에 있는지. 등록인데 host가 자기 자신이면 그때만 insert다.
  const inserting = !options.existingId && saved.id === incoming.id;
  const clearIds = [saved.id, ...saved.absorbedIds];

  type BatchItem = Parameters<typeof db.batch>[0][number];
  const statements: BatchItem[] = [
    db.delete(leaveSegments).where(inArray(leaveSegments.leaveId, clearIds)),
  ];
  if (saved.absorbedIds.length) {
    statements.push(
      db.delete(leaves).where(inArray(leaves.id, saved.absorbedIds)),
    );
  }
  statements.push(
    inserting
      ? db.insert(leaves).values(row)
      : db
          .update(leaves)
          .set({
            title: row.title,
            startDate: row.startDate,
            endDate: row.endDate,
            reason: row.reason,
            status: row.status,
          })
          .where(eq(leaves.id, row.id)),
  );
  statements.push(
    db.insert(leaveSegments).values(segmentRowsFor(row.id, saved.segments)),
  );

  await db.batch(statements as [BatchItem, ...BatchItem[]]);

  return { ok: true, row, segments: saved.segments };
}
```

`segmentsForLeaves`가 `leave-balances.ts`에서 내보내지고 있는지 확인한다. 아니면 `export`를 붙인다.

Run: `grep -n "export async function segmentsForLeaves" apps/api/src/lib/leave-balances.ts`

- [ ] **Step 4: POST 핸들러를 헬퍼로 갈아끼운다**

`apps/api/src/routes/leaves.ts`의 `createLeaveRoute` 핸들러 본문을 바꾼다. `assertSegmentsAvailable`부터 `insertLeaveSegments`까지를 아래로 교체한다.

```ts
  .openapi(createLeaveRoute, async (c) => {
    const input = c.req.valid("json");
    const user = c.get("user");
    if (!user.unitId) {
      return c.json({ error: "먼저 부대에 가입해주세요" }, 400);
    }
    const db = drizzle(c.env.DB);
    const segments = toSegments(input);

    const saved = await saveLeaveWithMerge(db, user, {
      id: crypto.randomUUID(),
      title: input.title,
      reason: input.reason ?? null,
      // 생략하면 기존 동작대로 "희망"(집계 반영)으로 저장한다.
      status: input.status ?? "shared",
      createdAt: new Date().toISOString(),
      segments,
    });
    if (!saved.ok) return c.json({ error: saved.error }, 400);

    // 휴가가 추가되면 부대 달력이 바뀌므로 캐시를 무효화한다.
    await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = await checkOverageAndNotify({
      db,
      unitId: user.unitId,
      changedLeave: saved.row,
      waitUntil: (p) => c.executionCtx.waitUntil(p),
    });
    return c.json(
      {
        leave: serializeLeave(
          saved.row,
          new Map([[saved.row.id, saved.segments]]),
        ),
        exceededDates,
      },
      201,
    );
  })
```

- [ ] **Step 5: PATCH 핸들러를 헬퍼로 갈아끼운다**

```ts
  .openapi(updateLeaveRoute, async (c) => {
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const user = c.get("user");
    const db = drizzle(c.env.DB);

    const existing = await db
      .select()
      .from(leaves)
      .where(and(eq(leaves.id, id), eq(leaves.userId, user.id)))
      .get();
    if (!existing) {
      return c.json({ error: "휴가를 찾을 수 없습니다" }, 404);
    }

    const saved = await saveLeaveWithMerge(
      db,
      user,
      {
        id,
        title: input.title,
        reason: input.reason ?? null,
        // 상태를 보내지 않으면 지금 상태를 유지한다(초안이 조용히 공유되지 않게).
        status: input.status ?? existing.status,
        createdAt: existing.createdAt,
        segments: toSegments(input),
      },
      { existingId: id },
    );
    if (!saved.ok) return c.json({ error: saved.error }, 400);

    if (user.unitId) await bumpUnitVersion(c.env.CACHE, user.unitId);

    const exceededDates = user.unitId
      ? await checkOverageAndNotify({
          db,
          unitId: user.unitId,
          changedLeave: saved.row,
          waitUntil: (p) => c.executionCtx.waitUntil(p),
        })
      : [];
    return c.json(
      {
        leave: serializeLeave(
          saved.row,
          new Map([[saved.row.id, saved.segments]]),
        ),
        exceededDates,
      },
      200,
    );
  })
```

- [ ] **Step 6: import를 정리한다**

`apps/api/src/routes/leaves.ts` 상단에서:
- `saveLeaveWithMerge`를 `./lib/leave-merge`가 아니라 `../lib/leave-merge`에서 가져온다(이 파일은 `src/routes/` 아래다).
- 더 이상 쓰지 않는 심볼(`assertSegmentsAvailable`, `insertLeaveSegments`, `segmentRowsFor`, `segmentsRange`, `leaveSegments`)을 grep으로 확인하고 지운다. `segmentsForLeaves`는 `mineRoute`가 계속 쓴다.

Run: `grep -n "assertSegmentsAvailable\|insertLeaveSegments\|segmentRowsFor\|segmentsRange\|leaveSegments" apps/api/src/routes/leaves.ts`

- [ ] **Step 7: 테스트를 돌린다**

```bash
pnpm check-types
pnpm --filter @leave/api test
```

Expected: PASS — 새 테스트 5건 포함 전부. 기존 "내 휴가 목록 CRUD"도 그대로 통과해야 한다.

- [ ] **Step 8: 커밋**

```bash
git add apps/api/src/lib/leave-merge.ts apps/api/src/routes/leaves.ts apps/api/test/leaves.test.mjs
git commit -F - <<'EOF'
feat(api): 붙어 있는 휴가를 저장할 때 한 건으로 합친다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 5: 다가오는/지난 분류를 `@leave/client`에 둔다

웹과 네이티브가 같은 규칙을 봐야 한다. `my-leave-days.ts`·`leave-holdings.ts`와 같은 자리에 순수 함수 하나를 둔다.

**Files:**
- Create: `packages/client/src/my-leaves-sections.ts`
- Create: `packages/client/test/my-leaves-sections.test.ts`
- Modify: `packages/client/src/index.ts`

**Interfaces:**
- Consumes: `todayInSeoul`, `ISODate` (`@leave/shared`); `MyLeave` (`./types`)
- Produces:
  - `type MyLeaveSections = { upcoming: MyLeave[]; past: MyLeave[] }`
  - `partitionMyLeaves(leaves: readonly MyLeave[] | undefined, today?: ISODate): MyLeaveSections`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/client/test/my-leaves-sections.test.ts`:

```ts
/**
 * 내 휴가를 "다가오는 / 지난"으로 가르는 규칙.
 *
 * 경계가 미묘하다 — 오늘 끝나는 휴가는 아직 지나가지 않았고, 오늘 진행 중인 휴가는
 * 시작일이 과거지만 다가오는 쪽이다. 웹과 네이티브가 같은 답을 봐야 한다.
 */

import { describe, expect, it } from "vitest";
import { partitionMyLeaves } from "../src/my-leaves-sections";
import type { MyLeave } from "../src/types";

const TODAY = "2026-08-16";

function leave(id: string, startDate: string, endDate: string): MyLeave {
  return {
    id,
    userId: "u1",
    title: "연가 계획",
    startDate,
    endDate,
    reason: null,
    status: "shared",
    segments: [
      { category: "annual", startDate, endDate, days: 1 },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
  } as unknown as MyLeave;
}

describe("partitionMyLeaves", () => {
  it("목록이 없으면 두 섹션 모두 빈 배열이다", () => {
    expect(partitionMyLeaves(undefined, TODAY)).toEqual({
      upcoming: [],
      past: [],
    });
  });

  it("종료일이 어제까지면 지난 휴가다", () => {
    const sections = partitionMyLeaves([leave("a", "2026-08-14", "2026-08-15")], TODAY);
    expect(sections.past.map((l) => l.id)).toEqual(["a"]);
    expect(sections.upcoming).toEqual([]);
  });

  it("오늘 끝나는 휴가는 아직 지나지 않았다", () => {
    const sections = partitionMyLeaves([leave("a", "2026-08-14", TODAY)], TODAY);
    expect(sections.upcoming.map((l) => l.id)).toEqual(["a"]);
    expect(sections.past).toEqual([]);
  });

  it("오늘 진행 중인 휴가는 다가오는 쪽이고 맨 위에 온다", () => {
    const sections = partitionMyLeaves(
      [leave("later", "2026-08-20", "2026-08-22"), leave("now", "2026-08-15", "2026-08-18")],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["now", "later"]);
  });

  it("다가오는 휴가는 시작일이 가까운 순이다", () => {
    const sections = partitionMyLeaves(
      [
        leave("c", "2026-10-01", "2026-10-03"),
        leave("a", "2026-08-20", "2026-08-22"),
        leave("b", "2026-09-01", "2026-09-02"),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("시작일이 같으면 먼저 끝나는 휴가가 위다", () => {
    const sections = partitionMyLeaves(
      [
        leave("long", "2026-08-20", "2026-08-25"),
        leave("short", "2026-08-20", "2026-08-21"),
      ],
      TODAY,
    );
    expect(sections.upcoming.map((l) => l.id)).toEqual(["short", "long"]);
  });

  it("지난 휴가는 최근에 끝난 순이다", () => {
    const sections = partitionMyLeaves(
      [
        leave("old", "2026-05-01", "2026-05-03"),
        leave("recent", "2026-08-10", "2026-08-12"),
        leave("mid", "2026-07-01", "2026-07-02"),
      ],
      TODAY,
    );
    expect(sections.past.map((l) => l.id)).toEqual(["recent", "mid", "old"]);
  });

  it("종료일이 같으면 늦게 시작한 휴가가 위다", () => {
    const sections = partitionMyLeaves(
      [
        leave("long", "2026-08-01", "2026-08-12"),
        leave("short", "2026-08-11", "2026-08-12"),
      ],
      TODAY,
    );
    expect(sections.past.map((l) => l.id)).toEqual(["short", "long"]);
  });

  it("원본 배열을 건드리지 않는다", () => {
    const input = [leave("b", "2026-09-01", "2026-09-02"), leave("a", "2026-08-20", "2026-08-22")];
    partitionMyLeaves(input, TODAY);
    expect(input.map((l) => l.id)).toEqual(["b", "a"]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm --filter @leave/client test my-leaves-sections`
Expected: FAIL — `../src/my-leaves-sections` 모듈이 없다.

- [ ] **Step 3: `packages/client/src/my-leaves-sections.ts`를 만든다**

```ts
/**
 * 내 휴가를 "다가오는 / 지난" 두 섹션으로 가른다.
 *
 * 사용처: 웹·네이티브의 내 휴가 화면.
 *
 * 다음 주에 나갈 휴가와 반년 전에 다녀온 휴가를 한 목록에 같은 무게로 쌓으면, 계획을
 * 확인하려고 지나간 것들을 눈으로 걸러야 한다.
 *
 * 경계는 종료일로 잡는다 — **오늘 끝나는 휴가는 아직 지나가지 않았다.** 오늘 진행
 * 중인 휴가도 다가오는 쪽이고, 시작일이 과거라 정렬상 자연히 맨 위에 온다.
 *
 * 규칙이 두 화면에 각각 적히면 한쪽만 고쳐져 순서가 갈린다. 그래서 여기 한 벌만 둔다.
 */
import { todayInSeoul, type ISODate } from "@leave/shared";
import type { MyLeave } from "./types";

export type MyLeaveSections = {
  /** 아직 끝나지 않은 휴가. 가까운 것부터. */
  upcoming: MyLeave[];
  /** 이미 끝난 휴가. 최근에 끝난 것부터. */
  past: MyLeave[];
};

export function partitionMyLeaves(
  leaves: readonly MyLeave[] | undefined,
  today: ISODate = todayInSeoul(),
): MyLeaveSections {
  const upcoming: MyLeave[] = [];
  const past: MyLeave[] = [];
  for (const leave of leaves ?? []) {
    (leave.endDate < today ? past : upcoming).push(leave);
  }
  upcoming.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.endDate.localeCompare(b.endDate),
  );
  past.sort(
    (a, b) =>
      b.endDate.localeCompare(a.endDate) ||
      b.startDate.localeCompare(a.startDate),
  );
  return { upcoming, past };
}
```

- [ ] **Step 4: `packages/client/src/index.ts`에서 내보낸다**

`export * from "./my-leave-days";` 아래 줄에 넣는다:

```ts
export * from "./my-leaves-sections";
```

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `pnpm --filter @leave/client test && pnpm check-types`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add packages/client/src/my-leaves-sections.ts packages/client/src/index.ts packages/client/test/my-leaves-sections.test.ts
git commit -F - <<'EOF'
feat(client): 내 휴가를 다가오는 것과 지난 것으로 가르는 규칙을 둔다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 6: 웹 내 휴가 화면을 두 섹션으로 나눈다

**Files:**
- Modify: `apps/web/src/pages/LeavesPage.tsx` (목록 렌더 부분, 182-263줄 근처)
- Modify: `apps/web/src/components/LeaveFormModal.tsx:55,66` (`onSaved` 시그니처)
- Modify: `apps/web/src/pages/CalendarPage.tsx:86` (`onSaved` 호출부)
- Modify: `apps/web/src/pages/LeaveDetailPage.tsx:346` (흡수 시 새 id로 이동)

**Interfaces:**
- Consumes: `partitionMyLeaves` (Task 5), `LeaveResult` (`@leave/client`)
- Produces: 없음(화면 코드)

- [ ] **Step 1: 목록 한 줄을 그리는 부분을 함수로 뽑는다**

`apps/web/src/pages/LeavesPage.tsx`에서 지금 `leaves.data.leaves.map((l) => ...)` 안에 있는 `<li>` 전체를 파일 하단의 컴포넌트로 옮긴다. 두 섹션이 같은 행을 그려야 하므로 두 벌로 두면 안 된다.

```tsx
/** 목록의 한 줄. 다가오는 섹션과 지난 섹션이 같은 모양을 쓴다. */
function LeaveRow(props: {
  leave: MyLeave;
  deleting: boolean;
  onEdit: (leave: MyLeave) => void;
  onDelete: (leave: MyLeave) => void;
}) {
  const l = props.leave;
  return (
    <li
      className="content-row"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--sp-lg)",
        flexWrap: "wrap",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <Link
          to={`/leaves/${l.id}`}
          className="body-lg strong"
          style={{ textDecoration: "none" }}
        >
          {l.title}
        </Link>
        <p className="body-sm text-body" style={{ marginTop: 2 }}>
          {fmtRange(l.startDate, l.endDate)}
        </p>
        {l.reason && (
          <p className="caption text-mute" style={{ marginTop: 4 }}>
            {l.reason}
          </p>
        )}
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
        >
          {l.segments.map((segment) => {
            const key = segmentBalanceKey(segment);
            return (
              <span key={`${key}-${segment.startDate}`} className="badge">
                {BALANCE_LABELS[key]}{" "}
                {fmtRangeTiny(segment.startDate, segment.endDate)}
              </span>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => props.onEdit(l)}
        >
          수정
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          disabled={props.deleting}
          onClick={() => props.onDelete(l)}
        >
          삭제
        </button>
      </div>
    </li>
  );
}
```

- [ ] **Step 2: 섹션 컴포넌트를 더한다**

같은 파일 하단:

```tsx
/** 섹션 하나. 비어 있으면 아무것도 그리지 않는다. */
function LeaveSection(props: {
  title: string;
  leaves: MyLeave[];
  deleting: boolean;
  onEdit: (leave: MyLeave) => void;
  onDelete: (leave: MyLeave) => void;
}) {
  if (props.leaves.length === 0) return null;
  return (
    <section>
      <h2 className="body-lg strong" style={{ marginBottom: "var(--sp-sm)" }}>
        {props.title}{" "}
        <span className="caption text-mute">{props.leaves.length}건</span>
      </h2>
      <ul
        className="content-panel"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {props.leaves.map((leave) => (
          <LeaveRow
            key={leave.id}
            leave={leave}
            deleting={props.deleting}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
          />
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 3: 본문에서 두 섹션을 그린다**

`LeavesPage` 안에서 `partitionMyLeaves`를 부르고, 기존 `<ul>...</ul>` 블록을 두 섹션으로 바꾼다.

```tsx
  const sections = partitionMyLeaves(leaves.data?.leaves);
  const onDelete = (leave: MyLeave) => {
    if (confirm(`"${leave.title}" 휴가를 삭제할까요?`)) {
      void del.mutateAsync(leave.id);
    }
  };
```

렌더 부분:

```tsx
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--sp-xl)" }}>
          <LeaveSection
            title="다가오는 휴가"
            leaves={sections.upcoming}
            deleting={del.isPending}
            onEdit={setEditing}
            onDelete={onDelete}
          />
          <LeaveSection
            title="지난 휴가"
            leaves={sections.past}
            deleting={del.isPending}
            onEdit={setEditing}
            onDelete={onDelete}
          />
        </div>
      )}
```

import에 `partitionMyLeaves`를 더한다(`@leave/client`).

- [ ] **Step 4: 폼 모달이 저장된 휴가를 알려주게 한다**

`apps/web/src/components/LeaveFormModal.tsx`:

```tsx
export function LeaveFormModal(props: {
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
  // 붙어 있는 휴가에 흡수되면 저장된 휴가의 id가 요청한 id와 다를 수 있다.
  onSaved: (result: LeaveResult) => void;
}) {
```

```tsx
  const save = async () => {
    const result = await form.submit();
    if (!result) return;
    props.onSaved(result);
    props.onClose();
  };
```

`LeaveResult` 타입을 `@leave/client`에서 가져온다.

- [ ] **Step 5: 세 호출부를 맞춘다**

- `apps/web/src/pages/CalendarPage.tsx:86` — `const onSaved = (exceededDates: string[]) => {` 를 `const onSaved = (result: LeaveResult) => {` 로 바꾸고, 본문의 `exceededDates`를 `result.exceededDates`로 바꾼다. `LeaveResult` import를 더한다.
- `apps/web/src/pages/LeavesPage.tsx` — `onSaved={() => undefined}` 그대로 둔다.
- `apps/web/src/pages/LeaveDetailPage.tsx:346` — 흡수되면 사라진 URL에 남지 않도록 새 id로 갈아탄다:

```tsx
        <LeaveFormModal
          editing={leave}
          onClose={() => setEditing(false)}
          onSaved={(result) => {
            // 앞 휴가에 흡수되면 이 화면이 가리키던 휴가가 사라진다. 합쳐진 쪽으로 옮긴다.
            if (result.leave.id !== leaveId) {
              navigate(`/leaves/${result.leave.id}`, { replace: true });
            }
          }}
        />
```

- [ ] **Step 6: 타입 검사와 빌드**

Run: `pnpm check-types && pnpm --filter @leave/web build`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/pages/LeavesPage.tsx apps/web/src/components/LeaveFormModal.tsx \
        apps/web/src/pages/CalendarPage.tsx apps/web/src/pages/LeaveDetailPage.tsx
git commit -F - <<'EOF'
feat(web): 내 휴가를 다가오는 것과 지난 것으로 나눠 보여준다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 7: 네이티브 내 휴가 화면을 두 섹션으로 나눈다

**Files:**
- Modify: `apps/native/src/screens/leaves.tsx` (`leaveList` 부분, 185-257줄 근처)
- Modify: `apps/native/src/components/leave-form-modal.tsx` (`onSaved` 콜백 추가)
- Modify: `apps/native/src/screens/leave-detail.tsx:136` (흡수 시 새 id로 이동)

**Interfaces:**
- Consumes: `partitionMyLeaves` (Task 5), `LeaveResult` (`@leave/client`)
- Produces: 없음(화면 코드)

- [ ] **Step 1: 한 줄을 그리는 부분을 함수로 뽑는다**

`apps/native/src/screens/leaves.tsx`의 `myLeaves.map((l, index) => ...)` 안쪽 `<View>` 전체를 `renderLeaveRow(l, index)` 형태의 지역 함수로 뽑는다. 컴포넌트 밖으로 빼면 `styles`·`isExpanded`·`selectedLeave`·`openLeave`·`setEditing`·`confirmDelete`·`del`을 전부 넘겨야 하므로, `LeavesScreen` 안의 지역 함수로 둔다.

```tsx
  const renderLeaveRow = (l: MyLeave, index: number) => {
    const selected = isExpanded && l.id === selectedLeave?.id;
    return (
      <View
        key={l.id}
        style={[
          styles.leaveRow,
          index > 0 && styles.rowDivider,
          // 색만으로 선택을 알리지 않도록 왼쪽에 굵은 표시선을 함께 둔다.
          selected && styles.leaveRowSelected,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityState={isExpanded ? { selected } : undefined}
          accessibilityLabel={`${l.title} 자세히 보기`}
          onPress={() => openLeave(l)}
          style={{ flex: 1, minWidth: 0 }}
        >
          <Text style={styles.leaveTitle}>{l.title}</Text>
          <Text style={styles.leaveDates}>
            {fmtRange(l.startDate, l.endDate)}
          </Text>
          {l.reason ? <Text style={styles.leaveReason}>{l.reason}</Text> : null}
          <SegmentBadges segments={l.segments} />
        </Pressable>
        <ActionMenu
          label={`${l.title} 작업`}
          buttonLabel="휴가 관리"
          testID={`leave-actions-${l.id}`}
          actions={[
            {
              id: "edit",
              title: "수정",
              systemImage: "pencil",
              onPress: () => setEditing(l),
            },
            {
              id: "delete",
              title: "삭제",
              systemImage: "trash",
              destructive: true,
              disabled: del.isPending,
              onPress: () => void confirmDelete(l),
            },
          ]}
        />
      </View>
    );
  };
```

- [ ] **Step 2: `leaveList`를 두 패널로 바꾼다**

`const sections = partitionMyLeaves(leaves.data?.leaves);`를 `const myLeaves = ...` 아래에 더하고, `leaveList`를 다음으로 바꾼다.

```tsx
  const leaveList = (
    <View style={styles.stack}>
      {leaves.isPending ? (
        <View style={{ padding: spacing.xxxl, alignItems: "center" }}>
          <ActivityIndicator color={colors.ink} />
        </View>
      ) : myLeaves.length === 0 ? (
        <ContentPanel style={styles.empty}>
          <Text style={styles.emptyTitle}>아직 등록한 휴가가 없어요</Text>
          <Text style={styles.emptyCaption}>
            휴가를 등록하면 부대 달력에 함께 표시돼요.
          </Text>
        </ContentPanel>
      ) : (
        <>
          {sections.upcoming.length > 0 ? (
            <ContentPanel style={styles.leaveList}>
              <Text style={styles.sectionTitle} selectable>
                다가오는 휴가 {sections.upcoming.length}건
              </Text>
              {sections.upcoming.map(renderLeaveRow)}
            </ContentPanel>
          ) : null}
          {sections.past.length > 0 ? (
            <ContentPanel style={styles.leaveList}>
              <Text style={styles.sectionTitle} selectable>
                지난 휴가 {sections.past.length}건
              </Text>
              {sections.past.map(renderLeaveRow)}
            </ContentPanel>
          ) : null}
        </>
      )}
    </View>
  );
```

첫 줄에 `index > 0 && styles.rowDivider`가 걸려 있어 각 패널의 첫 줄에는 구분선이 붙지 않는다 — 섹션 제목 바로 아래라 의도한 모습이다.

파일 상단 주석에서 "다가오는 일정과 지난 일정을 나누고"가 이제 사실이 됐으므로 그대로 둔다.

- [ ] **Step 3: 네이티브 폼 시트에 `onSaved`를 더한다**

`apps/native/src/components/leave-form-modal.tsx`:

```tsx
export function LeaveFormModal(props: {
  visible: boolean;
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
  // 붙어 있는 휴가에 흡수되면 저장된 휴가의 id가 요청한 id와 다를 수 있다.
  onSaved?: (result: LeaveResult) => void;
}) {
```

```tsx
  const save = async () => {
    const result = await form.submit();
    if (!result) return;
    props.onSaved?.(result);
    props.onClose();
    // 저장은 됐지만 그날이 초과라면, 공식 승인 여부는 부대에 확인해야 한다.
    if (result.exceededDates.length > 0) {
      ...
    }
  };
```

`LeaveResult` 타입을 `@leave/client`에서 가져온다.

- [ ] **Step 4: 네이티브 상세 화면이 흡수된 휴가를 따라가게 한다**

`apps/native/src/screens/leave-detail.tsx`의 `<LeaveFormModal>`에 `onSaved`를 더한다.

```tsx
        <LeaveFormModal
          visible
          editing={leave}
          onClose={() => setEditing(false)}
          onSaved={(result) => {
            // 앞 휴가에 흡수되면 이 화면이 가리키던 휴가가 사라진다. 합쳐진 쪽으로 옮긴다.
            if (result.leave.id !== leaveId) {
              router.replace({
                pathname: "/leave/[leaveId]",
                params: { leaveId: result.leave.id },
              });
            }
          }}
        />
```

- [ ] **Step 5: 타입 검사와 린트**

Run: `pnpm check-types && pnpm --filter @leave/native lint`
Expected: PASS

- [ ] **Step 6: 커밋**

```bash
git add apps/native/src/screens/leaves.tsx apps/native/src/components/leave-form-modal.tsx apps/native/src/screens/leave-detail.tsx
git commit -F - <<'EOF'
feat(native): 내 휴가를 다가오는 것과 지난 것으로 나눠 보여준다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```

---

### Task 8: 브라우저로 실제 동작을 확인한다

단위·통합 테스트는 규칙과 API를 덮지만, 실제 화면에서 섹션이 나뉘고 병합이 눈에 보이는지는 확인하지 않았다.

**Files:**
- Modify: 없음(문제를 찾으면 해당 Task로 돌아간다)

- [ ] **Step 1: 스킬 지침을 읽는다**

Run: `pnpm exec agent-browser skills get core`

- [ ] **Step 2: API와 두 앱을 띄운다**

```bash
pnpm --filter @leave/api exec wrangler dev --port 8787 --var CORS_ORIGIN:http://localhost:8081 &
pnpm dev:web &
EXPO_PUBLIC_API_URL=http://localhost:8787 pnpm --filter @leave/native exec expo start --web --port 8081 &
```

8081이 이미 잡혀 있으면 `ps aux | grep expo`로 옛 프로세스를 찾아 죽인다(`ss`/`lsof`는 이 샌드박스에서 아무것도 보여주지 않는다). Metro 첫 요청은 번들링에 ~15초 걸리므로 200이 뜰 때까지 폴링한다.

- [ ] **Step 3: 계정과 부대를 만든다**

`POST /auth/signup`(branch·enlistedAt·dischargeAt을 포함한 전체 본문이면 `onboardingCompleted: true`)로 계정을 만들고 `POST /units`로 부대를 만든다. 휴가는 부대가 있어야 등록된다. 정기외박을 쓸 거라면 `PUT /leaves/balances`로 잔여도 채운다.

```bash
TOKEN=$(curl -s -X POST http://localhost:8787/auth/signup \
  -H 'content-type: application/json' \
  -d '{"email":"merge-check@test.com","password":"password123","name":"확인용",
       "branch":"army","enlistedAt":"2026-01-05","dischargeAt":"2027-07-04",
       "rank":"private","dataConsent":true}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

curl -s -X POST http://localhost:8787/units -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"name":"확인부대","dailyLimit":3}'
echo "$TOKEN"
```

`POST /units`의 정확한 본문은 `apps/api/test/helpers.mjs`의 `createUnit`을 그대로 따른다. 얻은 토큰은 각 앱 오리진에서 `localStorage["leave.token"]`에 넣으면 두 앱 모두 읽는다:

```bash
pnpm exec agent-browser open http://localhost:5173
pnpm exec agent-browser eval "localStorage.setItem('leave.token', '<TOKEN>')"
```

- [ ] **Step 4: 웹에서 확인한다**

```bash
pnpm exec agent-browser open http://localhost:5173/leaves
pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
```

확인할 것:
1. 2/3~2/5 연가와 2/6~2/9 정기외박을 각각 등록 → 목록에 **1건**, 배지가 **연가·정기외박 2개**, 기간이 2/3~2/9
2. 과거 날짜 휴가를 하나 등록 → **지난 휴가** 섹션이 아래에 생기고 다가오는 휴가가 위에 있다
3. 다가오는 휴가가 여러 건이면 가까운 순, 지난 휴가가 여러 건이면 최근 순
4. 이미 있는 휴가와 겹치는 기간으로 등록 → 날짜가 담긴 오류 문구로 막힌다

- [ ] **Step 5: 네이티브 web target에서 같은 것을 확인한다**

`http://localhost:8081`에서 4번까지 같은 흐름을 반복한다. 확인·메뉴·툴바는 웹에서 `lib/dialog.ts`·`action-menu.tsx`·`web-screen-actions.tsx` 래퍼를 지나므로 실제로 동작한다. `window.confirm`이 뜨면 `agent-browser dialog accept`로 넘긴다.

- [ ] **Step 6: 콘솔과 오류를 본다**

```bash
pnpm exec agent-browser console
pnpm exec agent-browser errors
pnpm exec agent-browser screenshot
```

Expected: 이번 변경과 관련된 오류 없음.

- [ ] **Step 7: 정리하고 전체 검증을 돌린다**

```bash
pnpm browser:close
pnpm check-types
pnpm lint
pnpm test          # apps/api 테스트는 자체 dev 서버를 띄운다(8799). 수동으로 띄우지 말 것
```

Expected: PASS. 웹 e2e가 깨지면 8787 상주 서버의 CORS 설정과 알려진 stale 테스트 1건을 먼저 의심한다.

- [ ] **Step 8: 커밋**

브라우저 검증에서 고친 게 있을 때만 커밋한다.

```bash
git commit -F - <<'EOF'
fix(leaves): 브라우저 확인에서 드러난 것을 고친다

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01BbjZDmVz9hfpfZKiitoEU2
EOF
```
