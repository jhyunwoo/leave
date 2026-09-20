# 달력 개인 일정 드래그와 칸 단위 길게 누르기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 네이티브 달력 탭에서 개인 일정도 휴가처럼 길게 눌러 옮기고 수정·삭제할 수 있게 하고, 길게 누르기를 재원 칩이 아니라 날짜 칸 전체가 받게 해 날짜 선택 터치와 겹치지 않게 한다.

**Architecture:** 드래그 서브시스템의 주체를 `leaveId` 하나에서 `CalendarDragSubject` 유니온으로 넓힌다. 격자 계산·두 손가락 스크롤·월 이어붙임 보정(`session.ts`, `lattice.ts`)은 끌고 있는 것이 무엇인지 모르는 코드라 그대로 재사용하고, 양 끝만 바꾼다 — 무엇을 집었나(`DayCell` + 순수 함수 `nearestGrabTarget`)와 놓았을 때 무엇을 저장하나(`useCalendarItemDrag`).

**Tech Stack:** TypeScript, pnpm workspace + turbo, Expo React Native 0.86 / react-native-gesture-handler 2.32, jotai, TanStack Query, vitest(`packages/*`, `apps/native/test`), agent-browser.

**Spec:** `docs/superpowers/specs/2026-09-20-calendar-item-drag-design.md`

## Global Constraints

- 매 태스크의 커밋 전에 해당 패키지의 게이트를 통과시킨다. 전체는 `pnpm quality`(format:check → lint → types:check → check-types → test). 패키지 단위로는 `pnpm --filter @leave/native test`, `pnpm --filter @leave/shared test`처럼 좁혀 돌린다.
- `apps/native/test`와 `packages/shared/test`는 **node 환경**이다. react-native를 import하는 모듈은 테스트에서 불러올 수 없다. 그래서 규칙은 순수 모듈로 떼어 테스트한다(`month-cell-index.ts`, `grab-target.ts`가 그런 파일이다).
- 날짜는 전부 `YYYY-MM-DD` 문자열(KST 달력 날짜)이다. `Date` 산술 대신 `@leave/shared`의 `addDays`/`diffDays`/`eachDate`/`todayInSeoul`을 쓴다.
- `packages/shared`는 플랫폼 API(fetch·React·react-native)를 쓰지 않는다. 순수 함수만 둔다.
- 주석과 커밋 메시지는 **한국어**로 쓴다. 기존 파일의 주석 밀도와 어투를 따른다 — 이 저장소는 "왜 이렇게 했는가"를 주석에 남긴다.
- `apps/native/src/lib/query-persistence.ts`의 `CACHE_BUSTER`는 **범프하지 않는다**(서버 응답 모양이 바뀌지 않는다).
- `apps/web`, 부대 일정, 개인 일정의 겹침 판정은 이 계획의 범위 밖이다.
- 커밋 메시지 끝에 다음 두 줄을 붙인다:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
  ```

## 파일 구조

| 파일                                                            | 책임                                                                 |
| --------------------------------------------------------------- | -------------------------------------------------------------------- |
| `packages/shared/src/dates.ts`                                  | `shiftDateRange` — 기간 전체를 같은 일수만큼 밀기                    |
| `apps/native/src/components/calendar-drag/grab-target.ts`       | **(새로)** 손가락 y와 항목 사각형들로 무엇을 집을지 고르는 순수 규칙 |
| `apps/native/src/state/calendar-drag.ts`                        | 드래그 상태 — 주체 유니온, 단계, 두 벌의 미리보기 atom               |
| `apps/native/src/components/calendar-drag/session.ts`           | 두 손가락 추적·격자 좌표(주체를 모른다)                              |
| `apps/native/src/components/calendar-drag/context.ts`           | 칸 → 달력 루트로 "이걸 집었다"를 넘기는 통로                         |
| `apps/native/src/components/calendar-drag/use-calendar-drag.ts` | 달력 루트 제스처, 편집 타이머, 놓기·취소                             |
| `apps/native/src/components/calendar-drag/use-day-cell-drag.ts` | 칸의 길게 누르기 인식기 (`use-leave-chip-drag.ts`에서 이름 변경)     |
| `apps/native/src/components/month-calendar.tsx`                 | 달 격자. 칸은 `DayCell`로 분리                                       |
| `apps/native/src/components/calendar-scroll.tsx`                | 달 목록. 달별 미리보기 슬라이스 전달                                 |
| `apps/native/src/screens/calendar/use-calendar-item-drag.ts`    | 미리보기 파생과 저장 (`use-leave-drag.ts`에서 이름 변경)             |
| `apps/native/src/screens/calendar/index.tsx`                    | 화면 배선, 모달 순서 규칙                                            |
| `apps/native/src/lib/dialog.ts` / `dialog.native.ts`            | 길게 누르기 편집 메뉴                                                |

---

### Task 1: 기간을 통째로 미는 순수 함수

개인 일정을 옮기는 일은 `startDate`/`endDate`를 같은 일수만큼 미는 것이 전부다. 휴가는 구간마다 재원이 달라 `shiftSegments`(`packages/shared/src/leave.ts`)가 따로 있다. 기간 하나짜리 짝을 `dates.ts`에 둔다.

**Files:**

- Modify: `packages/shared/src/dates.ts` (`addDays` 아래)
- Test: `packages/shared/test/dates.test.ts`

**Interfaces:**

- Consumes: `addDays`, `ISODate` (같은 파일)
- Produces: `shiftDateRange(range: { startDate: ISODate; endDate: ISODate }, days: number): { startDate: ISODate; endDate: ISODate }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`packages/shared/test/dates.test.ts` 맨 아래에 더한다. 파일 맨 위 import 목록에 `shiftDateRange`를 추가한다.

```ts
describe("shiftDateRange", () => {
  it("기간 전체를 같은 일수만큼 민다", () => {
    expect(
      shiftDateRange({ startDate: "2026-03-10", endDate: "2026-03-12" }, 5),
    ).toEqual({ startDate: "2026-03-15", endDate: "2026-03-17" });
  });

  it("음수면 앞으로 민다", () => {
    expect(
      shiftDateRange({ startDate: "2026-03-01", endDate: "2026-03-01" }, -1),
    ).toEqual({ startDate: "2026-02-28", endDate: "2026-02-28" });
  });

  it("달과 해의 경계를 넘어도 길이를 보존한다", () => {
    expect(
      shiftDateRange({ startDate: "2026-12-30", endDate: "2027-01-02" }, 3),
    ).toEqual({ startDate: "2027-01-02", endDate: "2027-01-05" });
  });

  it("0이면 그대로 둔다", () => {
    expect(
      shiftDateRange({ startDate: "2026-03-10", endDate: "2026-03-12" }, 0),
    ).toEqual({ startDate: "2026-03-10", endDate: "2026-03-12" });
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @leave/shared test -- dates`
Expected: FAIL — `shiftDateRange is not a function` 또는 import 오류.

- [ ] **Step 3: 구현한다**

`packages/shared/src/dates.ts`의 `addDays` 정의 바로 아래에 넣는다.

```ts
/**
 * 기간 전체를 같은 일수만큼 민다. 길이는 보존된다.
 *
 * 개인 일정을 달력에서 끌어 옮길 때 쓴다. 휴가는 구간마다 재원이 달라 구간 배열을
 * 통째로 미는 `shiftSegments`(./leave)를 따로 쓴다.
 */
export function shiftDateRange(
  range: { startDate: ISODate; endDate: ISODate },
  days: number,
): { startDate: ISODate; endDate: ISODate } {
  return {
    startDate: addDays(range.startDate, days),
    endDate: addDays(range.endDate, days),
  };
}
```

- [ ] **Step 4: 테스트가 통과하는지 본다**

Run: `pnpm --filter @leave/shared test -- dates`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/shared/src/dates.ts packages/shared/test/dates.test.ts
git commit -m "$(cat <<'EOF'
feat(shared): 기간을 통째로 미는 shiftDateRange를 더한다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 2: 손가락에 가까운 항목을 고르는 순수 규칙

칸 안에는 재원 칩과 개인 일정 알약이 세로로 쌓인다. 칩 위도 알약 위도 아닌 자리를 눌렀을 때 무엇을 집을지가 이 규칙이다. 아직 아무도 부르지 않는다 — Task 5에서 붙인다.

**Files:**

- Create: `apps/native/src/components/calendar-drag/grab-target.ts`
- Test: `apps/native/test/calendar-grab-target.test.ts`

**Interfaces:**

- Consumes: 없음(순수)
- Produces:
  - `type GrabRect = { y: number; height: number }`
  - `type GrabCandidate<T> = { subject: T; rect: GrabRect | null }`
  - `nearestGrabTarget<T>(touchY: number, candidates: readonly GrabCandidate<T>[]): T | null`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

