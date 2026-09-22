# 기기 캘린더 겹쳐보기 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 아이폰·안드로이드 기본 캘린더의 일정을 리브 달력 탭에 보기 전용으로 겹쳐
보여주고, 무엇을 볼지 설정에서 고르게 한다.

**Architecture:** `expo-calendar`를 감싸는 얇은 bridge가 기기와 닿는 유일한 자리다.
bridge가 `Date`를 `ISODate`로 접어 `PersonalEvent`와 같은 모양(`startDate`/`endDate`)으로
내놓으면, 달력이 이미 쓰는 `buildRangeIndex`가 그대로 동작한다. 월 단위 `useQuery`가
`MonthBlock`에서 `usePersonalEvents` 옆에 붙고, 설정값은 위젯 설정과 같은 모듈 스토어에
기기 로컬로 저장한다.

**Tech Stack:** Expo SDK 57, `expo-calendar@57.0.4`, React Query v5, Jotai, vitest(node)

**Spec:** [`docs/superpowers/specs/2026-09-20-device-calendar-overlay-design.md`](../specs/2026-09-20-device-calendar-overlay-design.md)

## Global Constraints

- **네이티브 의존성은 `^` 없이 정확한 버전으로 적는다.** `expo-calendar`는
  `"57.0.4"`로 고정한다. `^`가 붙으면 lockfile 재생성 한 번에 fingerprint가 갈라지고
  이후 OTA가 기존 사용자 누구에게도 닿지 않는다 (`apps/native/AGENTS.md`).
- **`apps/native/package.json`의 `scripts` 블록을 건드리지 않는다.** `@expo/fingerprint`가
  이 블록을 그대로 해싱하므로 한 줄만 더해도 runtimeVersion이 바뀐다.
- **이 기능은 OTA로 배달되지 않는다.** 새 EAS 빌드 → 스토어 심사가 필수다.
- **`expo-calendar`를 import하는 파일은 `bridge.native.ts` 하나뿐이다.** 다른 파일은
  `types.ts`의 `DeviceEvent`·`DeviceCalendar`만 안다.
- **`packages/client`에는 아무것도 넣지 않는다.** 웹과 공유하는 패키지라
  `eslint.config.mjs`의 `no-restricted-imports`가 expo import를 오류로 만든다.
- **디스크에 남기지 않는다.** 쿼리 키 루트는 `"deviceCalendar"`이고,
  `lib/query-persistence.ts`의 `PERSISTED_QUERY_ROOTS`에 **넣지 않는다.**
- 주석·UI 문구는 한국어. 존댓말은 UI 문구에만, 주석은 평서체 (`docs/code-style.md`).
- 마지막에 `pnpm quality`가 통과해야 한다.

---

### Task 1: 의존성·권한 설정과 API 실측

`expo-calendar`를 붙이고, **종일 일정의 날짜 규칙을 실기기에서 확인해 기록한다.**
이 규칙이 Task 2의 상수를 정하므로 먼저 한다.

**Files:**

- Modify: `apps/native/package.json` (dependencies만)
- Modify: `apps/native/app.json`
- Create: `apps/native/src/device-calendar/types.ts`

**Interfaces:**

- Produces: `DeviceCalendar`, `DeviceEvent`, `PermissionState` — 이후 모든 태스크가 쓴다.

- [ ] **Step 1: 패키지를 고정 버전으로 더한다**

`apps/native/package.json`의 `dependencies`에 알파벳 순서대로 넣는다. `^`를 붙이지 않는다.

```json
"expo-calendar": "57.0.4",
```

- [ ] **Step 2: 설치하고 scripts가 안 바뀌었는지 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm install
git diff -- apps/native/package.json
```

기대: `dependencies`에 한 줄만 추가돼 있다. `scripts` 블록에 변경이 있으면 되돌린다.

- [ ] **Step 3: `app.json`에 플러그인과 권한을 넣는다**

`plugins` 배열에서 `expo-notifications` 다음에 넣는다:

```json
[
  "expo-calendar",
  {
    "calendarPermission": "휴가를 계획할 때 기기 캘린더의 일정을 달력에 함께 보여주기 위해 사용합니다.",
    "writeOnlyAccess": false
  }
],
```

`ios.infoPlist`에 더한다:

```json
"NSCalendarsUsageDescription": "휴가를 계획할 때 기기 캘린더의 일정을 달력에 함께 보여주기 위해 사용합니다.",
"NSCalendarsFullAccessUsageDescription": "휴가를 계획할 때 기기 캘린더의 일정을 달력에 함께 보여주기 위해 사용합니다.",
```

`android.permissions`를 `[]`에서 바꾼다:

```json
"permissions": ["android.permission.READ_CALENDAR"],
```

`android.blockedPermissions` 배열 맨 앞에 더한다 — 쓰기 권한이 모듈을 따라 조용히
들어오는 것을 막는다:

```json
"android.permission.WRITE_CALENDAR",
```

- [ ] **Step 4: 타입을 만든다**

Create `apps/native/src/device-calendar/types.ts`:

```ts
/**
 * 기기 캘린더에서 읽어 온 것의 모양 — 화면이 아는 유일한 형태.
 *
 * `expo-calendar`의 `ExpoCalendar`·`ExpoCalendarEvent`를 그대로 올려 보내지 않는다.
 * 그 타입들은 `Date | string`을 담고 플랫폼마다 있는 필드가 달라서, 화면까지
 * 올라오면 "이 값이 언제 있는가"를 화면이 알아야 한다. bridge가 여기서 한 번 좁힌다.
 *
 * `startDate`/`endDate`가 `PersonalEvent`와 같은 이름·같은 뜻(둘 다 포함)인 것이
 * 핵심이다. 그래야 `components/month-cell-index.ts`의 `buildRangeIndex`를 그대로 쓴다.
 */

import { type ISODate } from "@leave/shared/dates";

/** "HH:mm". 종일 일정에는 없다. */
export type LocalTime = string;

export type PermissionState = "granted" | "denied" | "undetermined";

export type DeviceCalendar = {
  id: string;
  title: string;
  /** 기기가 이 캘린더에 쓰는 색. 칸의 점과 목록 행에 그대로 쓴다. */
  color: string;
  /** 계정 이름(iCloud, Gmail…). 같은 이름의 캘린더를 가르는 데 쓴다. */
  source: string;
  /**
   * 기기에서 고칠 수 있는 캘린더인가. 기본 선택이 이 값으로 갈린다 —
   * 구독 캘린더(공휴일·생일)는 거짓이고, 리브는 공휴일을 이미 그린다.
   */
  allowsModifications: boolean;
};

export type DeviceEvent = {
  id: string;
  title: string;
  /** 포함 시작. */
  startDate: ISODate;
  /** 포함 끝. 하루짜리면 `startDate`와 같다. */
  endDate: ISODate;
  /** 종일 일정이면 null. */
  startTime: LocalTime | null;
  endTime: LocalTime | null;
  calendarId: string;
  color: string;
};
```

- [ ] **Step 5: 실기기에서 종일 일정 규칙을 확인한다**

기기 캘린더 앱에서 **종일 일정 두 개**를 만든다 — 하루짜리(2026-10-05)와
사흘짜리(2026-10-12 ~ 2026-10-14). iOS와 Android **양쪽에서** 한다.

앱에 임시 화면을 붙일 필요 없이, `npx expo start`로 띄운 뒤 개발자 콘솔에서 확인한다.
`apps/native/src/app/_layout.tsx`의 최상단 컴포넌트 안에 임시로 넣고 로그를 읽은 뒤
**반드시 되돌린다**:

```tsx
useEffect(() => {
  void (async () => {
    const Calendar = await import("expo-calendar");
    await Calendar.requestCalendarPermissions();
    const calendars = await Calendar.getCalendars();
    const events = await Calendar.listEvents(
      calendars.map((c) => c.id),
      new Date("2026-10-01T00:00:00Z"),
      new Date("2026-10-31T23:59:59Z"),
    );
    for (const e of events)
      console.log(
        "[allday]",
        e.allDay,
        e.title,
        String(e.startDate),
        String(e.endDate),
      );
  })();
}, []);
```

- [ ] **Step 6: 관찰한 것을 기록한다**

`apps/native/src/device-calendar/types.ts` 맨 아래에 주석으로 남긴다. Task 2가
이 값을 상수로 옮긴다.

```ts
/*
 * 실측(Task 1, YYYY-MM-DD):
 *
 *   iOS     하루짜리 2026-10-05  → start=...  end=...
 *           사흘짜리 2026-10-12  → start=...  end=...
 *   Android 하루짜리 2026-10-05  → start=...  end=...
 *           사흘짜리 2026-10-12  → start=...  end=...
 *
 * 결론: iOS는 frame=<utc|device>, end=<inclusive|exclusive>
 *       Android는 frame=<utc|device>, end=<inclusive|exclusive>
 */
```

- [ ] **Step 7: 임시 로그를 지우고 커밋한다**

```bash
cd /home/jhyunwoo/projects/leave
git diff -- apps/native/src/app/_layout.tsx   # 비어 있어야 한다
git add apps/native/package.json apps/native/app.json pnpm-lock.yaml apps/native/src/device-calendar/types.ts
git commit -m "feat(native): 기기 캘린더를 읽을 채비를 한다"
```

---

### Task 2: 날짜 접기 — 순수 함수와 테스트

**Files:**

- Modify: `packages/shared/src/dates.ts`
- Modify: `packages/shared/test/dates.test.ts`
- Create: `apps/native/src/device-calendar/dates.ts`
- Test: `apps/native/test/device-calendar-dates.test.ts`

**Interfaces:**

- Consumes: `DeviceEvent`, `LocalTime` (Task 1)
- Produces:
  - `seoulDate(at: Date): ISODate` — `@leave/shared/dates`
  - `toDate(value: string | Date): Date`
  - `frameDate(at: Date, frame: "utc" | "device"): ISODate`
  - `seoulTime(at: Date): LocalTime`
  - `type AllDayConvention = { frame: "utc" | "device"; end: "inclusive" | "exclusive" }`
  - `ALL_DAY_CONVENTIONS: Record<"ios" | "android", AllDayConvention>`
  - `foldAllDay(start: Date, end: Date, convention: AllDayConvention): { startDate: ISODate; endDate: ISODate }`
  - `foldTimed(start: Date, end: Date): { startDate: ISODate; endDate: ISODate; startTime: LocalTime; endTime: LocalTime }`

- [ ] **Step 1: `seoulDate`를 내놓는 테스트를 쓴다**

`packages/shared/test/dates.test.ts` 맨 아래에 더한다:

```ts
describe("seoulDate", () => {
  it("한국시간 기준 날짜 성분을 준다", () => {
    expect(seoulDate(new Date("2026-10-05T03:00:00Z"))).toBe("2026-10-05");
  });

  it("UTC 자정 직전은 한국에서 이미 다음 날이다", () => {
    expect(seoulDate(new Date("2026-10-05T23:30:00Z"))).toBe("2026-10-06");
  });

  it("todayInSeoul과 같은 답을 준다", () => {
    const at = new Date("2026-12-31T16:00:00Z");
    expect(seoulDate(at)).toBe(todayInSeoul(at));
  });
});
```

파일 맨 위 import에 `seoulDate`를 더한다.

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/shared test -- dates
```

기대: FAIL — `seoulDate is not a function` / import 오류.

- [ ] **Step 3: `seoulDate`를 내놓는다**

`packages/shared/src/dates.ts`의 `todayInSeoul`을 이렇게 바꾼다:

```ts
/**
 * 어떤 시각의 **한국시간 기준 달력 날짜**.
 *
 * 기기 캘린더처럼 `Date`를 주는 바깥 API에서 받은 값을 이 패키지의 `ISODate`로
 * 접을 때 쓴다. `todayInSeoul()`이 이것의 특수한 경우(지금)다.
 */
export function seoulDate(at: Date): ISODate {
  return SEOUL_DATE_FORMATTER.format(at);
}

/** 한국 시간 기준 오늘 날짜. */
export function todayInSeoul(now: Date = new Date()): ISODate {
  return seoulDate(now);
}
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/shared test -- dates
```

기대: PASS.

- [ ] **Step 5: 접기 테스트를 쓴다**

Create `apps/native/test/device-calendar-dates.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  foldAllDay,
  foldTimed,
  frameDate,
  seoulTime,
  toDate,
} from "../src/device-calendar/dates";

describe("toDate", () => {
  it("문자열이 와도 Date로 받는다", () => {
    expect(toDate("2026-10-05T03:00:00Z").getTime()).toBe(
      new Date("2026-10-05T03:00:00Z").getTime(),
    );
  });

  it("Date는 그대로 통과한다", () => {
    const at = new Date("2026-10-05T03:00:00Z");
    expect(toDate(at)).toBe(at);
  });
});

describe("frameDate", () => {
  it("utc 프레임은 UTC 날짜 성분을 읽는다", () => {
    expect(frameDate(new Date("2026-10-05T00:00:00Z"), "utc")).toBe(
      "2026-10-05",
    );
    expect(frameDate(new Date("2026-10-05T23:59:00Z"), "utc")).toBe(
      "2026-10-05",
    );
  });

  it("device 프레임은 기기 로컬 날짜 성분을 읽는다", () => {
    // 로컬 성분으로 만든 Date라 테스트 기기의 시간대와 무관하게 같은 답이 나온다.
    expect(frameDate(new Date(2026, 9, 5, 0, 0), "device")).toBe("2026-10-05");
    expect(frameDate(new Date(2026, 9, 5, 23, 59), "device")).toBe(
      "2026-10-05",
    );
  });

  it("연·월을 두 자리로 채운다", () => {
    expect(frameDate(new Date("2026-01-05T00:00:00Z"), "utc")).toBe(
      "2026-01-05",
    );
  });
});

describe("seoulTime", () => {
  it("한국시간 24시간 표기로 준다", () => {
    expect(seoulTime(new Date("2026-10-05T03:00:00Z"))).toBe("12:00");
  });

  it("자정은 24:00이 아니라 00:00이다", () => {
    expect(seoulTime(new Date("2026-10-04T15:00:00Z"))).toBe("00:00");
  });
});

describe("foldAllDay", () => {
  const utcExclusive = { frame: "utc", end: "exclusive" } as const;
  const utcInclusive = { frame: "utc", end: "inclusive" } as const;

  it("배타적 끝은 하루 당겨 포함 끝으로 만든다", () => {
    expect(
      foldAllDay(
        new Date("2026-10-12T00:00:00Z"),
        new Date("2026-10-15T00:00:00Z"),
        utcExclusive,
      ),
    ).toEqual({ startDate: "2026-10-12", endDate: "2026-10-14" });
  });

  it("배타적 규칙에서 하루짜리는 하루로 남는다", () => {
    expect(
      foldAllDay(
        new Date("2026-10-05T00:00:00Z"),
        new Date("2026-10-06T00:00:00Z"),
        utcExclusive,
      ),
    ).toEqual({ startDate: "2026-10-05", endDate: "2026-10-05" });
  });

  it("포함 규칙은 끝을 그대로 쓴다", () => {
    expect(
      foldAllDay(
        new Date("2026-10-12T00:00:00Z"),
        new Date("2026-10-14T00:00:00Z"),
        utcInclusive,
      ),
    ).toEqual({ startDate: "2026-10-12", endDate: "2026-10-14" });
  });

  it("끝이 시작보다 앞서는 망가진 값은 하루짜리로 접는다", () => {
    expect(
      foldAllDay(
        new Date("2026-10-05T00:00:00Z"),
        new Date("2026-10-05T00:00:00Z"),
        utcExclusive,
      ),
    ).toEqual({ startDate: "2026-10-05", endDate: "2026-10-05" });
  });

  it("월말을 넘긴다", () => {
    expect(
      foldAllDay(
        new Date("2026-10-31T00:00:00Z"),
        new Date("2026-11-02T00:00:00Z"),
        utcExclusive,
      ),
    ).toEqual({ startDate: "2026-10-31", endDate: "2026-11-01" });
  });
});

describe("foldTimed", () => {
  it("한국시간으로 날짜와 시간을 함께 접는다", () => {
    expect(
      foldTimed(
        new Date("2026-10-05T01:00:00Z"),
        new Date("2026-10-05T03:30:00Z"),
      ),
    ).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      startTime: "10:00",
      endTime: "12:30",
    });
  });

  it("UTC 자정을 넘기면 한국에서는 같은 날이다", () => {
    expect(
      foldTimed(
        new Date("2026-10-04T22:00:00Z"),
        new Date("2026-10-04T23:00:00Z"),
      ).startDate,
    ).toBe("2026-10-05");
  });

  it("한국시간 자정에 끝나는 일정은 그 전날에 붙인다", () => {
    // 21:00~24:00 KST. 끝을 그대로 접으면 다음 날 칸에 알약이 하나 더 그려진다.
    expect(
      foldTimed(
        new Date("2026-10-05T12:00:00Z"),
        new Date("2026-10-05T15:00:00Z"),
      ),
    ).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-05",
      startTime: "21:00",
      endTime: "00:00",
    });
  });

  it("여러 날에 걸친 시간 일정은 걸친 그대로 둔다", () => {
    expect(
      foldTimed(
        new Date("2026-10-05T01:00:00Z"),
        new Date("2026-10-07T01:00:00Z"),
      ),
    ).toEqual({
      startDate: "2026-10-05",
      endDate: "2026-10-07",
      startTime: "10:00",
      endTime: "10:00",
    });
  });
});
```

- [ ] **Step 6: 실패를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native test -- device-calendar-dates
```

기대: FAIL — `Cannot find module '../src/device-calendar/dates'`.

- [ ] **Step 7: 구현한다**

Create `apps/native/src/device-calendar/dates.ts`:

```ts
/**
 * 기기 캘린더의 `Date`를 리브의 `ISODate`로 접는다 — 순수 부분.
 *
 * 사용처: device-calendar/bridge.native.ts.
 *
 * 이 기능에서 가장 틀리기 쉬운 자리라 화면 없이 테스트할 수 있게 떼어 두었다
 * (`apps/native/test`는 node 환경이라 react-native를 불러올 수 없다).
 *
 * ## 규칙이 둘로 갈린다
 *
 * **시간이 있는 일정**은 `Asia/Seoul`로 접는다. 리브의 모든 날짜가 한국시간 기준이고,
 * 달력 한 칸이 곧 한국시간의 하루다.
 *
 * **종일 일정**은 시간대로 접으면 안 된다. "10월 5일 종일"은 시각이 아니라 날짜라서,
 * 기기가 그 날짜를 어느 프레임의 자정으로 표현했든 날짜 성분을 그대로 읽어야 한다.
 * 한 번 시간대로 접으면 기기가 UTC 자정으로 저장한 경우 하루가 통째로 밀린다.
 *
 * 그 프레임과 "끝 날짜가 포함인가 배타인가"가 플랫폼마다 다르다. 그래서 규칙을 값으로
 * 빼고(`ALL_DAY_CONVENTIONS`) 네 조합을 모두 테스트한다 — 실측으로 한 칸이 바뀌어도
 * 고칠 곳이 상수 하나다.
 */

import { addDays, seoulDate, type ISODate } from "@leave/shared/dates";
import { type LocalTime } from "./types";