Create `apps/native/test/calendar-grab-target.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { nearestGrabTarget } from "../src/components/calendar-drag/grab-target";

// 92px 칸 안의 실제 배치와 비슷하게 잡는다 — 날짜 줄(6~32), 재원 칩(35~49),
// 개인 일정 알약(52~66), 그 아래 출타율 알약과 여백.
const leave = { subject: "leave" as const, rect: { y: 35, height: 14 } };
const personal = { subject: "personal" as const, rect: { y: 52, height: 14 } };

describe("nearestGrabTarget", () => {
  it("칩 위를 누르면 칩을 집는다", () => {
    expect(nearestGrabTarget(40, [leave, personal])).toBe("leave");
  });

  it("알약 위를 누르면 알약을 집는다", () => {
    expect(nearestGrabTarget(60, [leave, personal])).toBe("personal");
  });

  it("둘 사이에서는 가까운 쪽을 집는다", () => {
    expect(nearestGrabTarget(50, [leave, personal])).toBe("leave");
    expect(nearestGrabTarget(51, [leave, personal])).toBe("personal");
  });

  it("날짜 숫자 위(칸 위쪽 빈 자리)에서는 위에 있는 칩을 집는다", () => {
    expect(nearestGrabTarget(10, [leave, personal])).toBe("leave");
  });

  it("칸 아래 빈 자리에서는 아래에 있는 알약을 집는다", () => {
    expect(nearestGrabTarget(88, [leave, personal])).toBe("personal");
  });

  it("거리가 같으면 칸에서 위에 그려진 쪽이 이긴다", () => {
    // 칩 아래 모서리(49)와 알약 위 모서리(52)에서 같은 거리.
    expect(nearestGrabTarget(50.5, [leave, personal])).toBe("leave");
  });

  it("후보가 하나면 어디를 눌러도 그것을 집는다", () => {
    expect(nearestGrabTarget(0, [personal])).toBe("personal");
    expect(nearestGrabTarget(91, [personal])).toBe("personal");
  });

  it("후보가 없으면 아무것도 집지 않는다", () => {
    expect(nearestGrabTarget(40, [])).toBeNull();
  });

  it("레이아웃이 아직 없는 후보는 건너뛴다", () => {
    expect(
      nearestGrabTarget(40, [{ subject: "leave", rect: null }, personal]),
    ).toBe("personal");
  });

  it("레이아웃이 하나도 없으면 첫 후보로 떨어진다", () => {
    expect(
      nearestGrabTarget(40, [
        { subject: "leave", rect: null },
        { subject: "personal", rect: null },
      ]),
    ).toBe("leave");
  });
});
```

- [ ] **Step 2: 테스트가 실패하는지 본다**

Run: `pnpm --filter @leave/native test -- calendar-grab-target`
Expected: FAIL — 모듈을 찾을 수 없다.

- [ ] **Step 3: 구현한다**

Create `apps/native/src/components/calendar-drag/grab-target.ts`:

```ts
/**
 * 날짜 칸을 길게 눌렀을 때 무엇을 집을지 — 순수 부분.
 *
 * 사용처: components/calendar-drag/use-day-cell-drag.ts.
 *
 * 길게 누르기는 칩이 아니라 **칸 전체**가 받는다. 11px 알약을 휴대폰에서 정확히
 * 짚기 어려워, 빗나가면 드래그 대신 날짜가 선택되어 버렸기 때문이다. 날짜 선택은
 * 언제나 짧은 탭이므로 "길게 눌렀다"는 신호는 그 날의 일정을 집으려는 뜻으로 읽어도
 * 된다.
 *
 * 칸 안에는 재원 칩과 개인 일정 알약이 세로로 쌓인다. 둘 다 있는 칸에서 어느 쪽도
 * 아닌 자리를 누르면 **손가락에 가까운 쪽**을 집는다. 알약 위를 직접 누르면 거리가
 * 0이라 자연히 그것이 이긴다.
 *
 * 컴포넌트에서 떼어 둔 이유는 `month-cell-index.ts`와 같다 — 숫자 몇 개에서 나오는
 * 순수 함수라 화면이 필요 없고, `apps/native/test`는 node 환경이라 react-native를
 * 불러올 수 없다.
 */

/** 칸 안에서 항목이 차지한 세로 구간. `onLayout`의 `layout`에서 그대로 온다. */
export type GrabRect = { y: number; height: number };

/** 집을 수 있는 항목 하나. 아직 레이아웃이 오지 않았으면 `rect`가 null이다. */
export type GrabCandidate<T> = { subject: T; rect: GrabRect | null };

/** 손가락에서 구간까지의 거리. 구간 안이면 0이다. */
function distanceTo(touchY: number, rect: GrabRect): number {
  if (touchY < rect.y) return rect.y - touchY;
  const bottom = rect.y + rect.height;
  return touchY > bottom ? touchY - bottom : 0;
}

/**
 * 손가락에 가장 가까운 후보. 거리가 같으면 **앞선 후보**가 이긴다 — 호출자가 칸에서
 * 위에 그려진 순서로 넘기므로, 칩과 알약의 딱 중간을 누르면 칩이 집힌다.
 *
 * 레이아웃이 아직 없는 후보는 건너뛰되, **전부** 없으면 첫 후보를 돌려준다. 칸이
 * 그려진 직후 첫 손가락이 아무것도 집지 못하는 쪽보다 낫다.
 */
export function nearestGrabTarget<T>(
  touchY: number,
  candidates: readonly GrabCandidate<T>[],
): T | null {
  let best: { subject: T; distance: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.rect) continue;
    const distance = distanceTo(touchY, candidate.rect);
    if (!best || distance < best.distance)
      best = { subject: candidate.subject, distance };
  }
  if (best) return best.subject;
  return candidates[0]?.subject ?? null;
}
```

- [ ] **Step 4: 테스트가 통과하는지 본다**

Run: `pnpm --filter @leave/native test -- calendar-grab-target`
Expected: PASS (10개)

- [ ] **Step 5: 커밋**

```bash
git add apps/native/src/components/calendar-drag/grab-target.ts apps/native/test/calendar-grab-target.test.ts
git commit -m "$(cat <<'EOF'
feat(native): 칸에서 손가락에 가까운 일정을 고르는 규칙을 더한다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 3: 드래그 주체를 `subject`로 일반화한다

동작은 하나도 바뀌지 않는다. `leaveId: string` 자리에 유니온을 넣는 순수 리팩터다. 이걸 먼저 해 두면 뒤의 모든 태스크가 한 상태 위에서 움직인다.

**Files:**

- Modify: `apps/native/src/state/calendar-drag.ts`
- Modify: `apps/native/src/components/calendar-drag/session.ts:29-60`
- Modify: `apps/native/src/components/calendar-drag/context.ts:6-10`
- Modify: `apps/native/src/components/calendar-drag/use-calendar-drag.ts:89-130`
- Modify: `apps/native/src/components/calendar-drag/use-leave-chip-drag.ts:47-52`
- Modify: `apps/native/src/screens/calendar/use-leave-drag.ts:107-113`
- Test: `apps/native/test/calendar-drag-session.test.ts:13-14`
- Test: `apps/native/test/calendar-drag-gesture.test.mjs:88-136`

**Interfaces:**

- Consumes: 없음
- Produces:
  - `type CalendarDragSubject = { kind: "leave"; leaveId: string } | { kind: "personalEvent"; eventId: string }`
  - `type CalendarDragPhase = "dragging" | "editing" | "dropped" | "saving"` (`LeaveDragPhase`에서 이름 변경)
  - `type CalendarDrag` (`LeaveDrag`에서 이름 변경) — `leaveId` 대신 `subject: CalendarDragSubject`
  - `new CalendarDragSession(subject: CalendarDragSubject, date, start, metrics, scrollOffset)`
  - `CalendarDragContext`의 `begin(subject: CalendarDragSubject, date: ISODate, touch: CalendarTouch): void`

- [ ] **Step 1: 상태 타입을 바꾼다**

`apps/native/src/state/calendar-drag.ts`에서 `LeaveDragPhase`/`LeaveDrag` 블록을 다음으로 바꾼다. `LeaveDragVerdict`와 `LeaveDragDay`는 이름도 내용도 그대로 둔다 — 겹침 판정과 재원 칩은 휴가만의 개념이다.

```ts
/**
 * 달력에서 끌 수 있는 것.
 *
 * 세션·격자·두 손가락 스크롤(`components/calendar-drag/`)은 이게 무엇인지 **모른다**.
 * 아는 쪽은 양 끝뿐이다 — 무엇을 집었는지 정하는 칸과, 놓였을 때 저장하는 화면.
 */
export type CalendarDragSubject =
  | { kind: "leave"; leaveId: string }
  | { kind: "personalEvent"; eventId: string };

export type CalendarDragPhase =
  /** 손가락이 아직 화면에 있다. */
  | "dragging"
  /** 이동 없이 길게 누르고 놓았다. 편집 옵션을 연다. */
  | "editing"
  /** 손을 뗐다. 달력 화면이 이 상태를 보고 저장을 시작한다. */
  | "dropped"
  /** 서버에 보내는 중. 미리보기를 그대로 둔 채 기다린다. */
  | "saving";

export type CalendarDrag = {
  subject: CalendarDragSubject;
  /** 집어 든 칸의 날짜. 이동량은 이 날짜를 기준으로 잰다. */
  grabDate: ISODate;
  /** 지금 놓이게 될 날짜. 놓을 수 없는 자리 위면 null. */
  hoverDate: ISODate | null;
  /** 항목 전체가 밀려날 일수. */
  deltaDays: number;
  /** 손떨림을 넘는 이동이나 두 번째 손가락 스크롤을 한 적이 있는가. */
  hasMoved: boolean;
  phase: CalendarDragPhase;
};
```

같은 파일에서 뒤따르는 참조를 고친다:

- `LeaveDragDay`의 `phase: LeaveDragPhase` → `phase: CalendarDragPhase`
- `export const calendarDragAtom = atom<LeaveDrag | null>(null);` → `atom<CalendarDrag | null>(null)`

- [ ] **Step 2: 세션이 주체를 그대로 들고 다니게 한다**

`apps/native/src/components/calendar-drag/session.ts`:

- import를 `import type { CalendarDrag, CalendarDragSubject, CalendarGridMetrics } from "@/state/calendar-drag";`로 바꾼다(기존 `LeaveDrag` 자리).
- `readonly drag: LeaveDrag;` → `readonly drag: CalendarDrag;`
- 생성자 첫 인자를 바꾼다:

```ts
  constructor(
    subject: CalendarDragSubject,
    date: ISODate,
    private readonly start: CalendarTouch,
    metrics: CalendarGridMetrics,
    scrollOffset: number,
  ) {
```

- `this.drag = { leaveId, ... }` → `this.drag = { subject, ... }`

- [ ] **Step 3: 통로와 루트 제스처의 시그니처를 바꾼다**

`apps/native/src/components/calendar-drag/context.ts`:

```ts
import type { CalendarDragSubject } from "@/state/calendar-drag";

export const CalendarDragContext = createContext<{
  gesture: ManualGesture;
  begin: (
    subject: CalendarDragSubject,
    date: ISODate,
    touch: CalendarTouch,
  ) => void;
} | null>(null);
```

`apps/native/src/components/calendar-drag/use-calendar-drag.ts`의 `begin`:

```ts
  const begin = useCallback(
    (subject: CalendarDragSubject, date: ISODate, touch: CalendarTouch) => {
      const metrics = store.get(calendarGridMetricsAtom);
      if (
        !metrics ||
        !metrics.months.includes(date.slice(0, 7)) ||
        store.get(calendarDragAtom)
      )
        return;
      session.current = new CalendarDragSession(
        subject,
        date,
        touch,
        metrics,
        offset.current,
      );
```

(나머지 본문은 그대로.) 같은 파일 import에 `type CalendarDragSubject`를 더한다.

- [ ] **Step 4: 칩 훅이 유니온을 넘기게 한다**

`apps/native/src/components/calendar-drag/use-leave-chip-drag.ts`의 `onStart`:

```ts
      .onStart(() => {
        if (leaveId && pointer.touch)
          context?.begin({ kind: "leave", leaveId }, date, pointer.touch);
      })
```

- [ ] **Step 5: 화면 훅이 유니온에서 휴가를 꺼내게 한다**

`apps/native/src/screens/calendar/use-leave-drag.ts`의 `leave` useMemo:

```ts
const leave = useMemo(() => {
  if (!drag || drag.subject.kind !== "leave") return null;
  const { leaveId } = drag.subject;
  return leaves?.find((it) => it.id === leaveId) ?? null;
}, [drag, leaves]);
```

- [ ] **Step 6: 테스트를 갱신한다**

`apps/native/test/calendar-drag-session.test.ts`의 `begin()`:

```ts
function begin() {
  return new CalendarDragSession(
    { kind: "leave", leaveId: "leave-1" },
    "2026-01-15",
    primary,
    metrics,
    0,
  );
}
```

`apps/native/test/calendar-drag-gesture.test.mjs`에서 `begin`을 확인하는 네 군데의 기대값을 바꾼다. `"leave-1"` 자리를 `{ kind: "leave", leaveId: "leave-1" }`로:

```js
expect(begin).toHaveBeenCalledExactlyOnceWith(
  { kind: "leave", leaveId: "leave-1" },
  "2026-09-07",
  touch,
);
```

마지막 테스트의 `toHaveBeenLastCalledWith`도 같은 모양으로 바꾼다.

- [ ] **Step 7: 타입과 테스트를 돌린다**

Run: `pnpm --filter @leave/native test && pnpm --filter @leave/native check-types`
Expected: PASS. 실패하면 `LeaveDrag`/`LeaveDragPhase`를 아직 참조하는 곳이 남은 것이다 — `grep -rn "LeaveDragPhase\|LeaveDrag\b" apps/native/src`로 찾는다.

- [ ] **Step 8: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
refactor(native): 달력 드래그의 주체를 휴가에서 유니온으로 넓힌다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 4: 움직이지 않은 길게 누르기를 날짜 선택으로 되돌린다

Task 5에서 칸 전체가 길게 누르기를 받게 되면, "조금 느리게 눌렀는데 아무 일도 일어나지 않는" 칸이 생긴다. 그건 고장으로 읽힌다. 250ms~1초 사이에 움직이지 않고 손을 떼면 날짜 선택으로 되돌린다.

억제 플래그(`isDragPressSuppressed`)를 푸는 방식은 쓰지 않는다 — 제스처가 활성화된 뒤에도 RN `Pressable`이 `onPress`를 쏘는지에 기대게 된다. 대신 드래그 단계로 **명시적으로** 알린다.

이 태스크에서 화면 훅의 이름도 바꾼다. 더 이상 휴가 전용이 아니고, Task 9에서 개인 일정 분기가 들어올 자리다.

**Files:**

- Modify: `apps/native/src/state/calendar-drag.ts` (`CalendarDragPhase`)
- Modify: `apps/native/src/components/calendar-drag/use-calendar-drag.ts:160-185` (`release`)
- Rename: `apps/native/src/screens/calendar/use-leave-drag.ts` → `apps/native/src/screens/calendar/use-calendar-item-drag.ts`
- Modify: `apps/native/src/screens/calendar/index.tsx:87`(import), `:218`(호출)

**Interfaces:**

- Consumes: `CalendarDrag`, `calendarDragAtom` (Task 3)
- Produces:
  - `CalendarDragPhase`에 `"tapped"` 추가
  - ```ts
    useCalendarItemDrag(options: {
      leaves: readonly MyLeave[] | undefined;
      onEditLeave: (leave: MyLeave) => void;
      onSelectDate: (date: ISODate) => void;
    }): { isDragging: boolean; statusLabel: string | null }
    ```

- [ ] **Step 1: 단계를 더한다**

`apps/native/src/state/calendar-drag.ts`의 `CalendarDragPhase`에 한 갈래를 더한다.

```ts
  /** 서버에 보내는 중. 미리보기를 그대로 둔 채 기다린다. */
  | "saving"
  /**
   * 움직이지 않고 편집 타이머(1초)가 울리기 전에 손을 뗐다.
   *
   * 칸 전체가 길게 누르기를 받으므로, 여기서 아무 일도 하지 않으면 "조금 느리게
   * 눌렀더니 반응이 없는" 칸이 된다. 화면이 이 단계를 보고 날짜 선택으로 되돌린다.
   */
  | "tapped";
```

- [ ] **Step 2: 취소를 `tapped`로 바꾼다**

`apps/native/src/components/calendar-drag/use-calendar-drag.ts`의 `release` 끝부분:

```ts
store.set(
  calendarDragAtom,
  result === "cancel"
    ? { ...current.drag, phase: "tapped" }
    : { ...current.drag, phase: "dropped" },
);
```

`cancel()`(제스처가 취소되거나 끝난 경우)은 그대로 `null`로 둔다 — 그건 손을 뗀 것이 아니라 인식기가 죽은 경우다.

- [ ] **Step 3: 화면 훅의 이름과 시그니처를 바꾼다**

```bash
git mv apps/native/src/screens/calendar/use-leave-drag.ts apps/native/src/screens/calendar/use-calendar-item-drag.ts
```

파일 상단 주석의 첫 줄을 바꾼다:

```ts
/**
 * 달력에서 끌어 옮긴 항목을 미리 보여주고, 놓이면 저장한다.
 *
 * 사용처: screens/calendar/index.tsx.
 *
 * 제스처(components/calendar-drag)는 "무엇을 며칠 옮기는 중"까지만 안다.
 * 휴가 목록과 저장을 쥔 쪽은 달력 화면이므로, 겹침 판정·미리보기·저장은 여기서 한다.
 */
```

시그니처를 옵션 객체로 바꾼다:

```ts
export function useCalendarItemDrag(options: {
  leaves: readonly MyLeave[] | undefined;
  /** 휴가 편집. 화면이 모달 순서 규칙을 지켜 연다. */
  onEditLeave: (leave: MyLeave) => void;
  /** 움직이지 않고 손을 뗐을 때. 짧은 탭과 같이 그날을 고른다. */
  onSelectDate: (date: ISODate) => void;
}): {
  /** 지금 무언가를 끌고 있는지. */
  isDragging: boolean;
  /** 끄는 동안 머리말 줄에 대신 띄울 안내. 드래그가 없으면 null. */
  statusLabel: string | null;
} {
  const { leaves, onEditLeave, onSelectDate } = options;
```

본문에서 `onEdit(leave)` 호출을 `onEditLeave(leave)`로 바꾸고, 저장 효과의 의존성 배열 끝 `onEdit`을 `onEditLeave`로 바꾼다.

- [ ] **Step 4: `tapped`를 처리하는 효과를 더한다**

저장 효과(`// 손을 뗐다. 여기서 실제로 저장한다.`) **바로 앞**에 넣는다. 저장 효과보다 먼저 두는 이유는 읽는 순서다 — 두 효과는 서로 다른 `phase`만 보므로 실행 순서에 의존하지 않는다.

```ts
// 움직이지 않고 손을 뗐다. 짧은 탭과 같이 그날을 고르고 드래그를 접는다.
useEffect(() => {
  if (drag?.phase !== "tapped") return;
  onSelectDate(drag.grabDate);
  setDrag(null);
}, [drag, onSelectDate, setDrag]);
```

- [ ] **Step 5: 화면에서 배선한다**

`apps/native/src/screens/calendar/index.tsx`:

import를 바꾼다.

```ts
import { useCalendarItemDrag } from "./use-calendar-item-drag";
```

호출을 바꾼다(기존 `const leaveDrag = useLeaveDrag(...)` 자리).

```ts
// 달력에서 일정을 길게 눌러 다른 날짜로 옮기는 조작. 미리보기와 저장을 맡는다.
const itemDrag = useCalendarItemDrag({
  leaves: myLeaves.data?.leaves,
  onEditLeave: setEditingLeave,
  onSelectDate: selectDate,
});
```

같은 파일에서 `leaveDrag.`를 쓰는 곳을 모두 `itemDrag.`로 바꾼다.

Run: `grep -n "leaveDrag" apps/native/src/screens/calendar/index.tsx`
Expected: 결과 없음.

- [ ] **Step 6: 타입과 테스트를 돌린다**

Run: `pnpm --filter @leave/native test && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
fix(native): 움직이지 않은 길게 누르기를 날짜 선택으로 되돌린다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 5: 길게 누르기를 칩에서 칸으로 올린다

이 태스크가 문제 2를 고친다. 아직 개인 일정은 다루지 않는다 — 후보가 휴가 하나뿐인 상태로 칸 제스처를 완성한다.

**Files:**

- Rename: `apps/native/src/components/calendar-drag/use-leave-chip-drag.ts` → `apps/native/src/components/calendar-drag/use-day-cell-drag.ts`
- Modify: `apps/native/src/components/month-calendar.tsx` (칸을 `DayCell`로 분리, `MyLeaveChip`에서 제스처 제거)
- Test: `apps/native/test/calendar-drag-gesture.test.mjs` (대상 경로·호출 모양)

**Interfaces:**

- Consumes: `nearestGrabTarget`, `GrabRect`, `GrabCandidate` (Task 2), `CalendarDragSubject` (Task 3)
- Produces:
  - ```ts
    type DayCellSlot = "leave" | "personal";
    type DayCellSubject = { slot: DayCellSlot; subject: CalendarDragSubject };
    type DayCellRects = Partial<Record<DayCellSlot, GrabRect>>;
    useDayCellDrag(args: {
      subjects: readonly DayCellSubject[];
      rects: React.RefObject<DayCellRects>;
      date: ISODate;
      scrollGesture: NativeGesture | null;
    }): PanGesture;
    ```
  - `month-calendar.tsx`의 `isDragPressSuppressed`/`noteCalendarPressStart` 재수출 경로가 `./use-day-cell-drag`로 바뀐다.

- [ ] **Step 1: 훅의 이름을 바꾸고 후보 해석을 넣는다**

```bash
git mv apps/native/src/components/calendar-drag/use-leave-chip-drag.ts apps/native/src/components/calendar-drag/use-day-cell-drag.ts
```

파일 전체를 다음으로 바꾼다.

```ts
/**
 * 날짜 칸의 길게 누르기 인식기.
 *
 * 칸에서는 길게 누르기만 인식한다. 활성화 뒤의 터치는 달력 루트가 맡아서,
 * 다른 달로 스크롤하며 이 칸이 언마운트되어도 드래그가 계속된다.
 *
 * 인식기가 **칸**에 붙는 것이 중요하다. 예전에는 재원 칩(11px 알약)에만 붙어 있어,
 * 92px 칸 안에서 조금만 빗나가면 드래그가 시작되지 않고 손을 떼는 순간 날짜가
 * 선택되어 버렸다. 무엇을 집을지는 손가락 위치로 정한다(`grab-target.ts`).
 */
import type { ISODate } from "@leave/shared/dates";
import { useContext, useMemo } from "react";
import {
  Gesture,
  type NativeGesture,
  type PanGesture,
} from "react-native-gesture-handler";
// 값이 아니라 타입만 가져온다. 이 줄은 컴파일에서 지워져 테스트의 require 셰임에
// 새 항목이 필요 없다.
import type { TouchData } from "react-native-gesture-handler";
import type { CalendarDragSubject } from "@/state/calendar-drag";
import { CalendarDragContext } from "./context";
import { nearestGrabTarget, type GrabRect } from "./grab-target";

export { isDragPressSuppressed, noteCalendarPressStart } from "./context";

/** 칸 안에서 항목이 놓이는 자리. 위에서 아래 순서다. */
export type DayCellSlot = "leave" | "personal";

export type DayCellSubject = {
  slot: DayCellSlot;
  subject: CalendarDragSubject;
};

/** 자리별 칸 안 세로 구간. 각 항목의 `onLayout`이 채운다. */
export type DayCellRects = Partial<Record<DayCellSlot, GrabRect>>;

export function useDayCellDrag(args: {
  /** 이 칸에서 집을 수 있는 것들. 칸에서 **위에 그려진 순서**로 넘긴다. */
  subjects: readonly DayCellSubject[];
  /**
   * 자리별 사각형을 담은 ref. `onLayout`이 값을 채우고 `onStart`가 읽는다.
   * 값이 아니라 ref인 이유는 제스처를 다시 만들지 않기 위해서다 — 인스턴스가
   * 바뀌면 RNGH의 `blocksExternalGesture` 관계가 매번 다시 맺어진다.
   */
  rects: React.RefObject<DayCellRects>;
  date: ISODate;
  scrollGesture: NativeGesture | null;
}): PanGesture {
  const { subjects, rects, date, scrollGesture } = args;
  const context = useContext(CalendarDragContext);
  return useMemo(() => {
    // runOnJS(true)여도 Expo는 인라인 콜백을 worklet factory로 변환한다.
    // let touch를 쓰면 onStart가 초기 null을 값으로 캡처한다. 같은 객체를
    // 공유해야 onTouchesDown이 기록한 실제 손가락을 onStart에서도 읽는다.
    const pointer: { touch: TouchData | null } = { touch: null };
    const pan = Gesture.Pan()
      .enabled(subjects.length > 0 && scrollGesture != null && context != null)
      // minDistance를 주면 길게 누르기 타이머보다 먼저 활성화되므로 설정하지 않는다.
      .activateAfterLongPress(250)
      .runOnJS(true)
      .onTouchesDown((event) => {
        pointer.touch ??= event.changedTouches[0] ?? null;
      })
      .onStart(() => {
        const touch = pointer.touch;
        if (!touch || !context) return;
        // y는 제스처가 붙은 뷰(= 칸) 기준이고, rects도 칸의 자식 레이아웃이라
        // 같은 기준계다. measure() 없이 바로 견줄 수 있다.
        const subject = nearestGrabTarget(
          touch.y,
          subjects.map((entry) => ({
            subject: entry.subject,
            rect: rects.current[entry.slot] ?? null,
          })),
        );
        if (subject) context.begin(subject, date, touch);
      })
      .onFinalize(() => {
        pointer.touch = null;
      });
    if (context) pan.simultaneousWithExternalGesture(context.gesture);
    return scrollGesture ? pan.blocksExternalGesture(scrollGesture) : pan;
  }, [subjects, rects, date, scrollGesture, context]);
}
```

- [ ] **Step 2: 칸을 `DayCell`로 떼어낸다**

`apps/native/src/components/month-calendar.tsx`에서:

1. `MonthCalendarImpl`의 주 배열 `.map` 안에 있는 `<Pressable key={cell.date} …>` 부터 `</Pressable>`까지(현재 298–536행)를 **그대로** 잘라내고, 그 자리에 `<DayCell … />` 호출을 넣는다.
2. 잘라낸 JSX를 새 함수 `DayCell`의 반환값으로 옮긴다. 옮긴 뒤 본문에서 쓰던 지역 변수 가운데 **`.map` 밖의 표(`statByDate`·`unitEventsByDate`·`personalByDate`·`myLeaveDays`·`attendeePreview`·`outingStartsByDate`·`cycles`)에서 뽑던 값들만** props로 받는다. 나머지는 `DayCell` 안에서 지금과 **똑같은 식으로** 계산한다 — `signal`, `exceeded`, `blocked`, `isToday`, `dayNum`, `weekend`, `holiday`, `hasUnitHoliday`, `eventLabel`, `calendarLabel`, 그리고 `accessibilityLabel` 문자열 전체.

`MonthCalendarImpl` 안에서만 쓰이게 된 `props.selectedDate`/`props.dischargeAt`/`props.cellHeight` 등은 그대로 두고, `styles`·`colors`·`balance`는 `DayCell`에서 다시 `useStyles()`/`useTheme()`으로 얻는다(두 훅 모두 컨텍스트 조회라 칸마다 불러도 새 객체를 만들지 않는다).

`.map` 안에 남는 것 — 날짜별로 표를 뒤지는 부분만 남기고 나머지는 `DayCell`로 간다:

```tsx
{
  week.map((cell) => {
    const pastDischarge = dischargeAt != null && cell.date > dischargeAt;
    return (
      <DayCell
        key={cell.date}
        cell={cell}
        compact={compact ?? false}
        cellHeight={cellHeight}
        today={today}
        isSelected={cell.date === selectedDate}
        onSelectDate={onSelectDate}
        stat={cell.inMonth ? statByDate.get(cell.date) : undefined}
        unitEvents={
          cell.inMonth
            ? (unitEventsByDate.get(cell.date) ?? EMPTY_UNIT_EVENTS)
            : EMPTY_UNIT_EVENTS
        }
        personal={
          cell.inMonth
            ? (personalByDate.get(cell.date) ?? EMPTY_PERSONAL_EVENTS)
            : EMPTY_PERSONAL_EVENTS
        }
        mine={cell.inMonth ? myLeaveDays?.get(cell.date) : undefined}
        dragDay={cell.inMonth ? dragPreview?.get(cell.date) : undefined}
        isDischarge={
          cell.inMonth && dischargeAt != null && cell.date === dischargeAt
        }
        inCycle={
          cell.inMonth &&
          !pastDischarge &&
          currentCycle != null &&
          currentCycle.start <= cell.date &&
          cell.date <= currentCycle.end
        }
        cycle={
          cell.inMonth && !pastDischarge
            ? cycles?.find((c) => c.start <= cell.date && cell.date <= c.end)
            : undefined
        }
        outingStarts={
          cell.inMonth && !pastDischarge && !compact
            ? (outingStartsByDate.get(cell.date) ?? EMPTY_OUTING_STARTS)
            : EMPTY_OUTING_STARTS
        }
        attendeePreview={
          cell.inMonth && showAttendees
            ? attendeePreview.get(cell.date)
            : undefined
        }
        dragScrollGesture={props.dragScrollGesture ?? null}
      />
    );
  });
}
```

파일 위쪽 상수 옆에 빈 배열 상수를 더한다(매 렌더 새 배열을 만들지 않기 위해서다 — `EMPTY_UNIT_EVENTS`가 이미 같은 이유로 있다):

```ts
const EMPTY_OUTING_STARTS: readonly OutingCycleStart[] = [];
```

- [ ] **Step 3: `DayCell`을 쓴다**

`MonthCalendar = memo(MonthCalendarImpl)` 아래, `MyLeaveChip` 위에 넣는다.

```tsx
/**
 * 날짜 칸 하나.
 *
 * 길게 누르기 인식기가 여기 붙는다 — 칩이 아니라 칸이다. 11px 알약을 휴대폰에서
 * 정확히 짚기 어려워, 빗나가면 드래그 대신 날짜가 선택되어 버렸다. 무엇을 집을지는
 * 손가락 위치가 정한다(`calendar-drag/grab-target.ts`).
 *
 * 제스처는 **집을 것이 있는 칸에만** 붙인다. 무한 스크롤은 대여섯 달을 동시에
 * 마운트하므로 빈 칸까지 달면 네이티브 인식기가 250개를 넘는다. 판정은 저장된
 * 데이터로만 한다 — 드래그 덧그림을 섞으면 끌고 가는 도중에 목적지 칸의 트리 모양이
 * 바뀌어 Pressable이 리마운트된다.
 */
function DayCell(props: {
  cell: { date: ISODate; inMonth: boolean };
  compact: boolean;
  cellHeight: number;
  today: ISODate;
  isSelected: boolean;
  onSelectDate: (date: ISODate) => void;
  stat: Calendar["days"][number] | undefined;
  unitEvents: readonly UnitCalendarEvent[];
  personal: readonly PersonalEvent[];
  mine: MyLeaveDay | undefined;
  dragDay: LeaveDragDay | undefined;
  isDischarge: boolean;
  inCycle: boolean;
  cycle: RegularOvernightCycle | undefined;
  outingStarts: readonly OutingCycleStart[];
  attendeePreview: { initials: string[]; total: number } | undefined;
  dragScrollGesture: NativeGesture | null;
}) {
  // 옮겨 온 JSX가 바꾸지 않고 그대로 쓰도록 전부 풀어 둔다.
  const {
    cell,
    compact,
    cellHeight,
    today,
    isSelected,
    onSelectDate,
    stat,
    unitEvents,
    personal,
    mine,
    dragDay,
    isDischarge,
    inCycle,
    cycle,
    outingStarts,
    attendeePreview,
  } = props;
  const styles = useStyles();
  const { colors, balance } = useTheme();
  // 자리별 세로 구간. onLayout이 채우고 제스처의 onStart가 읽는다. 상태로 두면
  // 레이아웃이 올 때마다 42칸이 다시 그려진다.
  const rects = useRef<DayCellRects>({});
  const leaveId =
    mine != null && isUserEditableLeaveStatus(mine.status) ? mine.leaveId : null;
  const subjects = useMemo<DayCellSubject[]>(() => {
    const list: DayCellSubject[] = [];
    if (leaveId)
      list.push({ slot: "leave", subject: { kind: "leave", leaveId } });
    return list;
  }, [leaveId]);
  const gesture = useDayCellDrag({
    subjects,
    rects,
    date: cell.date,
    scrollGesture: props.dragScrollGesture,
  });

  // …여기서부터 잘라 온 지역 변수 계산(signal, exceeded, blocked, isToday, dayNum,
  //   weekend, holiday, hasUnitHoliday, eventLabel, calendarLabel, 접근성 라벨)…

  const body = (
    <Pressable …>{/* 잘라 온 JSX 그대로 */}</Pressable>
  );
  // 집을 것이 없는 칸에는 인식기를 달지 않는다.
  return subjects.length > 0 ? (
    <GestureDetector gesture={gesture}>{body}</GestureDetector>
  ) : (
    body
  );
}
```

옮긴 JSX에서 바꿀 곳은 두 군데다.

1. `<Pressable key={cell.date}` 의 `key`를 지운다(이제 `DayCell`이 키를 받는다).
2. `<MyLeaveChip>` 호출에서 `scrollGesture`/`onTap`을 빼고 `onLayout`을 준다:

```
                    {!compact && (mine || dragDay) && (
                      <MyLeaveChip
                        mine={mine}
                        preview={dragDay}
                        onLayout={(event) => {
                          rects.current.leave = event.nativeEvent.layout;
                        }}
                      />
                    )}
```

- [ ] **Step 4: `MyLeaveChip`을 그리기 전담으로 내린다**

`MyLeaveChip`에서 `useLeaveChipDrag`·`GestureDetector`·안쪽 `Pressable`을 모두 걷어낸다. 제 눌림을 직접 받을 이유가 사라졌다 — 칸의 `Pressable`이 칩 위의 누름도 그대로 받는다.

```tsx
/**
 * 내 휴가 한 칸.
 *
 * 저장된 칸(`mine`)과 드래그 미리보기(`preview`) 어느 쪽이 와도 같은 규칙으로
 * 그린다 — 옮기는 중에도 재원 색과 이어붙임이 그대로 보여야 "이 휴가가 저기로
 * 간다"가 읽힌다. 원래 날짜에 `role: "origin"` 항목을 남겨 출발 위치를 흐리게
 * 보여준다.
 *
 * 누름은 받지 않는다. 길게 누르기도 탭도 칸(`DayCell`)이 맡는다.
 */
function MyLeaveChip(props: {
  /** 저장된 내 휴가. 옮겨 갈 자리를 덧그리는 칸에는 없다. */
  mine: MyLeaveDay | undefined;
  preview: LeaveDragDay | undefined;
  /** 칸 안 세로 위치를 칸에 알린다. 무엇을 집을지 고르는 데 쓴다. */
  onLayout: (event: LayoutChangeEvent) => void;
}) {
```

본문의 `return`을 `<GestureDetector>`/`<Pressable>` 없이 `<View>` 하나로 바꾼다. 스타일 배열은 그대로 두고 `onLayout={props.onLayout}`을 준다.

```tsx
  return (
    <View
      onLayout={props.onLayout}
      style={[
        styles.myChip,
        { backgroundColor: bg },
        …(기존 배열 그대로)…
      ]}
    >
      {day.isSegmentStart && (…기존 Text 그대로…)}
    </View>
  );
```

파일 import를 정리한다: `useLeaveChipDrag`/`GestureDetector`가 필요한 곳이 `DayCell`로 옮겨 갔다.

```ts
import { memo, useMemo, useRef } from "react";
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native";
import {
  GestureDetector,
  type NativeGesture,
} from "react-native-gesture-handler";
import { isUserEditableLeaveStatus } from "@leave/shared/leave";
import {
  isDragPressSuppressed,
  noteCalendarPressStart,
  useDayCellDrag,
  type DayCellRects,
  type DayCellSubject,
} from "@/components/calendar-drag/use-day-cell-drag";
```

- [ ] **Step 5: 제스처 테스트를 갱신한다**

`apps/native/test/calendar-drag-gesture.test.mjs`:

파일 위쪽에서 `isUserEditableLeaveStatus` import를 지운다(훅이 더 이상 그 규칙을 모른다). 대상 경로를 바꾼다.

```js
const filename = fileURLToPath(
  new URL(
    "../src/components/calendar-drag/use-day-cell-drag.ts",
    import.meta.url,
  ),
);
```

`loadGesture` 시그니처와 require 셰임·호출을 바꾼다.

```js
function loadGesture({ transform = true, subjects, rects } = {}) {
  const begin = vi.fn();
  const context = { gesture: {}, begin };
  // …(callbacks/pan 부분은 그대로)…
  const exports = {};
  runInNewContext(code, {
    exports,
    global: { Error },
    require(name) {
      if (name === "react")
        return { useContext: () => context, useMemo: (fn) => fn() };
      if (name === "react-native-gesture-handler")
        return { Gesture: { Pan: () => pan } };
      if (name === "./context") return { CalendarDragContext: {} };
      if (name === "./grab-target") return { nearestGrabTarget };
      throw new Error(`Unexpected import: ${name}`);
    },
  });
  exports.useDayCellDrag({
    subjects: subjects ?? [
      { slot: "leave", subject: { kind: "leave", leaveId: "leave-1" } },
    ],
    rects: { current: rects ?? { leave: { y: 35, height: 14 } } },
    date: "2026-09-07",
    scrollGesture: {},
  });
  return { callbacks, begin, pan };
}
```

`nearestGrabTarget`은 실제 구현을 쓴다 — 파일 위쪽에 import를 더한다.

```js
import { nearestGrabTarget } from "../src/components/calendar-drag/grab-target.ts";
```

> 이 import가 `.ts` 확장자 때문에 실패하면, vitest가 아니라 `runInNewContext`의 require 셰임 안에서 규칙을 직접 구현하지 말고 대신 테스트 파일 위쪽에서 `await import()`로 불러온다. vitest는 `.ts`를 변환해 주므로 보통은 그대로 동작한다.

기존 네 테스트의 터치 객체에 `y`를 더한다(칸 기준 좌표). 예:

```js
const touch = { id: 0, x: 24, y: 40, absoluteX: 180, absoluteY: 400 };
```

기대값은 Task 3에서 바꾼 유니온 모양 그대로다.

두 테스트를 더한다.

```js
it("집을 것이 없는 칸은 인식기를 켜지 않는다", () => {
  const { pan } = loadGesture({ subjects: [] });
  expect(pan.enabledValue).toBe(false);
});

it("빌드된 콜백이 손가락에 가까운 항목을 집는다", () => {
  const { callbacks, begin } = loadGesture({
    subjects: [
      { slot: "leave", subject: { kind: "leave", leaveId: "leave-1" } },
      { slot: "personal", subject: { kind: "personalEvent", eventId: "ev-1" } },
    ],
    rects: { leave: { y: 35, height: 14 }, personal: { y: 52, height: 14 } },
  });
  const touch = { id: 0, x: 24, y: 60, absoluteX: 180, absoluteY: 400 };
  callbacks.onTouchesDown({ changedTouches: [touch] });
  callbacks.onStart();
  expect(begin).toHaveBeenCalledExactlyOnceWith(
    { kind: "personalEvent", eventId: "ev-1" },
    "2026-09-07",
    touch,
  );
});
```

- [ ] **Step 6: 돌린다**

Run: `pnpm --filter @leave/native test && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
fix(native): 달력의 길게 누르기를 재원 칩에서 날짜 칸으로 올린다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 6: 편집 메뉴 문구를 인자로 받는다

`chooseLeaveHoldAction`은 "휴가 작업을 선택하세요."를 박아 두고 있다. 개인 일정도 같은 메뉴를 쓰므로 문구를 인자로 받게 한다. 플랫폼별 버튼 순서 규칙은 **그대로 둔다** — 안드로이드가 배열 끝을 확인 자리로 pop해 가기 때문에 순서를 뒤집어 둔 것이다.

**Files:**

- Modify: `apps/native/src/lib/dialog.native.ts:41-78`
- Modify: `apps/native/src/lib/dialog.ts:29-38`
- Modify: `apps/native/src/screens/calendar/use-calendar-item-drag.ts` (호출부)

**Interfaces:**

- Produces: `chooseHoldAction(title: string, message: string): Promise<HoldAction>`, `type HoldAction = "edit" | "delete" | "cancel"`

- [ ] **Step 1: 네이티브 구현을 바꾼다**

`apps/native/src/lib/dialog.native.ts`에서 `LeaveHoldAction` → `HoldAction`, 함수 이름과 시그니처를 바꾼다. 기존 JSDoc의 "달력 칩을" 을 "달력 칸을"로 고치고, 첫 문단 뒤에 한 줄을 더한다.

```ts
export type HoldAction = "edit" | "delete" | "cancel";

/**
 * 달력 칸을 가만히 누르고 있을 때 손을 떼기 전에 여는 편집 메뉴.
 *
 * 휴가와 개인 일정이 같은 메뉴를 쓴다. 무엇을 다루는지는 `message`가 말한다.
 *
 * **버튼 순서가 플랫폼마다 다르다.** iOS는 배열 순서대로 그리고 `cancel`을 맨 아래에
 * … (이하 기존 주석 그대로) …
 */
export function chooseHoldAction(
  title: string,
  message: string,
): Promise<HoldAction> {
  return new Promise((resolve) => {
    // …(본문 그대로, Alert.alert의 둘째 인자만 message로)…
    Alert.alert(
      title,
      message,
      Platform.OS === "android"
        ? [cancel, remove, edit]
        : [cancel, edit, remove],
      { onDismiss: () => resolve("cancel") },
    );
  });
}
```

- [ ] **Step 2: 웹 구현을 맞춘다**

`apps/native/src/lib/dialog.ts`:

```ts
export type HoldAction = "edit" | "delete" | "cancel";

export function chooseHoldAction(
  title: string,
  message: string,
): Promise<HoldAction> {
  const answer = globalThis.prompt(`${title}\n\n${message}`);
  if (answer === "수정") return Promise.resolve("edit");
  if (answer === "삭제") return Promise.resolve("delete");
  return Promise.resolve("cancel");
}
```

- [ ] **Step 3: 호출부를 고친다**

`apps/native/src/screens/calendar/use-calendar-item-drag.ts`:

- import를 `import { chooseHoldAction, confirmAction, notify } from "@/lib/dialog";`로 바꾼다.
- `const action = await chooseLeaveHoldAction(leave.title);` → `const action = await chooseHoldAction(leave.title, "휴가 작업을 선택하세요.");`

Run: `grep -rn "chooseLeaveHoldAction\|LeaveHoldAction" apps/native/src`
Expected: 결과 없음.

- [ ] **Step 4: 돌린다**

Run: `pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
refactor(native): 길게 누르기 편집 메뉴가 문구를 인자로 받는다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 7: 개인 일정 알약의 덧그림을 그린다

미리보기를 **그리는 쪽**만 먼저 만든다. 아직 이 atom을 채우는 곳이 없어 화면은 그대로다 — Task 9에서 생산자가 붙는다.

**Files:**

- Modify: `apps/native/src/state/calendar-drag.ts`
- Modify: `apps/native/src/components/month-calendar.tsx` (`useMonthPersonalDragPreview`, `MonthCalendar` prop, `DayCell` 알약)
- Modify: `apps/native/src/components/calendar-scroll.tsx:339`(MonthBlock), `:372`(prop)

**Interfaces:**

- Consumes: `CalendarDragPhase` (Task 3), `PersonalEvent` (`@leave/client`)
- Produces:
  - `type PersonalEventDragDay = { event: PersonalEvent; role: "origin" | "target"; phase: CalendarDragPhase }`
  - `personalEventDragPreviewAtom: PrimitiveAtom<Map<ISODate, PersonalEventDragDay> | null>`
  - `useMonthPersonalDragPreview(month: string): Map<ISODate, PersonalEventDragDay> | null`
  - `MonthCalendar`의 새 prop `personalDragPreview?: Map<ISODate, PersonalEventDragDay> | null`

- [ ] **Step 1: 상태를 더한다**

`apps/native/src/state/calendar-drag.ts` 맨 아래, `calendarDragPreviewAtom` 아래에 더한다. import에 `PersonalEvent`를 추가한다(`import type { MyLeaveDay, PersonalEvent } from "@leave/client";`).

```ts
/**
 * 옮기는 중인 개인 일정이 걸치는 칸 하나.
 *
 * 재원 칩과 atom을 나눠 둔 것이 중요하다. 하나로 묶으면 개인 일정을 끄는 동안
 * hover가 바뀔 때마다 휴가 칩까지 모든 칸에서 다시 그려진다.
 */
export type PersonalEventDragDay = {
  event: PersonalEvent;
  /** 원래 자리인지, 옮겨 갈 자리인지. 두 자리가 겹치면 target이 이긴다. */
  role: "origin" | "target";
  phase: CalendarDragPhase;
};

export const personalEventDragPreviewAtom = atom<Map<
  ISODate,
  PersonalEventDragDay
> | null>(null);
```

- [ ] **Step 2: 달별로 좁히는 훅을 더한다**

`apps/native/src/components/month-calendar.tsx`의 `useMonthDragPreview` 바로 아래에 넣는다.

```ts
/** 개인 일정 덧그림의 같은 짝. 나눠 둔 이유는 atom 주석에 있다. */
export function useMonthPersonalDragPreview(
  month: string,
): Map<ISODate, PersonalEventDragDay> | null {
  const preview = useAtomValue(personalEventDragPreviewAtom);
  return useMemo(() => sliceMonthPreview(preview, month), [preview, month]);
}
```

`MonthCalendarImpl`의 props에 더한다(`dragPreview` 바로 아래).

```ts
  /** 이 달에 걸친 개인 일정 덧그림. `dragPreview`와 같은 이유로 달별로 좁혀 넘긴다. */
  personalDragPreview?: Map<ISODate, PersonalEventDragDay> | null;
```

`.map` 안에서 칸에 넘긴다(Task 5에서 만든 `<DayCell …>` 호출에 한 줄 추가).

```tsx
                personalDrag={
                  cell.inMonth
                    ? (props.personalDragPreview?.get(cell.date) ?? undefined)
                    : undefined
                }
```

- [ ] **Step 3: 칸이 알약을 덧그리게 한다**

`DayCell` props에 `personalDrag: PersonalEventDragDay | undefined;`를 더한다.

칸 본문의 개인 일정 알약 블록을 바꾼다. 기존:

```tsx
                    {!compact && personal.length > 0 && (
                      <View style={styles.personalPill}>
```

바꾼 뒤 — 알약 블록 **앞에** 목록 합성을 두고, `View`에 스타일과 `onLayout`을 더한다:

```
                    {/* 도착 칸에서는 끌고 있는 일정을 맨 앞에 끼워 그 제목이
                        보이게 한다. 출발 칸은 저장된 목록에 아직 그 일정이 들어
                        있으므로 그대로 두고 알약만 흐리게 그린다 — 하루에 일정이
                        여럿인 출발 칸은 알약 하나가 통째로 흐려지지만, 알약은 한
                        줄뿐이고 칸 높이 예산에 여유가 없어 쪼갤 수 없다. */}
                    {!compact && personalForLabel.length > 0 && (
                      <View
                        onLayout={(event) => {
                          rects.current.personal = event.nativeEvent.layout;
                        }}
                        style={[
                          styles.personalPill,
                          personalDrag?.role === "origin" && styles.pillLifted,
                          personalDrag?.role === "target" && styles.pillTarget,
                          personalDrag?.phase === "saving" && styles.chipSaving,
                        ]}
                      >
                        <Text
                          style={styles.personalText}
                          numberOfLines={1}
                          ellipsizeMode="tail"
                        >
                          {personalEventCellLabel(personalForLabel)}
                        </Text>
                      </View>
                    )}
```

`DayCell` 본문 위쪽(지역 변수 계산 구간)에 합성을 둔다:

`personalDrag`도 Step 2에서 넓힌 props 구조 분해에 더한다.

```tsx
const personalForLabel = useMemo(
  () =>
    personalDrag?.role === "target"
      ? [
          personalDrag.event,
          ...personal.filter((it) => it.id !== personalDrag.event.id),
        ]
      : personal,
  [personalDrag, personal],
);
```

스타일을 더한다(`chipSaving` 아래).

```ts
  /** 집어 든 개인 일정의 원래 자리. 재원 칩의 chipLifted와 같은 규칙이다. */
  pillLifted: { opacity: 0.3, borderStyle: "dashed" },
  /** 놓이게 될 자리. 테두리를 굵혀 이미 저장된 알약과 구분한다. */
  pillTarget: { borderWidth: 2 },
```

접근성 라벨에서 `personal.map(...)` 을 쓰는 부분도 `personalForLabel`로 바꾼다.

- [ ] **Step 4: 달 목록이 넘기게 한다**

`apps/native/src/components/calendar-scroll.tsx`:

import에 `useMonthPersonalDragPreview`를 더한다.

```ts
import {
  MonthCalendar,
  useMonthDragPreview,
  useMonthPersonalDragPreview,
  type OutingCycleStart,
} from "@/components/month-calendar";
```

`MonthBlock` 안, `dragPreview` 바로 아래:

```ts
const personalDragPreview = useMonthPersonalDragPreview(props.month);
```

`<MonthCalendar … dragPreview={dragPreview}` 다음 줄에 속성을 하나 더한다:

```
      personalDragPreview={personalDragPreview}
```

- [ ] **Step 5: 돌린다**

Run: `pnpm --filter @leave/native test && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: PASS. 화면 동작은 아직 바뀌지 않는다(atom이 늘 null).

- [ ] **Step 6: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
feat(native): 개인 일정 알약이 드래그 덧그림을 그린다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 8: `openAfterSheet`를 조기 반환 위로 올린다

Task 9에서 드래그 훅이 "개인 일정 수정 화면을 연다"를 콜백으로 받는다. 그 이동은 iOS 단일 모달 규칙을 지켜야 해서 반드시 `openAfterSheet`를 거쳐야 하는데, 지금 `runIntent`/`openAfterSheet`는 로딩·오류 조기 반환 **아래**에 있어 훅 호출부에서 참조할 수 없다. 둘을 위로 올린다. 동작은 바뀌지 않는다.

**Files:**

- Modify: `apps/native/src/screens/calendar/index.tsx` (`runIntent`/`openAfterSheet`/`openForm`/`openLeave` 이동)

**Interfaces:**

- Produces: `openAfterSheet`가 `useCalendarItemDrag` 호출보다 위에서 정의된다.

- [ ] **Step 1: 네 함수를 올린다**

`runIntent`, `openAfterSheet`, `openForm`, `openLeave`를 **주석까지 그대로** 잘라내어, `itemDrag` 호출 **바로 위**로 옮긴다. `useCallback`으로 감싸 달 블록의 `memo`를 깨지 않게 한다 — `onSelectDate`가 `useCallback`인 것과 같은 이유다.

```ts
const runIntent = useCallback(
  (intent: CalendarIntent) => {
    switch (intent.kind) {
      // …기존 본문 그대로…
    }
  },
  [router],
);

const openAfterSheet = useCallback(
  (intent: CalendarIntent) => {
    if (isCompact && selectedDate != null) {
      pendingAfterSheet.current = intent;
      setSelectedDate(null);
      return;
    }
    runIntent(intent);
  },
  [isCompact, selectedDate, runIntent],
);

const openForm = useCallback(
  (date: ISODate) => openAfterSheet({ kind: "form", date }),
  [openAfterSheet],
);
const openLeave = useCallback(
  (leaveId: string) => openAfterSheet({ kind: "leave", leaveId }),
  [openAfterSheet],
);
```

`runIntent`의 `case "form"`은 `setFormDate`를 쓴다 — `useState`의 setter라 의존성에 넣지 않아도 된다.

- [ ] **Step 2: 원래 자리에 남은 주석을 정리한다**

조기 반환 아래에 있던 자리에는 "휴가 등록 폼을 연다 …" 로 시작하는 긴 JSDoc 블록이 함수 없이 남는다. 그 주석도 함께 옮겼는지 확인한다.

Run: `grep -n "openAfterSheet\|runIntent" apps/native/src/screens/calendar/index.tsx`
Expected: 정의가 조기 반환(`if (isRestoring …`)보다 **앞선 줄 번호**에 나온다.

- [ ] **Step 3: 돌린다**

Run: `pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: PASS. lint가 `react-hooks/exhaustive-deps`를 지적하면 지적한 의존성을 넣는다.

- [ ] **Step 4: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
refactor(native): 달력 화면의 이동 함수를 조기 반환 위로 올린다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 9: 개인 일정을 집고, 옮기고, 수정·삭제한다

문제 1을 고친다. 앞의 여덟 태스크가 깔아 둔 것을 잇는다.

**Files:**

- Modify: `apps/native/src/components/month-calendar.tsx` (`DayCell`의 `subjects`)
- Modify: `apps/native/src/screens/calendar/use-calendar-item-drag.ts` (개인 일정 분기)
- Modify: `apps/native/src/screens/calendar/index.tsx` (`CalendarIntent`, 배선)

**Interfaces:**

- Consumes: `shiftDateRange` (Task 1), `nearestGrabTarget` (Task 2), `CalendarDragSubject` (Task 3), `useDayCellDrag` (Task 5), `chooseHoldAction` (Task 6), `personalEventDragPreviewAtom` (Task 7), `openAfterSheet` (Task 8)
- Produces:
  - ```ts
    useCalendarItemDrag(options: {
      leaves: readonly MyLeave[] | undefined;
      today: ISODate;
      onEditLeave: (leave: MyLeave) => void;
      onEditPersonalEvent: (event: PersonalEvent) => void;
      onSelectDate: (date: ISODate) => void;
    }): { isDragging: boolean; statusLabel: string | null }
    ```
  - `CalendarIntent`에 `{ kind: "personalEventEdit"; eventId: string; month: string }` 추가

- [ ] **Step 1: 칸이 개인 일정도 후보로 내놓게 한다**

`apps/native/src/components/month-calendar.tsx`의 `DayCell`에서 `subjects`를 바꾼다.

```tsx
// 하루에 개인 일정이 여럿이면 칸에 제목이 보이는 첫 일정을 집는다. 알약은 한
// 줄뿐이라 사용자가 보고 있는 것도 그 하나다.
const personalEventId = personal[0]?.id ?? null;
const subjects = useMemo<DayCellSubject[]>(() => {
  const list: DayCellSubject[] = [];
  if (leaveId)
    list.push({ slot: "leave", subject: { kind: "leave", leaveId } });
  if (personalEventId)
    list.push({
      slot: "personal",
      subject: { kind: "personalEvent", eventId: personalEventId },
    });
  return list;
}, [leaveId, personalEventId]);
```

`personal`(저장된 목록)을 쓰는 것이 중요하다 — `personalForLabel`(덧그림이 섞인 목록)을 쓰면 끌고 가는 도중에 목적지 칸의 트리 모양이 바뀌어 `Pressable`이 리마운트된다.

- [ ] **Step 2: 화면 훅에 개인 일정을 들인다**

`apps/native/src/screens/calendar/use-calendar-item-drag.ts`의 import를 더한다.

```ts
import { eachDate, shiftDateRange, type ISODate } from "@leave/shared/dates";
import {
  useDeletePersonalEvent,
  usePersonalEvents,
  useUpdatePersonalEvent,
  type PersonalEvent,
} from "@leave/client";
import {
  personalEventDragPreviewAtom,
  type PersonalEventDragDay,
} from "@/state/calendar-drag";
```

시그니처를 넓힌다.

```ts
export function useCalendarItemDrag(options: {
  leaves: readonly MyLeave[] | undefined;
  /** 한국시간 오늘. 드래그가 없을 때 구독할 달을 고르는 데만 쓴다. */
  today: ISODate;
  onEditLeave: (leave: MyLeave) => void;
  /** 개인 일정 편집. 화면이 모달 순서 규칙을 지켜 연다. */
  onEditPersonalEvent: (event: PersonalEvent) => void;
  onSelectDate: (date: ISODate) => void;
}) {
  const { leaves, today, onEditLeave, onEditPersonalEvent, onSelectDate } = options;
```

훅 본문 위쪽(`const leave = useMemo(...)` 아래)에 더한다.

```ts
const setPersonalPreview = useSetAtom(personalEventDragPreviewAtom);
const updatePersonalEvent = useUpdatePersonalEvent();
const deletePersonalEvent = useDeletePersonalEvent();

/**
 * 끌고 있는 개인 일정이 있는 달. 달력 블록(`calendar-scroll.tsx`)이 같은 키로
 * 이미 채워 둔 캐시라 추가 요청이 나가지 않는다. 시작일이 앞 달인 일정도 서버가
 * 겹치는 일정을 모두 주므로 이 달 응답에 들어 있다.
 *
 * 끌고 있지 않을 때 오늘의 달을 구독하는 것은 낭비가 아니다 — 그 달은 어차피
 * 달력이 들고 있다. 빈 문자열로 끄는 것보다 잘못된 요청이 나갈 여지가 없다.
 */
const personalMonth =
  drag?.subject.kind === "personalEvent"
    ? drag.grabDate.slice(0, 7)
    : today.slice(0, 7);
const personalEvents = usePersonalEvents(personalMonth);
const personalEvent = useMemo(() => {
  if (!drag || drag.subject.kind !== "personalEvent") return null;
  const { eventId } = drag.subject;
  return personalEvents.data?.events.find((it) => it.id === eventId) ?? null;
}, [drag, personalEvents.data]);

/** 옮긴 뒤의 기간. 놓을 수 없는 자리 위면 원래 기간 그대로다. */
const movedEvent = useMemo(
  () =>
    personalEvent && drag?.hoverDate
      ? { ...personalEvent, ...shiftDateRange(personalEvent, drag.deltaDays) }
      : null,
  [personalEvent, drag],
);
```

- [ ] **Step 3: 개인 일정 덧그림을 만든다**

휴가 덧그림 효과(`// 덧그릴 칸들.`) 바로 아래에 넣는다.

```ts
// 개인 일정 덧그림. 출발 자리와 옮길 자리를 함께 보여주고, 겹치면 도착이 이긴다.
useEffect(() => {
  if (!drag || !personalEvent) {
    setPersonalPreview(null);
    return;
  }
  const map = new Map<ISODate, PersonalEventDragDay>();
  for (const date of eachDate(personalEvent.startDate, personalEvent.endDate))
    map.set(date, { event: personalEvent, role: "origin", phase: drag.phase });
  if (movedEvent)
    for (const date of eachDate(movedEvent.startDate, movedEvent.endDate))
      map.set(date, { event: movedEvent, role: "target", phase: drag.phase });
  setPersonalPreview(map);
}, [drag, personalEvent, movedEvent, setPersonalPreview]);

useEffect(() => () => setPersonalPreview(null), [setPersonalPreview]);
```

- [ ] **Step 4: 저장 효과에 개인 일정 분기를 더한다**

저장 효과의 `void (async () => { try {` 바로 다음, 휴가 분기 **앞**에 넣는다. 그리고 효과의 의존성 배열에 `personalEvent`, `movedEvent`, `updatePersonalEvent`, `deletePersonalEvent`, `onEditPersonalEvent`를 더한다.

```ts
if (drag.subject.kind === "personalEvent") {
  if (!personalEvent) return;
  if (drag.phase === "editing") {
    const action = await chooseHoldAction(
      personalEvent.title,
      "개인 일정 작업을 선택하세요.",
    );
    if (action === "edit") onEditPersonalEvent(personalEvent);
    if (
      action === "delete" &&
      (await confirmAction({
        title: "개인 일정 삭제",
        message: `"${personalEvent.title}" 일정을 삭제할까요?`,
        confirmLabel: "삭제",
        destructive: true,
      }))
    ) {
      await deletePersonalEvent.mutateAsync(personalEvent);
    }
    return;
  }
  if (!movedEvent || drag.deltaDays === 0) return;
  // 오프라인에서는 시도조차 하지 않는다. 이 앱의 mutation은 networkMode가
  // 기본값("online")이라 연결이 없으면 영영 끝나지 않고 멈춰 서고,
  // 그러면 미리보기가 "저장 중"인 채로 굳는다.
  if (!onlineManager.isOnline()) {
    notify("오프라인이라 옮길 수 없어요", "연결된 뒤에 다시 시도해주세요.");
    return;
  }
  setDrag((current) => (current ? { ...current, phase: "saving" } : current));
  await updatePersonalEvent.mutateAsync({
    id: personalEvent.id,
    input: {
      startDate: movedEvent.startDate,
      endDate: movedEvent.endDate,
    },
    previous: personalEvent,
  });
  return;
}
```

`catch`의 안내 문구(`"옮기지 못했어요"`)는 두 갈래가 함께 쓴다 — 그대로 둔다.

- [ ] **Step 5: 머리말 안내에 제목을 넣는다**

`statusLabel`의 `useMemo` 맨 앞(`if (!drag) return null;` 다음)에 개인 일정 갈래를 더하고, 의존성 배열에 `personalEvent`, `movedEvent`를 더한다.

```ts
if (drag.subject.kind === "personalEvent") {
  // 하루에 일정이 여럿일 때 무엇이 움직이는지 알 수 있는 유일한 단서다.
  const title = personalEvent?.title ?? "개인 일정";
  if (drag.phase === "saving") return `${title} 옮기는 중…`;
  if (drag.hoverDate == null) return "달력 안의 날짜에 놓아주세요";
  if (drag.phase === "editing") return `${title} 편집`;
  if (drag.deltaDays === 0)
    return drag.hasMoved
      ? "옮길 날짜로 끌어주세요"
      : "1초 누르면 편집 · 다른 손가락으로 월 이동";
  return movedEvent
    ? `${title} · ${fmtRange(movedEvent.startDate, movedEvent.endDate)}로 옮기기`
    : null;
}
```

- [ ] **Step 6: 화면에서 배선한다**

`apps/native/src/screens/calendar/index.tsx`:

`CalendarIntent`에 갈래를 더한다.

```ts
type CalendarIntent =
  | { kind: "form"; date: ISODate }
  | { kind: "leave"; leaveId: string }
  | { kind: "personalEvent"; date: ISODate }
  /** 이미 있는 개인 일정을 연다. 달력에서 길게 눌러 "수정"을 고른 경우. */
  | { kind: "personalEventEdit"; eventId: string; month: string }
  | { kind: "unitEvent"; date: ISODate };
```

`runIntent`의 `switch`에 `case`를 더한다(`case "personalEvent"` 아래).

```ts
      case "personalEventEdit":
        router.push({
          pathname: "/(tabs)/(calendar)/personal-event",
          params: { eventId: intent.eventId, month: intent.month },
        });
        return;
```

훅 호출을 넓힌다.

```ts
// 개인 일정 수정은 iOS 단일 모달 규칙을 타야 한다 — 시트가 떠 있으면 먼저 닫는다.
const openPersonalEventEdit = useCallback(
  (event: PersonalEvent) =>
    openAfterSheet({
      kind: "personalEventEdit",
      eventId: event.id,
      month: event.startDate.slice(0, 7),
    }),
  [openAfterSheet],
);

const itemDrag = useCalendarItemDrag({
  leaves: myLeaves.data?.leaves,
  today,
  onEditLeave: setEditingLeave,
  onEditPersonalEvent: openPersonalEventEdit,
  onSelectDate: selectDate,
});
```

`PersonalEvent` 타입을 `@leave/client` import에 더한다.

- [ ] **Step 7: 돌린다**

Run: `pnpm --filter @leave/native test && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: PASS

- [ ] **Step 8: 커밋**

```bash
git add -A apps/native
git commit -m "$(cat <<'EOF'
feat(native): 달력에서 개인 일정도 끌어 옮기고 수정·삭제한다

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XyLbARtYYkTXbdR5qRT4id
EOF
)"
```

---

### Task 10: 게이트를 통과시키고 렌더를 확인한다

**Files:**

- 없음(수정이 필요하면 해당 파일)

- [ ] **Step 1: 전체 품질 게이트**

Run: `pnpm quality`
Expected: format:check → lint → types:check → check-types → test 전부 PASS. `pnpm format:check`가 실패하면 `pnpm format`으로 고치고 다시 돌린다.

- [ ] **Step 2: 개발 서버를 띄운다**

바뀐 화면은 `apps/native`다. `pnpm dev:web`은 `@leave/web`(별도 구현, 이 작업과 무관)을 띄우므로 쓰지 않는다. Expo Web으로 띄운다.

Run (백그라운드, 터미널 둘):

```bash
pnpm --filter @leave/api dev
pnpm --filter @leave/native web
```

Expo가 알려 주는 URL(보통 `http://localhost:8081`)이 응답할 때까지 기다린다. Expo Web이 이 저장소에서 뜨지 않으면 Step 3~5를 건너뛰고 Step 6으로 간다 — 이 작업의 핵심은 터치 판정이고, 그건 어차피 기기에서만 확인된다.

- [ ] **Step 3: 브라우저 스킬을 읽고 연다**

```bash
pnpm exec agent-browser skills get core
pnpm exec agent-browser open <달력 URL>
pnpm exec agent-browser wait --load networkidle
pnpm exec agent-browser snapshot -i
```

- [ ] **Step 4: 바뀐 흐름을 훑는다**

달력 칸에 개인 일정 알약이 그려지는지, 날짜를 짧게 누르면 그대로 선택되는지 확인한다. 스냅샷을 다시 찍어 비교한다.

- [ ] **Step 5: 콘솔과 오류를 본다**

```bash
pnpm exec agent-browser console
pnpm exec agent-browser errors
pnpm browser:close
```

Expected: 이 작업과 관련된 새 오류 없음.

- [ ] **Step 6: 기기 검증을 요청한다**

터치 판정은 단위 테스트로도 브라우저로도 잡히지 않는다. 사용자에게 실제 기기에서 확인해 달라고 요청하고, 무엇을 봐야 하는지 적어 준다:

1. 휴가가 있는 날의 **빈 자리**를 꾹 눌러 휴가가 집히는지.
2. 개인 일정 알약을 꾹 눌러 그 일정이 집히는지. 휴가와 함께 있는 칸에서 손가락 위치에 따라 다른 것이 집히는지.
3. 하루에 일정이 여럿인 날에서 머리말에 어느 제목이 뜨는지.
4. 1초 유지 시 수정·삭제 메뉴가 열리고, 삭제가 안드로이드에서 확인 버튼 자리에 놓이지 **않는지**.
5. 느리게 눌렀다 뗐을 때 날짜가 선택되는지.
6. **스크롤하려고 손가락을 얹었다가 실수로 일정이 집히는 일이 얼마나 잦은지** — 잦으면 `use-day-cell-drag.ts`의 `activateAfterLongPress(250)`을 올린다.

- [ ] **Step 7: 필요하면 고치고 커밋**

발견된 문제를 고치고 Step 1을 다시 돌린 뒤 커밋한다.