export type AllDayConvention = {
  /** 종일 일정의 날짜 성분을 어느 프레임에서 읽는가. */
  frame: "utc" | "device";
  /** 끝 날짜가 마지막 날인가(inclusive), 그 다음 날인가(exclusive). */
  end: "inclusive" | "exclusive";
};

/**
 * 플랫폼별 종일 일정 규칙. **Task 1의 실측값이다** — 추측이 아니라 관찰로 채운다.
 * 근거는 types.ts 아래 주석에 있다.
 */
export const ALL_DAY_CONVENTIONS: Record<"ios" | "android", AllDayConvention> =
  {
    ios: { frame: "device", end: "inclusive" },
    android: { frame: "utc", end: "exclusive" },
  };

const SEOUL_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Seoul",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** `expo-calendar`는 `Date`나 ISO 문자열을 준다. 어느 쪽이 와도 받는다. */
export function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/** 날짜 성분을 지정한 프레임에서 읽는다. */
export function frameDate(at: Date, frame: "utc" | "device"): ISODate {
  const [y, m, d] =
    frame === "utc"
      ? [at.getUTCFullYear(), at.getUTCMonth() + 1, at.getUTCDate()]
      : [at.getFullYear(), at.getMonth() + 1, at.getDate()];
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** 한국시간 "HH:mm". */
export function seoulTime(at: Date): LocalTime {
  return SEOUL_TIME_FORMATTER.format(at);
}

export function foldAllDay(
  start: Date,
  end: Date,
  convention: AllDayConvention,
): { startDate: ISODate; endDate: ISODate } {
  const startDate = frameDate(start, convention.frame);
  const rawEnd = frameDate(end, convention.frame);
  const pulled =
    convention.end === "exclusive" && rawEnd > startDate
      ? addDays(rawEnd, -1)
      : rawEnd;
  // 끝이 시작보다 앞서는 값이 실제로 온다(배타 규칙의 하루짜리, 망가진 일정).
  // 그대로 두면 buildRangeIndex가 빈 구간을 만들어 알약이 아예 사라진다.
  return { startDate, endDate: pulled < startDate ? startDate : pulled };
}

export function foldTimed(
  start: Date,
  end: Date,
): {
  startDate: ISODate;
  endDate: ISODate;
  startTime: LocalTime;
  endTime: LocalTime;
} {
  const startDate = seoulDate(start);
  const startTime = seoulTime(start);
  const endTime = seoulTime(end);
  const rawEnd = seoulDate(end);
  // 자정에 끝나는 일정은 그날 밤에 끝난 것이다. 그대로 접으면 다음 날 칸에
  // 알약이 하나 더 그려져, 아무 일도 없는 날이 일정 있는 날로 보인다.
  const endDate =
    endTime === "00:00" && rawEnd > startDate ? addDays(rawEnd, -1) : rawEnd;
  return {
    startDate,
    endDate: endDate < startDate ? startDate : endDate,
    startTime,
    endTime,
  };
}
```

- [ ] **Step 8: 통과를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native test -- device-calendar-dates
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/shared test -- dates
```

기대: 양쪽 PASS.

- [ ] **Step 9: Task 1의 실측으로 `ALL_DAY_CONVENTIONS`를 맞춘다**

`types.ts` 아래 주석의 결론과 `ALL_DAY_CONVENTIONS`의 값이 같은지 본다.
다르면 **상수를 실측에 맞춘다.** 테스트는 네 조합을 모두 고정하고 있으므로 바꿔도
깨지지 않는다 — 깨진다면 테스트가 규칙이 아니라 구현을 베낀 것이니 테스트를 고친다.

- [ ] **Step 10: 커밋**

```bash
cd /home/jhyunwoo/projects/leave
git add packages/shared/src/dates.ts packages/shared/test/dates.test.ts \
        apps/native/src/device-calendar/dates.ts apps/native/src/device-calendar/types.ts \
        apps/native/test/device-calendar-dates.test.ts
git commit -m "feat(native): 기기 캘린더의 Date를 리브 날짜로 접는다"
```

---

### Task 3: 설정값 — 모듈 스토어와 테스트

**Files:**

- Create: `apps/native/src/device-calendar/preferences.ts`
- Create: `apps/native/src/device-calendar/storage.ts`
- Create: `apps/native/src/device-calendar/storage.native.ts`
- Create: `apps/native/src/device-calendar/use-device-calendar-preferences.ts`
- Test: `apps/native/test/device-calendar-preferences.test.ts`

**Interfaces:**

- Consumes: `DeviceCalendar` (Task 1)
- Produces:
  - `type DeviceCalendarPreferences = { enabled: boolean; calendarIds: string[] }`
  - `defaultDeviceCalendarPreferences: DeviceCalendarPreferences`
  - `normalizeDeviceCalendarPreferences(value: unknown): DeviceCalendarPreferences`
  - `defaultCalendarIds(calendars: readonly DeviceCalendar[]): string[]`
  - `visibleCalendarIds(prefs, calendars): string[]`
  - `getDeviceCalendarPreferences()`, `loadDeviceCalendarPreferences()`,
    `saveDeviceCalendarPreferences(next)`, `subscribeDeviceCalendarPreferences(listener)`
  - `useDeviceCalendarPreferences(): DeviceCalendarPreferences`

- [ ] **Step 1: 테스트를 쓴다**

Create `apps/native/test/device-calendar-preferences.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  defaultCalendarIds,
  defaultDeviceCalendarPreferences,
  normalizeDeviceCalendarPreferences,
  visibleCalendarIds,
} from "../src/device-calendar/preferences";
import type { DeviceCalendar } from "../src/device-calendar/types";

const cal = (
  id: string,
  allowsModifications: boolean,
  title = id,
): DeviceCalendar => ({
  id,
  title,
  color: "#123456",
  source: "iCloud",
  allowsModifications,
});

describe("설정 정규화", () => {
  it("저장된 적 없으면 꺼짐이고 고른 캘린더가 없다", () => {
    expect(normalizeDeviceCalendarPreferences(undefined)).toEqual(
      defaultDeviceCalendarPreferences,
    );
    expect(defaultDeviceCalendarPreferences).toEqual({
      enabled: false,
      calendarIds: [],
    });
  });

  it("아는 값은 그대로 지킨다", () => {
    expect(
      normalizeDeviceCalendarPreferences({
        enabled: true,
        calendarIds: ["a", "b"],
      }),
    ).toEqual({ enabled: true, calendarIds: ["a", "b"] });
  });

  it("문자열이 아닌 ID와 중복은 버린다", () => {
    expect(
      normalizeDeviceCalendarPreferences({
        enabled: true,
        calendarIds: ["a", 3, null, "a", "b"],
      }),
    ).toEqual({ enabled: true, calendarIds: ["a", "b"] });
  });

  it("망가진 값은 기본값으로 간다", () => {
    expect(normalizeDeviceCalendarPreferences("nope")).toEqual(
      defaultDeviceCalendarPreferences,
    );
    expect(
      normalizeDeviceCalendarPreferences({ enabled: "yes", calendarIds: "a" }),
    ).toEqual(defaultDeviceCalendarPreferences);
  });
});

describe("기본 선택", () => {
  it("고칠 수 있는 캘린더만 켠다", () => {
    expect(
      defaultCalendarIds([
        cal("me", true, "개인"),
        cal("holidays", false, "대한민국 공휴일"),
        cal("birthdays", false, "생일"),
      ]),
    ).toEqual(["me"]);
  });

  it("고칠 수 있는 캘린더가 하나도 없으면 아무것도 켜지 않는다", () => {
    expect(defaultCalendarIds([cal("holidays", false)])).toEqual([]);
  });

  it("빈 목록도 견딘다", () => {
    expect(defaultCalendarIds([])).toEqual([]);
  });
});

describe("실제로 읽을 캘린더", () => {
  const calendars = [cal("a", true), cal("b", true)];

  it("기기에서 사라진 ID는 걸러낸다", () => {
    expect(
      visibleCalendarIds(
        { enabled: true, calendarIds: ["a", "gone"] },
        calendars,
      ),
    ).toEqual(["a"]);
  });

  it("설정에 없는 새 캘린더는 켜지 않는다", () => {
    expect(
      visibleCalendarIds({ enabled: true, calendarIds: ["a"] }, calendars),
    ).toEqual(["a"]);
  });

  it("꺼져 있으면 무엇을 골랐든 아무것도 읽지 않는다", () => {
    expect(
      visibleCalendarIds(
        { enabled: false, calendarIds: ["a", "b"] },
        calendars,
      ),
    ).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native test -- device-calendar-preferences
```

기대: FAIL — 모듈을 찾을 수 없다.

- [ ] **Step 3: 저장소 짝을 만든다**

Create `apps/native/src/device-calendar/storage.ts`:

```ts
/**
 * 기기 캘린더 설정 저장소 — 웹(Expo web 타깃) 구현.
 * `.native.ts` 짝이 Metro의 플랫폼 확장자 규칙에 따라 기기에서 선택된다.
 *
 * 웹에는 읽을 기기 캘린더가 없지만 설정 화면은 열린다. 브라우저 검증에서 고른 값이
 * 새로고침 뒤에도 남아야 화면을 제대로 확인할 수 있어 localStorage를 쓴다
 * (`widgets/storage.ts`와 같은 이유).
 */

export interface DeviceCalendarStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const deviceCalendarStorage: DeviceCalendarStorage = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => {
    globalThis.localStorage?.setItem(key, value);
  },
};
```

Create `apps/native/src/device-calendar/storage.native.ts`:

```ts
/**
 * 기기 캘린더 설정 저장소 — iOS/Android 구현.
 *
 * 위젯 설정(`widgets/storage.native.ts`)과 같은 이유로 쿼리 캐시와 데이터베이스를
 * 나눈다. 쿼리 캐시는 로그아웃할 때 통째로 지우는 대상이고, 이 설정은 계정과 무관한
 * 이 기기의 취향이라 그때 함께 지워지면 안 된다.
 */

import { SQLiteStorage } from "expo-sqlite/kv-store";
import type { DeviceCalendarStorage } from "./storage";

export const deviceCalendarStorage: DeviceCalendarStorage = new SQLiteStorage(
  "leave-device-calendar.db",
);
```

- [ ] **Step 4: 설정 스토어를 만든다**

Create `apps/native/src/device-calendar/preferences.ts`:

```ts
/**
 * "이 기기에서 어느 캘린더를 겹쳐 볼까" — 기기 캘린더 설정.
 *
 * 사용처: screens/calendar-settings.tsx가 읽고 쓰고,
 * use-device-calendar-events.ts가 무엇을 읽을지 정하는 데 쓴다.
 *
 * 서버에 올리지 않는다. 기기마다 붙어 있는 캘린더가 다르므로 계정에 묶으면 오히려
 * 틀린다 — 아이패드에 회사 계정이 없는데 아이폰에서 고른 ID가 내려온들 소용이 없다.
 * 구조는 `widgets/preferences.ts`와 같다(모듈 스토어 + useSyncExternalStore).
 *
 * ## `calendarIds`는 허용 목록이다
 *
 * 여기 없는 캘린더는 꺼진 것이다. "제외 목록"으로 두면 나중에 회사 계정을 붙였을 때
 * 남의 업무 일정이 말없이 달력에 나타난다. 새 캘린더는 언제나 꺼진 채로 들어온다.
 */

import { type DeviceCalendar } from "./types";
import { deviceCalendarStorage } from "./storage";

const STORAGE_KEY = "leave.deviceCalendar.preferences";

export type DeviceCalendarPreferences = {
  /** 마스터 토글. 꺼져 있으면 권한이 있어도 아무것도 읽지 않는다. */
  enabled: boolean;
  /** 명시적으로 켠 캘린더 ID. */
  calendarIds: string[];
};

export const defaultDeviceCalendarPreferences: DeviceCalendarPreferences = {
  enabled: false,
  calendarIds: [],
};

export function normalizeDeviceCalendarPreferences(
  value: unknown,
): DeviceCalendarPreferences {
  if (typeof value !== "object" || value === null)
    return { ...defaultDeviceCalendarPreferences };
  const raw = value as Partial<
    Record<keyof DeviceCalendarPreferences, unknown>
  >;
  if (typeof raw.enabled !== "boolean" || !Array.isArray(raw.calendarIds))
    return { ...defaultDeviceCalendarPreferences };
  const ids = raw.calendarIds.filter(
    (id): id is string => typeof id === "string",
  );
  return { enabled: raw.enabled, calendarIds: [...new Set(ids)] };
}

/**
 * 권한을 처음 승인했을 때 켜 둘 캘린더.
 *
 * 고칠 수 있는 캘린더만 켠다. 구독 캘린더(공휴일·생일)를 켜면 리브가 이미 그리는
 * 공휴일이 모든 칸에 두 번 적히고 생일이 달력을 덮는다. 첫인상이 쓰레기 더미면
 * 기능을 꺼 버리고 다시 오지 않는다 — 켜는 것은 언제든 할 수 있다.
 */
export function defaultCalendarIds(
  calendars: readonly DeviceCalendar[],
): string[] {
  return calendars
    .filter((calendar) => calendar.allowsModifications)
    .map((calendar) => calendar.id);
}

/**
 * 지금 실제로 읽을 캘린더 ID.
 *
 * 기기에서 사라진 ID를 걸러내는 자리가 여기다. 저장된 값을 지우지는 않는다 —
 * 계정을 잠깐 뺐다 다시 붙이면 고른 것이 그대로 살아나는 편이 낫다.
 */
export function visibleCalendarIds(
  prefs: DeviceCalendarPreferences,
  calendars: readonly DeviceCalendar[],
): string[] {
  if (!prefs.enabled) return [];
  const present = new Set(calendars.map((calendar) => calendar.id));
  return prefs.calendarIds.filter((id) => present.has(id));
}

let current: DeviceCalendarPreferences = defaultDeviceCalendarPreferences;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeDeviceCalendarPreferences(
  listener: () => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDeviceCalendarPreferences(): DeviceCalendarPreferences {
  return current;
}

/** 저장소에서 한 번 읽어 온다. 두 번 불러도 한 번만 읽는다. */
export async function loadDeviceCalendarPreferences(): Promise<DeviceCalendarPreferences> {
  if (loaded) return current;
  loaded = true;
  try {
    const stored = await deviceCalendarStorage.getItem(STORAGE_KEY);
    if (stored)
      current = normalizeDeviceCalendarPreferences(JSON.parse(stored));
  } catch {
    // 못 읽으면 기본값(꺼짐)으로 간다. 설정 하나 때문에 달력이 멈추면 안 된다.
  }
  emit();
  return current;
}

export async function saveDeviceCalendarPreferences(
  next: DeviceCalendarPreferences,
): Promise<DeviceCalendarPreferences> {
  current = normalizeDeviceCalendarPreferences(next);
  loaded = true;
  emit();
  try {
    await deviceCalendarStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 저장 실패는 이번 실행을 막지 않는다 — 메모리 값으로 계속 동작한다.
  }
  return current;
}
```

- [ ] **Step 5: 통과를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native test -- device-calendar-preferences
```

기대: PASS.

- [ ] **Step 6: 구독 훅을 만든다**

Create `apps/native/src/device-calendar/use-device-calendar-preferences.ts`:

```ts
/**
 * 설정 화면과 달력이 함께 보는 훅.
 *
 * 설정에서 캘린더를 켠 값이 같은 실행 중에 달력까지 바로 닿아야 하므로, 저장소를
 * 다시 읽지 않고 모듈이 들고 있는 값을 구독한다(preferences.ts).
 * `widgets/use-widget-preferences.ts`와 같은 모양이다.
 */

import { useEffect, useSyncExternalStore } from "react";
import {
  getDeviceCalendarPreferences,
  loadDeviceCalendarPreferences,
  subscribeDeviceCalendarPreferences,
  type DeviceCalendarPreferences,
} from "./preferences";

export function useDeviceCalendarPreferences(): DeviceCalendarPreferences {
  useEffect(() => {
    void loadDeviceCalendarPreferences();
  }, []);

  return useSyncExternalStore(
    subscribeDeviceCalendarPreferences,
    getDeviceCalendarPreferences,
    getDeviceCalendarPreferences,
  );
}
```

- [ ] **Step 7: 커밋**

```bash
cd /home/jhyunwoo/projects/leave
git add apps/native/src/device-calendar apps/native/test/device-calendar-preferences.test.ts
git commit -m "feat(native): 어느 기기 캘린더를 볼지 이 기기에 저장한다"
```

---

### Task 4: bridge — 기기와 닿는 유일한 자리

**Files:**

- Create: `apps/native/src/device-calendar/bridge.ts`
- Create: `apps/native/src/device-calendar/bridge.native.ts`

**Interfaces:**

- Consumes: `DeviceCalendar`, `DeviceEvent`, `PermissionState` (Task 1),
  `foldAllDay`, `foldTimed`, `toDate`, `ALL_DAY_CONVENTIONS` (Task 2)
- Produces: `deviceCalendarBridge` — 아래 다섯 함수

- [ ] **Step 1: 웹 짝(계약)을 먼저 쓴다**

Create `apps/native/src/device-calendar/bridge.ts`:

```ts
/**
 * 기기 캘린더 감싸개 — 웹(Expo web 타깃) 구현.
 * `.native.ts` 짝이 Metro의 플랫폼 확장자 규칙에 따라 기기에서 선택된다.
 *
 * 브라우저에는 읽을 기기 캘린더가 없다. 던지지 않고 "권한 없음 · 빈 목록"으로
 * 답해 설정 화면과 달력이 같은 코드로 돌게 한다 — 화면마다 플랫폼 분기를 두면
 * 그 분기가 곧 기기에서만 나는 버그가 된다.
 */

import {
  type DeviceCalendar,
  type DeviceEvent,
  type PermissionState,
} from "./types";

export interface DeviceCalendarBridge {
  getPermission(): Promise<PermissionState>;
  requestPermission(): Promise<PermissionState>;
  listCalendars(): Promise<DeviceCalendar[]>;
  /** `month`는 "YYYY-MM". 그 달에 **걸치는** 일정을 모두 준다. */
  listEvents(month: string, calendarIds: string[]): Promise<DeviceEvent[]>;
  openEvent(eventId: string): Promise<void>;
}

export const deviceCalendarBridge: DeviceCalendarBridge = {
  getPermission: async () => "denied",
  requestPermission: async () => "denied",
  listCalendars: async () => [],
  listEvents: async () => [],
  openEvent: async () => {},
};

/** 이 플랫폼에서 기기 캘린더를 읽을 수 있는가. 설정 화면의 안내 문구가 쓴다. */
export const deviceCalendarSupported = false;
```

- [ ] **Step 2: 네이티브 구현을 쓴다**

Create `apps/native/src/device-calendar/bridge.native.ts`:

```ts
/**
 * 기기 캘린더 감싸개 — iOS/Android 구현.
 *
 * **`expo-calendar`를 import하는 파일은 이것 하나뿐이다.** 화면과 훅은 `DeviceEvent`만
 * 안다. SDK를 건너며 모듈 API가 바뀌어도 고칠 자리가 한 곳이고, `Date | string`처럼
 * 화면이 알 필요 없는 모호함이 여기서 끝난다.
 *
 * SDK 57에서 `*Async` 레거시 API는 deprecated다. 쓰는 것은 현재 API —
 * `getCalendars()`, `listEvents(calendars, start, end)`, `event.openInCalendar()`,
 * `requestCalendarPermissions(writeOnly?)`.
 *
 * 쓰기는 하지 않는다. `writeOnlyAccess`도 켜지 않는다 — 우리는 읽기만 하고,
 * `app.json`이 `WRITE_CALENDAR`를 blockedPermissions로 막아 둔다.
 */

import * as Calendar from "expo-calendar";
import { monthBounds } from "@leave/shared/dates";
import { Platform } from "react-native";
import type { DeviceCalendarBridge } from "./bridge";
import { ALL_DAY_CONVENTIONS, foldAllDay, foldTimed, toDate } from "./dates";
import {
  type DeviceCalendar,
  type DeviceEvent,
  type PermissionState,
} from "./types";

/** 색이 없는 캘린더가 실제로 있다(Android의 일부 로컬 캘린더). */
const FALLBACK_COLOR = "#868685";

const CONVENTION =
  ALL_DAY_CONVENTIONS[Platform.OS === "ios" ? "ios" : "android"];

function toPermissionState(response: {
  granted: boolean;
  canAskAgain: boolean;
}): PermissionState {
  if (response.granted) return "granted";
  // 아직 물어본 적이 없으면 다시 물을 수 있다. 거부당한 뒤에는 OS가 두 번째
  // 요청을 무시하므로, 그 둘을 구별해야 설정 화면이 "설정 열기"를 보여줄 수 있다.
  return response.canAskAgain ? "undetermined" : "denied";
}

function toDeviceCalendar(calendar: Calendar.ExpoCalendar): DeviceCalendar {
  return {
    id: calendar.id,
    title: calendar.title,
    color: calendar.color ?? FALLBACK_COLOR,
    source: calendar.source?.name ?? "",
    allowsModifications: calendar.allowsModifications,
  };
}

function toDeviceEvent(
  event: Calendar.ExpoCalendarEvent,
  colorOf: (calendarId: string) => string,
): DeviceEvent {
  const start = toDate(event.startDate);
  const end = toDate(event.endDate);
  const folded = event.allDay
    ? { ...foldAllDay(start, end, CONVENTION), startTime: null, endTime: null }
    : foldTimed(start, end);
  return {
    id: event.id,
    // 제목 없는 일정이 실제로 온다. 빈 알약보다 낫다.
    title: event.title?.trim() || "제목 없음",
    startDate: folded.startDate,
    endDate: folded.endDate,
    startTime: folded.startTime,
    endTime: folded.endTime,
    calendarId: event.calendarId,
    color: colorOf(event.calendarId),
  };
}

export const deviceCalendarBridge: DeviceCalendarBridge = {
  getPermission: async () =>
    toPermissionState(await Calendar.getCalendarPermissions()),

  requestPermission: async () =>
    toPermissionState(await Calendar.requestCalendarPermissions()),

  listCalendars: async () => {
    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    return calendars.map(toDeviceCalendar);
  },

  listEvents: async (month, calendarIds) => {
    if (calendarIds.length === 0) return [];
    const { start, end } = monthBounds(month);
    // 달 경계에 걸친 일정을 놓치지 않도록 앞뒤로 하루씩 넉넉히 잡는다. 시간대
    // 차이로 KST 1일 00:00이 UTC로는 전날인 것도 여기서 함께 흡수된다.
    const from = new Date(`${start}T00:00:00Z`);
    from.setUTCDate(from.getUTCDate() - 1);
    const through = new Date(`${end}T23:59:59Z`);
    through.setUTCDate(through.getUTCDate() + 1);

    const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
    const colors = new Map(
      calendars.map((calendar) => [
        calendar.id,
        calendar.color ?? FALLBACK_COLOR,
      ]),
    );
    const events = await Calendar.listEvents(calendarIds, from, through);
    return events
      .filter((event) => event.status !== Calendar.EventStatus.CANCELED)
      .map((event) =>
        toDeviceEvent(event, (id) => colors.get(id) ?? FALLBACK_COLOR),
      );
  },

  openEvent: async (eventId) => {
    // `getEventById`는 최상위 export가 아니다. 이벤트를 id로 되찾는 길은
    // `ExpoCalendarEvent.get` 정적 메서드 하나다(build/Calendar.d.ts:21).
    const event = await Calendar.ExpoCalendarEvent.get(eventId);
    await event.openInCalendar();
  },
};

export const deviceCalendarSupported = true;
```

- [ ] **Step 3: 타입이 맞는지 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native check-types
```

기대: PASS.

위 코드는 `expo-calendar@57.0.4`의 타입 선언에서 확인한 이름으로 쓰여 있다 —
`getCalendars(entityType?)`, `listEvents(calendarIds, start, end)`,
`getCalendarPermissions(writeOnly?)`, `ExpoCalendarEvent.get(id)`,
`event.openInCalendar()`, `EntityTypes.EVENT`, `EventStatus.CANCELED`.
**실패하면 설치된 타입이 정답이다**:

```bash
grep -n "^export declare" node_modules/expo-calendar/build/Calendar.d.ts
```

- [ ] **Step 4: 커밋**

```bash
cd /home/jhyunwoo/projects/leave
git add apps/native/src/device-calendar/bridge.ts apps/native/src/device-calendar/bridge.native.ts
git commit -m "feat(native): 기기 캘린더를 읽는 감싸개를 둔다"
```

---

### Task 5: 월 단위 조회 훅

**Files:**

- Create: `apps/native/src/device-calendar/use-device-calendar-events.ts`

**Interfaces:**

- Consumes: `deviceCalendarBridge` (Task 4), `useDeviceCalendarPreferences`,
  `visibleCalendarIds` (Task 3)
- Produces:
  - `useDeviceCalendars(): { data: DeviceCalendar[] | undefined; ... }`
  - `useDeviceCalendarEvents(month: string): { data: DeviceEvent[] | undefined; ... }`
  - `deviceCalendarQueryKeys.root`, `.calendars`, `.month(month, ids)`

- [ ] **Step 1: 훅을 만든다**

Create `apps/native/src/device-calendar/use-device-calendar-events.ts`:

```ts
/**
 * 한 달치 기기 캘린더 일정 — 달력이 쓰는 훅.
 *
 * 사용처: components/calendar-scroll.tsx의 MonthBlock, screens/calendar/index.tsx.
 *
 * ## 디스크에 남지 않는다
 *
 * `lib/query-persistence.ts`의 `PERSISTED_QUERY_ROOTS`는 **허용 목록**이고
 * `"deviceCalendar"`는 거기 없다. 그래서 남의 캘린더 제목이 기기 SQLite에 남지
 * 않는다. **그 목록에 이 루트를 더하지 말 것** — 오프라인에서 다시 보여줄 값이
 * 아니라 기기에서 언제든 다시 읽을 수 있는 값이고, 리브가 보관할 이유가 없다.
 *
 * ## 네트워크를 쓰지 않으므로 `networkMode`가 다르다
 *
 * 전역 기본은 `"offlineFirst"`(app/_layout.tsx)이고 그건 통신하는 쿼리를 위한 값이다.
 * 기기 캘린더는 통신하지 않으므로 신호가 없다고 재시도가 멈출 이유가 없다 —
 * 그리고 이 앱의 사용자는 신호가 없는 곳에서 달력을 본다.
 *
 * ## 다시 읽는 시점
 *
 * 앞으로 돌아올 때 알아서 다시 읽는다. `configureQueryOnlineManager()`가 React
 * Query의 `focusManager`를 `AppState`에 이어 두었고 `refetchOnWindowFocus`가 기본
 * 켜짐이라, 따로 무효화를 걸지 않는다. 기기 캘린더는 앱 밖에서 바뀌고 사용자는
 * 캘린더 앱에서 고친 뒤 곧장 리브로 돌아오므로, 이 자동 재조회가 이 기능에서
 * 가장 흔한 "왜 안 바뀌지"를 막는다.
 */

import { useQuery } from "@tanstack/react-query";
import { deviceCalendarBridge } from "./bridge";
import { visibleCalendarIds } from "./preferences";
import { useDeviceCalendarPreferences } from "./use-device-calendar-preferences";
import { type DeviceCalendar, type DeviceEvent } from "./types";

export const deviceCalendarQueryKeys = {
  root: ["deviceCalendar"] as const,
  calendars: ["deviceCalendar", "calendars"] as const,
  month: (month: string, calendarIds: readonly string[]) =>
    ["deviceCalendar", "month", month, calendarIds.join(",")] as const,
};

/** 이 기기에 붙어 있는 캘린더 목록. 설정 화면과 색 조회가 함께 쓴다. */
export function useDeviceCalendars() {
  const prefs = useDeviceCalendarPreferences();
  return useQuery<DeviceCalendar[]>({
    queryKey: deviceCalendarQueryKeys.calendars,
    queryFn: () => deviceCalendarBridge.listCalendars(),
    enabled: prefs.enabled,
    networkMode: "always",
  });
}

export function useDeviceCalendarEvents(month: string) {
  const prefs = useDeviceCalendarPreferences();
  const calendars = useDeviceCalendars();
  const ids = visibleCalendarIds(prefs, calendars.data ?? []);

  return useQuery<DeviceEvent[]>({
    queryKey: deviceCalendarQueryKeys.month(month, ids),
    queryFn: () => deviceCalendarBridge.listEvents(month, ids),
    // 고른 캘린더가 없으면 네이티브를 부를 이유가 없다. 권한은 bridge가 아니라
    // 설정 화면이 지킨다 — 권한이 없으면 enabled가 켜지지 않는다.
    enabled: prefs.enabled && ids.length > 0,
    networkMode: "always",
  });
}
```

- [ ] **Step 2: 타입을 확인하고 커밋한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native check-types
git add apps/native/src/device-calendar/use-device-calendar-events.ts
git commit -m "feat(native): 달마다 기기 캘린더 일정을 읽는다"
```

---

### Task 6: 읽기 전용을 드래그가 지키게 한다

칸에 외부 알약을 그리기 **전에** 한다. 먼저 그리면 그 사이 커밋에서는 외부 일정을
길게 눌렀을 때 개인 일정이 끌려간다.

**Files:**

- Modify: `apps/native/src/components/calendar-drag/grab-target.ts`
- Modify: `apps/native/src/components/calendar-drag/use-day-cell-drag.ts:28-33`
- Test: `apps/native/test/calendar-grab-target.test.ts`

**Interfaces:**

- Produces: `GrabCandidate<T> = { subject: T | null; rect: GrabRect | null }`,
  `DayCellSlot = "leave" | "personal" | "external"`,
  `DayCellSubject = { slot: DayCellSlot; subject: CalendarDragSubject | null }`

- [ ] **Step 1: 막개 테스트를 더한다**

`apps/native/test/calendar-grab-target.test.ts` 맨 아래에 더한다:

```ts
describe("막개 후보", () => {
  it("가장 가까운 것이 막개면 아무것도 집지 않는다", () => {
    expect(
      nearestGrabTarget(60, [
        { subject: "leave", rect: { y: 0, height: 12 } },
        { subject: null, rect: { y: 50, height: 12 } },
      ]),
    ).toBeNull();
  });

  it("막개가 멀면 진짜 후보가 이긴다", () => {
    expect(
      nearestGrabTarget(4, [
        { subject: "leave", rect: { y: 0, height: 12 } },
        { subject: null, rect: { y: 50, height: 12 } },
      ]),
    ).toBe("leave");
  });

  it("막개만 있으면 null이다", () => {
    expect(
      nearestGrabTarget(55, [{ subject: null, rect: { y: 50, height: 12 } }]),
    ).toBeNull();
  });

  it("레이아웃이 아직 없고 첫 후보가 막개면 null이다", () => {
    expect(
      nearestGrabTarget(10, [
        { subject: null, rect: null },
        { subject: "leave", rect: null },
      ]),
    ).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native test -- calendar-grab-target
```

기대: FAIL — 첫 테스트가 `"leave"`를 돌려준다(막개를 모르므로 건너뛴다).

- [ ] **Step 3: `grab-target.ts`를 넓힌다**

`GrabCandidate`의 주석과 타입을 바꾸고, `nearestGrabTarget`의 시그니처를 맞춘다:

```ts
/**
 * 집을 수 있는 항목 하나. 아직 레이아웃이 오지 않았으면 `rect`가 null이다.
 *
 * `subject`가 `null`인 후보는 **막개**다 — 자리는 차지하되 집히지 않는다. 기기
 * 캘린더 알약처럼 읽기 전용인 것이 여기 들어온다. 막개가 없으면 그 위를 길게 눌렀을
 * 때 "가장 가까운" 규칙이 바로 위의 개인 일정을 집어, 읽기 전용이어야 할 것이 남의
 * 일정을 옮기는 손잡이가 된다.
 */
export type GrabCandidate<T> = { subject: T | null; rect: GrabRect | null };

export function nearestGrabTarget<T>(
  touchY: number,
  candidates: readonly GrabCandidate<T>[],
): T | null {
  let best: { subject: T | null; distance: number } | null = null;
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

`nearestGrabTarget` 머리주석의 마지막 문단에 한 줄을 더한다:

```
 * 가장 가까운 것이 막개면 `null`이다 — 그 위의 길게 누르기는 아무것도 집지 않는다.
```

- [ ] **Step 4: 통과를 확인한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native test -- calendar-grab-target
```

기대: PASS (기존 테스트 포함 전부).

- [ ] **Step 5: 슬롯을 더한다**

`apps/native/src/components/calendar-drag/use-day-cell-drag.ts`의 28-33행:

```ts
/**
 * 칸 안에서 항목이 놓이는 자리. 위에서 아래 순서다.
 * `external`은 기기 캘린더 알약이다 — 자리만 차지하고 집히지 않는다.
 */
export type DayCellSlot = "leave" | "personal" | "external";

export type DayCellSubject = {
  slot: DayCellSlot;
  /** `null`이면 막개다(grab-target.ts). */
  subject: CalendarDragSubject | null;
};
```

`onStart` 안의 `subjects.map`은 그대로 둔다 — `subject`가 `null`이면 그대로
막개로 넘어간다. `.enabled(subjects.length > 0 && ...)`도 그대로다: 막개뿐인 칸에서도
제스처가 붙어야 그 위의 길게 누르기가 아무것도 집지 않고 끝난다.

- [ ] **Step 6: 타입 확인과 커밋**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native check-types
git add apps/native/src/components/calendar-drag apps/native/test/calendar-grab-target.test.ts
git commit -m "fix(native): 읽기 전용 알약 위에서는 아무것도 집히지 않는다"
```

---

### Task 7: 칸에 알약을 그린다

**Files:**

- Modify: `apps/native/src/components/month-calendar.tsx`
- Modify: `apps/native/src/components/calendar-scroll.tsx:318-380`

**Interfaces:**

- Consumes: `DeviceEvent` (Task 1), `useDeviceCalendarEvents` (Task 5),
  `DayCellSlot` (Task 6)

- [ ] **Step 1: `MonthCalendar`가 `deviceEvents`를 받게 한다**

`month-calendar.tsx`의 import에 더한다:

```ts
import { type DeviceEvent } from "@/device-calendar/types";
```

빈 목록 상수 옆(82행 근처)에 더한다:

```ts
const EMPTY_DEVICE_EVENTS: readonly DeviceEvent[] = [];
```

props(159행 `personalEvents?: PersonalEvent[];` 아래)에 더한다:

```ts
  /** 기기 캘린더에서 읽어 온 일정. 보기 전용이라 드래그 대상이 아니다. */
  deviceEvents?: readonly DeviceEvent[];
```

풀어 쓰는 자리(192행 `personalEvents,` 옆)에 `deviceEvents,`를 더하고,
개인 일정 인덱스 옆(244행)에 같은 모양으로 더한다:

```ts
const deviceIndex = useMemo(
  () => buildRangeIndex(deviceEvents, gridStart, gridEnd),
  [deviceEvents, gridStart, gridEnd],
);
```

칸에 넘기는 자리(`personal={...}` 옆)에 더한다:

```ts
  device={deviceIndex.get(cell.date) ?? EMPTY_DEVICE_EVENTS}
```

- [ ] **Step 2: 칸이 막개를 등록하고 알약을 그린다**

`DayCell`의 props(366행 `personal: readonly PersonalEvent[];` 아래)에 더한다:

```ts
  device: readonly DeviceEvent[];
```

풀어 쓰는 목록에 `device,`를 더한다.

`subjects`(410-421행)를 바꾼다 — 막개는 **항상 마지막**이다. 칸에서 아래에 그려지므로
`nearestGrabTarget`이 거리로 고를 때 순서가 화면과 같아야 한다:

```ts
const personalEventId = personal[0]?.id ?? null;
const hasDevice = device.length > 0;
const subjects = useMemo<DayCellSubject[]>(() => {
  const list: DayCellSubject[] = [];
  if (leaveId)
    list.push({ slot: "leave", subject: { kind: "leave", leaveId } });
  if (personalEventId)
    list.push({
      slot: "personal",
      subject: { kind: "personalEvent", eventId: personalEventId },
    });
  // 기기 캘린더 알약은 자리만 차지한다. 이것이 없으면 그 위를 길게 눌렀을 때
  // 바로 위의 개인 일정이 집힌다(grab-target.ts의 막개).
  if (hasDevice) list.push({ slot: "external", subject: null });
  return list;
}, [leaveId, personalEventId, hasDevice]);
```

개인 일정 알약 블록(594-613행) **바로 아래에** 더한다:

```tsx
{
  /* 기기 캘린더 일정. 중성색 외곽선과 캘린더 색 점으로 "내가 리브에
              적은 것"과 가른다. 여기서 수정할 수는 없다 — 고치는 곳은 기기
              캘린더 앱 하나여야 두 벌이 생기지 않는다. */
}
{
  !compact && device.length > 0 && (
    <View
      onLayout={(event) => {
        rects.current.external = event.nativeEvent.layout;
      }}
      style={styles.devicePill}
    >
      <View style={[styles.deviceDot, { backgroundColor: device[0]!.color }]} />
      <Text style={styles.deviceText} numberOfLines={1} ellipsizeMode="tail">
        {personalEventCellLabel(device)}
      </Text>
    </View>
  );
}
```

- [ ] **Step 3: 스타일을 더한다**

`personalText` 다음에 더한다:

```ts
  devicePill: {
    alignSelf: "stretch",
    marginHorizontal: 1,
    minHeight: 14,
    paddingHorizontal: 4,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.hairline,
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  deviceDot: { width: 5, height: 5, borderRadius: 3 },
  deviceText: {
    flex: 1,
    minWidth: 0,
    fontSize: 9,
    lineHeight: 11,
    color: colors.mute,
  },
```

- [ ] **Step 4: 접근성 라벨에 넣는다**

칸에서 `+N`으로 접힌 제목이 스크린리더에서도 사라지면 그 정보는 어디에도 없다.
`Pressable`의 `accessibilityLabel`(475행)에서 개인 일정 조각 **바로 뒤**,
`blocked` 조각 **앞에** 끼운다. 개인 일정이 이미 같은 모양으로 들어가 있다:

```ts
// 바꾸기 전 (475행 끝)
}${personal.length ? `, 개인 일정 ${personalForLabel.map((event) => event.title).join(", ")}` : ""}${

// 바꾼 뒤
}${personal.length ? `, 개인 일정 ${personalForLabel.map((event) => event.title).join(", ")}` : ""}${device.length ? `, 기기 캘린더 ${device.map((event) => event.title).join(", ")}` : ""}${
```

- [ ] **Step 5: `MonthBlock`을 배선한다**

`calendar-scroll.tsx`의 import에 더한다:

```ts
import { useDeviceCalendarEvents } from "@/device-calendar/use-device-calendar-events";
```

`MonthBlock` 안, `const personalEvents = usePersonalEvents(props.month);` 다음 줄:

```ts
const deviceEvents = useDeviceCalendarEvents(props.month);
```

`<MonthCalendar ... />`의 `personalEvents={personalEvents.data?.events}` 다음:

```tsx
      deviceEvents={deviceEvents.data}
```

- [ ] **Step 6: 확인하고 커밋한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint
git add apps/native/src/components/month-calendar.tsx apps/native/src/components/calendar-scroll.tsx
git commit -m "feat(native): 달력 칸에 기기 캘린더 일정을 함께 그린다"
```

---

### Task 8: 하루 패널에 목록을 더한다

**Files:**

- Modify: `apps/native/src/screens/calendar/day-panel.tsx`
- Modify: `apps/native/src/screens/calendar/index.tsx:381, 594, 792`

- [ ] **Step 1: `DayPanel`이 `deviceEvents`를 받게 한다**

import에 더한다:

```ts
import { deviceCalendarBridge } from "@/device-calendar/bridge";
import { type DeviceEvent } from "@/device-calendar/types";
```

props의 `onOpenPersonalEvent` 다음에 더한다:

```ts
  /** 이 날이 속한 달의 기기 캘린더 일정. 보기 전용이다. */
  deviceEvents?: readonly DeviceEvent[];
```

`dayEvents` 계산 아래에 더한다:

```ts
const deviceDayEvents = (props.deviceEvents ?? []).filter(
  (event) => event.startDate <= date && date <= event.endDate,
);
```

- [ ] **Step 2: 섹션을 그린다**

`내 개인 일정` 블록 바로 다음, `addRow` 앞에 넣는다:

```tsx
{
  deviceDayEvents.length > 0 && (
    <View style={styles.personalList}>
      <Text style={styles.personalHeading} selectable>
        기기 캘린더 {deviceDayEvents.length}건
      </Text>
      {deviceDayEvents.map((event) => (
        <DeviceEventRow key={event.id} event={event} />
      ))}
    </View>
  );
}
```

- [ ] **Step 3: 행 컴포넌트를 더한다**

`PersonalEventRow` 다음에 넣는다:

```tsx
/**
 * 기기 캘린더 일정 한 줄. 누르면 기기 캘린더 앱에서 그 일정을 연다.
 *
 * 리브 안에는 수정 경로를 두지 않는다 — 고치는 곳이 한 군데여야 두 벌이 생기지 않고,
 * 애초에 이 화면은 남의 앱 데이터를 빌려 보고 있을 뿐이다.
 */
function DeviceEventRow(props: { event: DeviceEvent }) {
  const styles = useStyles();
  const { event } = props;
  const time = event.startTime
    ? `${event.startTime}${event.endTime ? `–${event.endTime}` : ""}`
    : null;
  const span =
    event.startDate === event.endDate
      ? null
      : fmtRangeTiny(event.startDate, event.endDate);
  const meta = [span, time].filter(Boolean).join(" · ");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`기기 캘린더 일정 ${event.title} 캘린더 앱에서 열기`}
      onPress={() => void deviceCalendarBridge.openEvent(event.id)}
      style={styles.personalRow}
    >
      <View style={styles.deviceRowTitle}>
        <View style={[styles.deviceRowDot, { backgroundColor: event.color }]} />
        <Text style={styles.personalTitle} numberOfLines={2}>
          {event.title}
        </Text>
      </View>
      {meta ? <Text style={styles.personalMeta}>{meta}</Text> : null}
    </Pressable>
  );
}
```

스타일에 더한다(`personalMeta` 다음):

```ts
  deviceRowTitle: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  deviceRowDot: { width: 8, height: 8, borderRadius: 4 },
```

- [ ] **Step 4: 달력 화면이 넘긴다**

`screens/calendar/index.tsx`의 import에 더한다:

```ts
import { useDeviceCalendarEvents } from "@/device-calendar/use-device-calendar-events";
```

381행 `const panelPersonalEvents = usePersonalEvents(panelMonth);` 다음:

```ts
// 그 달의 기기 캘린더 일정. 달력 스크롤이 이미 채워 둔 캐시를 그대로 다시 쓴다.
const panelDeviceEvents = useDeviceCalendarEvents(panelMonth);
```

**두 자리 모두**(594행과 792행 근처) `personalEvents={panelPersonalEvents.data?.events}`
다음에 더한다. 하나만 고치면 좁은 창과 넓은 창이 다른 것을 보여준다:

```tsx
                deviceEvents={panelDeviceEvents.data}
```

- [ ] **Step 5: 확인하고 커밋한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint
git add apps/native/src/screens/calendar/day-panel.tsx apps/native/src/screens/calendar/index.tsx
git commit -m "feat(native): 날짜 상세에서 기기 캘린더 일정을 보고 캘린더 앱으로 연다"
```

---

### Task 9: 설정 화면

**Files:**

- Create: `apps/native/src/screens/calendar-settings.tsx`
- Create: `apps/native/src/app/calendar-settings.tsx`
- Modify: `apps/native/src/app/_layout.tsx:368-378` (근처에 Stack.Screen 추가)
- Modify: `apps/native/src/screens/profile.tsx` (위젯 카드 다음에 카드 추가)

- [ ] **Step 1: 화면을 만든다**

Create `apps/native/src/screens/calendar-settings.tsx`:

```tsx
/**
 * 기기 캘린더 설정 화면 — 무엇을 달력에 겹쳐 볼지 이 기기에서 고른다.
 *
 * 사용처: 라우트 `app/calendar-settings.tsx`. 프로필 탭에서 들어온다.
 *
 * 값의 의미와 "왜 기기마다 따로 두는가"는 `device-calendar/preferences.ts` 머리주석에
 * 있다. 이 화면은 그 값을 고르는 방법과 권한을 다룬다.
 *
 * ## 권한은 토글을 켤 때만 묻는다
 *
 * 화면에 들어온 것만으로 묻지 않는다. 무엇에 쓰는지 읽기도 전에 시스템 창이 뜨면
 * 대부분 거부하고, **거부는 되돌리기 비싸다** — OS가 두 번째 요청을 무시하므로
 * 그 뒤로는 기기 설정까지 다녀와야 한다.
 */

import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ResponsiveGrid, useWindowSizeClass } from "@/adaptive";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { NativeCheckbox } from "@/components/native-checkbox";
import {
  deviceCalendarBridge,
  deviceCalendarSupported,
} from "@/device-calendar/bridge";
import {
  defaultCalendarIds,
  saveDeviceCalendarPreferences,
} from "@/device-calendar/preferences";
import { useDeviceCalendarPreferences } from "@/device-calendar/use-device-calendar-preferences";
import { useDeviceCalendars } from "@/device-calendar/use-device-calendar-events";
import { type PermissionState } from "@/device-calendar/types";
import { layout, makeStyles, radius, spacing } from "@/theme";

export function CalendarSettingsScreen() {
  const styles = useStyles();
  const { sizeClass, isCompact } = useWindowSizeClass();
  const preferences = useDeviceCalendarPreferences();
  const calendars = useDeviceCalendars();
  const [permission, setPermission] = useState<PermissionState>("undetermined");

  // 권한은 앱 밖에서 바뀐다. 화면에 들어올 때마다 다시 읽지 않으면 기기 설정에서
  // 권한을 거둔 뒤에도 토글이 켜진 채로 남아 "켜 뒀는데 아무것도 안 보인다"가 된다.
  useEffect(() => {
    void (async () => {
      const state = await deviceCalendarBridge.getPermission();
      setPermission(state);
      if (state !== "granted" && preferences.enabled)
        await saveDeviceCalendarPreferences({ ...preferences, enabled: false });
    })();
    // 마운트할 때 한 번. 설정에서 돌아오는 것은 화면 재마운트로 잡힌다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleEnabled = async (next: boolean) => {
    if (!next) {
      await saveDeviceCalendarPreferences({ ...preferences, enabled: false });
      return;
    }
    let state = permission;
    if (state !== "granted") {
      state = await deviceCalendarBridge.requestPermission();
      setPermission(state);
    }
    if (state !== "granted") return;

    // 처음 켜는 것이면 기본 선택을 채운다. 이미 고른 것이 있으면 건드리지 않는다.
    const list = await deviceCalendarBridge.listCalendars();
    const calendarIds =
      preferences.calendarIds.length > 0
        ? preferences.calendarIds
        : defaultCalendarIds(list);
    await saveDeviceCalendarPreferences({ enabled: true, calendarIds });
    await calendars.refetch();
  };

  const toggleCalendar = (id: string, next: boolean) => {
    const calendarIds = next
      ? [...preferences.calendarIds, id]
      : preferences.calendarIds.filter((item) => item !== id);
    void saveDeviceCalendarPreferences({ ...preferences, calendarIds });
  };

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[
        styles.content,
        {
          maxWidth: isCompact
            ? layout.readableContent
            : layout.workspaceContent,
        },
      ]}
      testID="calendar-settings"
    >
      {process.env.EXPO_OS === "web" && (
        <Text style={styles.webTitle}>캘린더 연동</Text>
      )}

      <ResponsiveGrid sizeClass={sizeClass} columns={{ compact: 1, medium: 2 }}>
        <ContentPanel style={styles.card}>
          <Text selectable style={styles.cardTitle}>
            외부 캘린더 일정 보기
          </Text>
          <Text selectable style={styles.cardBody}>
            기기 캘린더를 읽어 달력 탭에만 겹쳐 보여줍니다. 리브 서버에 올라가지
            않고, 친구에게 보이지 않고, 리브에서는 고칠 수 없어요. 일정을
            고치려면 줄을 눌러 캘린더 앱에서 열면 됩니다.
          </Text>

          {!deviceCalendarSupported ? (
            <Text selectable style={styles.hint}>
              이 기기에서는 쓸 수 없어요. 휴대폰이나 태블릿의 리브 앱에서 켜
              주세요.
            </Text>
          ) : permission === "denied" ? (
            <>
              <Text selectable style={styles.hint}>
                캘린더 접근이 꺼져 있어요. 기기 설정에서 리브에 캘린더를
                허용하면 여기서 켤 수 있습니다.
              </Text>
              <Button
                icon="settings"
                title="기기 설정 열기"
                variant="secondary"
                onPress={() => void Linking.openSettings()}
                testID="device-calendar-open-settings"
              />
            </>
          ) : (
            <NativeCheckbox
              value={preferences.enabled}
              onValueChange={(next) => void toggleEnabled(next)}
              label="달력 탭에 기기 캘린더 일정 보기"
              testID="device-calendar-enabled"
            />
          )}
        </ContentPanel>

        <ContentPanel style={styles.card}>
          <Text selectable style={styles.cardTitle}>
            가져올 캘린더
          </Text>
          <Text selectable style={styles.cardBody}>
            고른 캘린더의 일정만 달력에 나와요. 공휴일·생일처럼 구독해 둔
            캘린더는 기본으로 꺼 둡니다 — 리브가 공휴일을 이미 표시하고
            있어서예요.
          </Text>

          {!preferences.enabled ? (
            <Text selectable style={styles.hint}>
              위 스위치를 켜면 이 기기의 캘린더 목록이 나옵니다.
            </Text>
          ) : calendars.isPending ? (
            <Text selectable style={styles.hint}>
              캘린더를 읽는 중이에요.
            </Text>
          ) : (calendars.data ?? []).length === 0 ? (
            <Text selectable style={styles.hint}>
              보여줄 캘린더가 없어요. 기기 설정에서 리브에 보여줄 캘린더를 더
              고를 수 있습니다.
            </Text>
          ) : (
            <View style={styles.list}>
              {(calendars.data ?? []).map((calendar) => (
                <View key={calendar.id} style={styles.calendarRow}>
                  <View
                    style={[styles.swatch, { backgroundColor: calendar.color }]}
                  />
                  <View style={styles.calendarBody}>
                    <NativeCheckbox
                      value={preferences.calendarIds.includes(calendar.id)}
                      onValueChange={(next) =>
                        toggleCalendar(calendar.id, next)
                      }
                      label={calendar.title}
                      testID={`device-calendar-${calendar.id}`}
                    />
                    {calendar.source ? (
                      <Text style={styles.calendarSource}>
                        {calendar.source}
                      </Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          )}
        </ContentPanel>
      </ResponsiveGrid>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    width: "100%",
    alignSelf: "center",
    padding: spacing.lg,
    paddingTop: process.env.EXPO_OS === "web" ? 80 : spacing.lg,
    gap: spacing.lg,
    paddingBottom: 120,
  },
  webTitle: { fontSize: 28, fontWeight: "800", color: colors.ink },
  card: { padding: spacing.xl, gap: spacing.md },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.ink },
  cardBody: { fontSize: 13, lineHeight: 20, color: colors.body },
  hint: { fontSize: 12, lineHeight: 18, color: colors.mute },
  list: { gap: spacing.xs },
  calendarRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  calendarBody: { flex: 1, minWidth: 0 },
  calendarSource: { fontSize: 12, color: colors.mute, marginTop: 2 },
  swatch: {
    width: 12,
    height: 12,
    borderRadius: radius.sm,
    marginTop: 14,
  },
}));
```

- [ ] **Step 2: 라우트를 만든다**

Create `apps/native/src/app/calendar-settings.tsx`:

```tsx
/**
 * 라우트 `캘린더 연동` → `screens/calendar-settings.tsx`.
 * 프로필 탭에서 들어오고, 탭 밖의 최상위 라우트라 어디서 열어도 같은 화면이다.
 */

import { CalendarSettingsScreen } from "@/screens/calendar-settings";

export default function CalendarSettingsRoute() {
  return <CalendarSettingsScreen />;
}
```

- [ ] **Step 3: 헤더를 등록한다**

`apps/native/src/app/_layout.tsx`의 `widget-settings` `<Stack.Screen>` 바로 다음에,
같은 옵션으로 넣는다:

```tsx
<Stack.Screen
  name="calendar-settings"
  options={{
    headerShown: true,
    title: "캘린더 연동",
    headerBackTitle: "프로필",
    headerTransparent: process.env.EXPO_OS === "ios",
    headerShadowVisible: false,
    headerTintColor: colors.brand,
    headerTitleStyle: { fontWeight: "600", color: colors.ink },
  }}
/>
```

- [ ] **Step 4: 프로필에서 들어가게 한다**

`screens/profile.tsx`의 `홈 화면 위젯` `<ContentPanel>` **다음에** 넣는다:

```tsx
<ContentPanel style={styles.card}>
  <Text selectable style={styles.sectionTitle}>
    캘린더 연동
  </Text>
  <Text selectable style={styles.sectionBody}>
    아이폰·안드로이드 기본 캘린더의 일정을 달력 탭에서 휴가와 함께 볼 수 있어요.
    어느 캘린더를 가져올지 여기서 고릅니다.
  </Text>
  <Button
    icon="settings"
    title="캘린더 연동 설정"
    variant="secondary"
    onPress={() => router.push("/calendar-settings")}
    testID="open-calendar-settings"
  />
</ContentPanel>
```

- [ ] **Step 5: 확인하고 커밋한다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint
git add apps/native/src/screens/calendar-settings.tsx apps/native/src/app/calendar-settings.tsx \
        apps/native/src/app/_layout.tsx apps/native/src/screens/profile.tsx
git commit -m "feat(native): 설정에서 겹쳐 볼 기기 캘린더를 고른다"
```

---

### Task 10: 실기기 검증과 품질 게이트

**Files:** 없음 (고칠 것이 나오면 해당 태스크의 파일)

- [ ] **Step 1: 품질 게이트를 돌린다**

```bash
cd /home/jhyunwoo/projects/leave && pnpm quality
```

기대: 전부 PASS. 실패하면 고치고 다시 돌린다.

- [ ] **Step 2: fingerprint가 바뀌었음을 확인한다**

```bash
cd /home/jhyunwoo/projects/leave/apps/native && npx expo-updates fingerprint:generate --platform ios \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['hash'])"
```

기대: 이전과 **다른** 해시. 같다면 네이티브 모듈이 링크되지 않은 것이니 설치를 다시 본다.
이 값이 달라졌다는 것은 **OTA로 배달할 수 없다**는 확인이다.

- [ ] **Step 3: 실기기에서 흐름을 확인한다**

iOS와 Android 양쪽에서:

1. 프로필 → 캘린더 연동 → 토글을 켠다 → 시스템 권한 창이 뜬다 → 허용.
2. 캘린더 목록이 나오고, 구독 캘린더(공휴일·생일)가 **꺼져** 있다.
3. 달력 탭 — 기기 일정이 있는 칸에 중성색 알약과 캘린더 색 점이 보인다.
4. **사흘짜리 종일 일정이 정확히 사흘 칸에 걸쳐 있다.** 하루 밀리거나 길면
   Task 2의 `ALL_DAY_CONVENTIONS`를 고치고 테스트를 맞춘다.
5. 날짜를 누르면 `기기 캘린더 N건`이 보이고, 줄을 누르면 캘린더 앱이 열린다.
6. **외부 알약을 길게 누른다 — 아무것도 들리지 않아야 한다.** 개인 일정이
   들려 올라가면 Task 6이 덜 된 것이다.
7. 캘린더 앱에서 일정을 하나 고치고 리브로 돌아온다 → 달력이 새 제목을 보여준다.
8. 토글을 끈다 → 달력에서 즉시 사라진다.
9. 기기 설정에서 캘린더 권한을 거둔다 → 설정 화면에 "기기 설정 열기"가 보이고
   토글이 꺼져 있다.

- [ ] **Step 4: 가장 붐비는 칸을 본다**

휴가·개인 일정·기기 일정·출타자가 모두 있는 날을 하나 만들어 92px 칸이 넘치지 않는지
본다. 넘치면 기기 알약을 가장 먼저 접는다 — 리브가 책임지는 정보가 남의 캘린더보다
앞선다.

- [ ] **Step 5: 마지막 커밋**

```bash
cd /home/jhyunwoo/projects/leave && git status --short
# 남은 수정이 있으면 해당 태스크 범위로 커밋한다
```

---

## 배포

이 기능은 **OTA로 나가지 않는다.** `deploy-app` skill을 따라 새 EAS 빌드를 만들고
스토어에 제출한다. 심사에서 캘린더 권한의 용도를 물으면 답은 하나다 —
"사용자의 기존 일정을 앱 안에서 함께 보여주기 위해 읽기만 하며, 어떤 캘린더 데이터도
서버로 전송하거나 저장하지 않는다."
