# 외부 캘린더 내보내기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 리브의 외출·외박·휴가·개인 일정·부대 일정을 아이폰·구글 캘린더(구독 URL)와 안드로이드 기기 캘린더(직접 쓰기)에서 보이게 한다.

**Architecture:** `packages/shared`의 순수 함수 `buildFeedItems`가 DB 행을 `FeedItem[]`으로 바꾸고, `renderIcs`가 그것을 iCalendar 문자열로 만든다. API는 `/calendar-feed`(인증: 링크 관리 + JSON 항목)와 `/calendar/:token.ics`(무인증 피드)를 연다. 웹·앱은 링크를 관리하고, 안드로이드는 JSON 항목을 받아 기기의 `리브` 로컬 캘린더에 다시 쓴다.

**Tech Stack:** Hono + @hono/zod-openapi on Cloudflare Workers, D1 + drizzle, React Query (`packages/client`), React (web), Expo SDK 57 + expo-router (native), `expo-calendar`(릴리스 2), vitest, node:test.

**Spec:** `docs/superpowers/specs/2026-10-12-calendar-feed-design.md`

## Global Constraints

- 내보내는 휴가 상태: `rejected`·`cancelled`를 뺀 전부. `draft`는 제목 맨 앞에 `(초안) `.
- 휴가 제목 머리: 구간이 전부 외출이면 `[외출]`, 전부 외박이면 `[외박]`, 그 밖에는 `[휴가]`.
- 조회 범위: 서울 오늘 기준 **6개월 전**(`addMonthsClamped(today, -6)`)부터 끝나는 일정 전부.
- 부대 일정은 **지금 소속 그룹**의 것만, 제목 앞에 `[그룹 이름] `.
- ICS: CRLF, **75바이트** 접기(글자 중간 금지), TEXT 이스케이프, 종일 `DTEND` = 끝날 + 1일, `TZID=Asia/Seoul` + `VTIMEZONE`, `UID` = `<uid>@leave.moveto.kr`.
- 구독 토큰은 `generateSessionToken()`으로 만들고 **원문 저장**한다. 재발급은 덮어쓰기라 예전 URL은 즉시 404.
- 빈 200 금지: 피드 조립 실패는 500(전역 `onError`). 빈 피드는 구독 캘린더의 모든 일정을 지운다.
- 릴리스 1(Task 1–9)은 새 네이티브 모듈 없이 OTA로 나간다. 릴리스 2(Task 10–16)는 `expo-calendar`가 들어가 **iOS·Android 모두 새 스토어 빌드**가 필요하다.
- 안드로이드 직접 쓰기는 **모든 안드로이드**. iOS에서는 동작하지 않는다(no-op).
- 앱이 쓰는 기기 캘린더는 우리가 만든 `리브` 하나뿐이다. 다른 캘린더는 읽지도 고치지도 않는다.
- 로그아웃·401·탈퇴 시 `리브` 기기 캘린더를 지운다.
- 코드 주석은 한국어로, 주변 파일의 밀도와 말투를 따른다. antislop 규칙을 따른다.

### 스펙에서 달라진 점 (구현 중 발견, 스펙도 함께 고친다 — Task 4 Step 1)

1. **피드 rate limit은 IP가 아니라 피드 주인 단위다.** `rateLimit`은 비로그인 요청을 IP로 세는데, 구글 캘린더는 **모든 사용자의 피드를 같은 구글 IP 대역에서** 받아 간다. IP 단위면 한 사람의 피드가 모두의 갱신을 막는다. 토큰으로 주인을 먼저 찾아 `c.set("user", …)`한 뒤 같은 미들웨어를 건다.
2. **접속 기록에서 토큰을 가린다.** `access_logs.path`에 요청 경로가 그대로 남고 관리 화면이 그 표를 읽는다. `/calendar/<토큰>.ics`는 `/calendar/:token`으로 바꿔 저장한다.
3. **경로:** 인증 라우트는 `/users/me/calendar-feed`가 아니라 `/calendar-feed`(`GET`·`POST`·`DELETE /`, `GET /items`)에 둔다. `users` 라우터는 `/{username}`과 경로가 겹치는 이유로 라우트마다 미들웨어를 단다(users.contract.ts 머리주석). 새 라우터로 떼면 그 함정을 피한다.
4. **순수 로직은 `packages/shared`에 둔다**(`calendar-feed.ts`, `ics.ts`). API 테스트는 wrangler를 띄워야만 돌고, shared에는 vitest가 있다.
5. **시간 규칙 보강:** 시작 시간만 있는 **여러 날** 일정은 시각 일정으로 만들면 시작 순간 하나로 줄어든다. 그래서 "시작 시간이 있고 (끝 시간이 있거나 하루짜리)"일 때만 시각 일정이고, 나머지는 종일 + 설명 첫 줄 `HH:mm~HH:mm`이다.

## Review Focus

1. **구글이 같은 IP로 여러 사용자의 피드를 받는다** → 한 사용자의 잦은 갱신이 다른 사용자 피드를 429로 막으면 안 된다. Task 5 테스트: 두 사용자 피드를 같은 요청자에게서 번갈아 61번 이상 받아도 둘 다 200.
2. **한글이 긴 제목·메모** → 접힌 줄이 75바이트를 넘거나 글자가 깨지면 아이폰이 일정을 버린다. Task 1 테스트: 한글 200자 제목을 접고 펼쳐 원문과 같은지, 모든 줄이 75바이트 이하인지.
3. **재발급 직후 옛 링크** → 바로 404여야 한다(캐시된 200이 남으면 유출된 링크가 계속 산다). Task 4 테스트.
4. **다른 사용자의 일정 섞임** → 같은 그룹 동료의 휴가·개인 일정이 내 피드에 나오면 안 된다(부대 일정만 공유된다). Task 5 테스트.
5. **안드로이드 종일 일정의 날짜 밀림** → 서울 자정으로 쓰면 삼성 캘린더에서 하루 앞당겨 보인다. Task 11 테스트: 종일 일정 시작이 `Date.UTC(…)` 자정, 끝이 끝날 + 1일 UTC 자정.

---

## File Structure

**릴리스 1**

| 파일 | 책임 |
|---|---|
| `packages/shared/src/ics.ts` (생성) | `FeedItem[]` → iCalendar 문자열. 이스케이프·접기 |
| `packages/shared/src/calendar-feed.ts` (생성) | `FeedItem` 타입, DB 행 → `FeedItem[]`, 조회 시작일, 구독 링크(webcal·구글) |
| `packages/shared/src/index.ts` (수정) | 위 두 모듈 내보내기 |
| `packages/shared/test/ics.test.ts`, `calendar-feed.test.ts` (생성) | 순수 함수 테스트 |
| `apps/api/src/db/schema.ts` (수정) | `calendarFeeds` 표 |
| `apps/api/migrations/0039_calendar_feeds.sql` (생성) | 표 생성 |
| `apps/api/src/lib/delete-account.ts` (수정) | 지워지는 목록에 `calendar_feeds` |
| `apps/api/src/lib/calendar-feed.ts` (생성) | 사용자 한 명의 피드 항목 조회(D1 batch) |
| `apps/api/src/routes/calendar-feed.contract.ts` (생성) | 인증 라우트 OpenAPI 명세 |
| `apps/api/src/routes/calendar-feed.ts` (생성) | 링크 조회·발급·끄기, JSON 항목 |
| `apps/api/src/routes/calendar-public.ts` (생성) | `GET /calendar/:file` 무인증 피드 |
| `apps/api/src/middleware/access-log.ts` (수정) | 피드 토큰 가리기 |
| `apps/api/src/index.ts` (수정) | 두 라우터 마운트 |
| `apps/api/test/calendar-feed.test.mjs` (생성) | 통합 테스트 |
| `packages/client/src/query-keys.ts`, `hooks/calendar-feed.ts`, `index.ts` (수정·생성) | 훅 |
| `apps/web/src/components/CalendarFeedCard.tsx` (생성), `pages/ProfilePage.tsx` (수정) | 웹 화면 |
| `apps/native/src/screens/calendar-export.tsx`, `app/calendar-export.tsx` (생성), `app/_layout.tsx`, `screens/profile.tsx` (수정) | 앱 화면 |

**릴리스 2**

| 파일 | 책임 |
|---|---|
| `apps/native/app.json`, `package.json` (수정) | `expo-calendar` 플러그인·권한 |
| `apps/native/src/device-calendar-export/convert.ts` (생성) | `FeedItem` → 기기 일정 입력, 내용 서명 (순수) |
| `apps/native/src/device-calendar-export/preferences.ts`, `storage.ts`, `storage.native.ts`, `use-export-preferences.ts` (생성) | 켜짐·캘린더 ID·마지막 서명 (기기 로컬) |
| `apps/native/src/device-calendar-export/bridge.ts`, `bridge.android.ts` (생성) | `expo-calendar` 감싸개 (안드로이드 외 no-op) |
| `apps/native/src/device-calendar-export/calendar-export-sync.tsx`, `.android.tsx` (생성) | 화면 없는 동기화 컴포넌트 |
| `packages/client/src/hooks/invalidate.ts`, `personal-events.ts`, `unit-events.ts` (수정) | 항목 쿼리 무효화 |
| `apps/native/src/app/_layout.tsx`, `api/provider.tsx` (수정) | 동기화 마운트, 로그아웃 정리 |
| `apps/native/test/device-calendar-export.test.ts` (생성) | 순수 함수 테스트 |

---

## Task 0: 작업 브랜치

- [ ] **Step 1: 브랜치 만들기**

```bash
git switch -c feat/calendar-feed
```

---

## Task 1: ICS 렌더러 (`packages/shared/src/ics.ts`)

**Files:**
- Create: `packages/shared/src/ics.ts`
- Create: `packages/shared/test/ics.test.ts`

**Interfaces:**
- Consumes: `FeedItem` 타입 (Task 2에서 정의 — 이 Task에서 `calendar-feed.ts`에 타입만 먼저 만든다)
- Produces: `escapeIcsText(value: string): string`, `foldIcsLine(line: string): string`, `renderIcs(items: readonly FeedItem[], options: { calendarName: string; now: Date }): string`

- [ ] **Step 1: `FeedItem` 타입만 먼저 만든다**

`packages/shared/src/calendar-feed.ts`:

```ts
/**
 * 외부 캘린더로 내보내는 일정 한 건 — 구독 피드(.ics)와 안드로이드 기기 캘린더가
 * 같은 목록을 받는다.
 *
 * 사용처: apps/api의 `/calendar/:token.ics`와 `/calendar-feed/items`,
 * apps/native의 기기 캘린더 동기화.
 *
 * 두 출구가 규칙을 따로 가지면 같은 계정의 아이폰과 갤럭시가 다른 일정을 보여 준다.
 * 그래서 "무엇을 어떤 제목으로 내보내는가"는 여기 한 곳에서만 정한다.
 */
import type { ISODate } from "./dates";

/**
 * 시간 불변식: `startTime`이 null이면 종일 일정이다. `endTime`은 `startTime`이 있을
 * 때만 있고, `endTime`이 null인 시각 일정은 하루짜리다(`buildFeedItems`가 보장).
 */
export type FeedItem = {
  /** 안정 식별자. 외부 캘린더가 이 값으로 "같은 일정"을 알아본다. */
  uid: string;
  title: string;
  description: string | null;
  startDate: ISODate;
  endDate: ISODate;
  startTime: string | null;
  endTime: string | null;
};
```

- [ ] **Step 2: 실패하는 테스트 작성**

`packages/shared/test/ics.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import type { FeedItem } from "../src/calendar-feed";
import { escapeIcsText, foldIcsLine, renderIcs } from "../src/ics";

const NOW = new Date("2026-10-12T03:04:05.678Z");
const encoder = new TextEncoder();

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    uid: "leave-1",
    title: "[휴가] 여름 휴가",
    description: null,
    startDate: "2026-08-02",
    endDate: "2026-08-05",
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

/** RFC 5545 3.1 펼치기: CRLF 뒤 공백 하나를 지운다. */
function unfold(text: string): string {
  return text.replaceAll("\r\n ", "");
}

describe("escapeIcsText", () => {
  it("역슬래시·세미콜론·쉼표·줄바꿈을 이스케이프한다", () => {
    expect(escapeIcsText("a\\b;c,d\ne\r\nf")).toBe("a\\\\b\\;c\\,d\\ne\\nf");
  });
});

describe("foldIcsLine", () => {
  it("75바이트 이하 줄은 그대로 둔다", () => {
    const line = "SUMMARY:" + "a".repeat(67);
    expect(foldIcsLine(line)).toBe(line);
  });

  it("한글 긴 줄을 75바이트 이하로 접고, 펼치면 원문과 같다", () => {
    const line = "SUMMARY:" + "휴가".repeat(100);
    const folded = foldIcsLine(line);
    for (const physical of folded.split("\r\n")) {
      expect(encoder.encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(unfold(folded)).toBe(line);
    // 글자 중간에서 자르면 펼친 결과에 U+FFFD가 생긴다.
    expect(folded).not.toContain("�");
  });

  it("이어지는 줄은 공백 하나로 시작한다", () => {
    const folded = foldIcsLine("X:" + "가".repeat(40));
    const [, second] = folded.split("\r\n");
    expect(second?.startsWith(" ")).toBe(true);
  });
});

describe("renderIcs", () => {
  it("캘린더 머리와 시간대 블록을 싣고 CRLF로 끝난다", () => {
    const ics = renderIcs([], { calendarName: "리브", now: NOW });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("X-WR-CALNAME:리브\r\n");
    expect(ics).toContain("X-WR-TIMEZONE:Asia/Seoul\r\n");
    expect(ics).toContain("REFRESH-INTERVAL;VALUE=DURATION:PT1H\r\n");
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:Asia/Seoul\r\n");
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("종일 일정의 DTEND는 끝날 다음 날이다", () => {
    const ics = renderIcs([item()], { calendarName: "리브", now: NOW });
    expect(ics).toContain("DTSTART;VALUE=DATE:20260802\r\n");
    expect(ics).toContain("DTEND;VALUE=DATE:20260806\r\n");
  });

  it("달·해 경계를 넘는 종일 일정도 다음 날로 끝난다", () => {
    const ics = renderIcs([item({ startDate: "2026-12-31", endDate: "2026-12-31" })], {
      calendarName: "리브",
      now: NOW,
    });
    expect(ics).toContain("DTEND;VALUE=DATE:20270101\r\n");
  });

  it("시각 일정은 서울 시간대로 적는다", () => {
    const ics = renderIcs(
      [item({ startDate: "2026-10-01", endDate: "2026-10-02", startTime: "09:30", endTime: "18:00" })],
      { calendarName: "리브", now: NOW },
    );
    expect(ics).toContain("DTSTART;TZID=Asia/Seoul:20261001T093000\r\n");
    expect(ics).toContain("DTEND;TZID=Asia/Seoul:20261002T180000\r\n");
  });

  it("끝 시간이 없는 시각 일정은 DTEND를 두지 않는다", () => {
    const ics = renderIcs(
      [item({ startDate: "2026-10-01", endDate: "2026-10-01", startTime: "09:30" })],
      { calendarName: "리브", now: NOW },
    );
    expect(ics).toContain("DTSTART;TZID=Asia/Seoul:20261001T093000\r\n");
    expect(ics).not.toContain("DTEND");
  });

  it("UID·DTSTAMP·SUMMARY·DESCRIPTION을 싣는다", () => {
    const ics = renderIcs([item({ description: "사유: 가족, 행사\n복귀 21:00" })], {
      calendarName: "리브",
      now: NOW,
    });
    expect(ics).toContain("UID:leave-1@leave.moveto.kr\r\n");
    expect(ics).toContain("DTSTAMP:20261012T030405Z\r\n");
    expect(ics).toContain("SUMMARY:[휴가] 여름 휴가\r\n");
    expect(unfold(ics)).toContain("DESCRIPTION:사유: 가족\\, 행사\\n복귀 21:00\r\n");
  });

  it("설명이 없으면 DESCRIPTION을 두지 않는다", () => {
    const ics = renderIcs([item()], { calendarName: "리브", now: NOW });
    expect(ics).not.toContain("DESCRIPTION");
  });
});
```

- [ ] **Step 3: 실패 확인**

Run: `pnpm --filter @leave/shared exec vitest run test/ics.test.ts`
Expected: FAIL — `Failed to resolve import "../src/ics"`

- [ ] **Step 4: 구현**

`packages/shared/src/ics.ts`:

```ts
/**
 * 외부 캘린더 구독 피드(iCalendar, RFC 5545) 렌더러.
 *
 * 사용처: apps/api의 `GET /calendar/:token.ics`.
 *
 * 여기 규칙은 틀려도 오류가 나지 않는다. 캘린더 앱이 일정을 **말없이 버리거나 하루
 * 밀어 그린다.** 그래서 형식 규칙마다 테스트가 붙어 있다(test/ics.test.ts).
 */
import type { FeedItem } from "./calendar-feed";
import { addDays, type ISODate } from "./dates";

const CRLF = "\r\n";
/** 한 물리 줄의 상한. 글자 수가 아니라 UTF-8 바이트다 — 한글은 한 글자가 3바이트. */
const MAX_LINE_BYTES = 75;
const UID_DOMAIN = "leave.moveto.kr";
const TZID = "Asia/Seoul";
const encoder = new TextEncoder();

export function escapeIcsText(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll(";", "\\;")
    .replaceAll(",", "\\,")
    .replaceAll(/\r\n|\r|\n/g, "\\n");
}

/**
 * 75바이트마다 CRLF + 공백으로 접는다. 코드 포인트 단위로 세어 글자 중간에서
 * 자르지 않는다 — 잘린 한글은 펼친 뒤 깨진 문자로 남는다.
 * 이어지는 줄은 앞의 공백 1바이트를 포함해 75바이트다.
 */
export function foldIcsLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = MAX_LINE_BYTES;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
      limit = MAX_LINE_BYTES - 1;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function icsDate(date: ISODate): string {
  return date.replaceAll("-", "");
}

function icsLocalDateTime(date: ISODate, time: string): string {
  return `${icsDate(date)}T${time.replace(":", "")}00`;
}

function icsUtcStamp(now: Date): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replaceAll(/[-:]/g, "");
}

function eventLines(item: FeedItem, stamp: string): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${item.uid}@${UID_DOMAIN}`,
    `DTSTAMP:${stamp}`,
  ];
  if (item.startTime === null) {
    // 종일 일정의 DTEND는 배타적이다. 끝날을 그대로 적으면 모든 일정이 하루 짧아진다.
    lines.push(`DTSTART;VALUE=DATE:${icsDate(item.startDate)}`);
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(item.endDate, 1))}`);
  } else {
    lines.push(
      `DTSTART;TZID=${TZID}:${icsLocalDateTime(item.startDate, item.startTime)}`,
    );
    // 끝 시간이 없으면 DTEND를 두지 않는다 — RFC 5545상 시작 시각에 끝나는 일정이다.
    if (item.endTime !== null) {
      lines.push(
        `DTEND;TZID=${TZID}:${icsLocalDateTime(item.endDate, item.endTime)}`,
      );
    }
  }
  lines.push(`SUMMARY:${escapeIcsText(item.title)}`);
  if (item.description) {
    lines.push(`DESCRIPTION:${escapeIcsText(item.description)}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

export function renderIcs(
  items: readonly FeedItem[],
  options: { calendarName: string; now: Date },
): string {
  const stamp = icsUtcStamp(options.now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//moveto.kr//Leave//KO",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(options.calendarName)}`,
    `X-WR-TIMEZONE:${TZID}`,
    // 갱신 주기는 결국 각 앱이 정한다. 아이폰은 이 값을 참고하고 구글은 무시한다.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
    // 한국은 서머타임이 없어 STANDARD 하나로 끝난다.
    "BEGIN:VTIMEZONE",
    `TZID:${TZID}`,
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0900",
    "TZOFFSETTO:+0900",
    "TZNAME:KST",
    "END:STANDARD",
    "END:VTIMEZONE",
    ...items.flatMap((item) => eventLines(item, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @leave/shared exec vitest run test/ics.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 6: 커밋**

```bash
git add packages/shared/src/ics.ts packages/shared/src/calendar-feed.ts packages/shared/test/ics.test.ts
git commit -m "feat(shared): 외부 캘린더 구독 피드용 iCalendar 렌더러"
```

---

## Task 2: 피드 항목 조립과 구독 링크 (`packages/shared/src/calendar-feed.ts`)

**Files:**
- Modify: `packages/shared/src/calendar-feed.ts` (Task 1에서 만든 타입 아래에 추가)
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/test/calendar-feed.test.ts`

**Interfaces:**
- Consumes: `FeedItem` (Task 1), `isOutingSegments`, `segmentBalanceKey`, `balanceLabel`, `LEAVE_STATUS_LABELS` (`./leave`), `addMonthsClamped` (`./dates`)
- Produces:
  - `FEED_EXCLUDED_LEAVE_STATUSES: readonly LeaveStatus[]` = `["rejected", "cancelled"]`
  - `feedRangeStart(today: ISODate): ISODate`
  - `type FeedLeaveInput`, `type FeedPersonalEventInput`, `type FeedUnitEventInput` (아래 코드)
  - `buildFeedItems(input: { leaves: FeedLeaveInput[]; personalEvents: FeedPersonalEventInput[]; unitEvents: FeedUnitEventInput[]; unitName: string | null }): FeedItem[]`
  - `calendarFeedWebcalUrl(feedUrl: string): string`, `googleCalendarSubscribeUrl(feedUrl: string): string`

- [ ] **Step 1: 실패하는 테스트 작성**

`packages/shared/test/calendar-feed.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildFeedItems,
  calendarFeedWebcalUrl,
  feedRangeStart,
  googleCalendarSubscribeUrl,
  type FeedLeaveInput,
} from "../src/calendar-feed";

function leave(overrides: Partial<FeedLeaveInput> = {}): FeedLeaveInput {
  return {
    id: "l1",
    title: "여름 휴가",
    startDate: "2026-08-02",
    endDate: "2026-08-09",
    returnTime: "21:00",
    reason: null,
    status: "approved",
    segments: [
      { category: "annual", overnightKind: null, outingKind: null, startDate: "2026-08-02", endDate: "2026-08-05" },
      { category: "overnight", overnightKind: "regular", outingKind: null, startDate: "2026-08-06", endDate: "2026-08-09" },
    ],
    ...overrides,
  };
}

const empty = { leaves: [], personalEvents: [], unitEvents: [], unitName: null };

describe("buildFeedItems — 휴가", () => {
  it("휴가 한 건을 일정 하나로, 구간·상태·복귀·사유를 설명에 담는다", () => {
    const [item] = buildFeedItems({ ...empty, leaves: [leave({ reason: "가족 행사" })] });
    expect(item).toEqual({
      uid: "leave-l1",
      title: "[휴가] 여름 휴가",
      description: "8/2~8/5 연가 · 8/6~8/9 정기외박\n상태: 확정\n복귀 21:00\n사유: 가족 행사",
      startDate: "2026-08-02",
      endDate: "2026-08-09",
      startTime: null,
      endTime: null,
    });
  });

  it("구간이 전부 외출이면 [외출], 전부 외박이면 [외박]", () => {
    const outing = leave({
      segments: [{ category: "outing", overnightKind: null, outingKind: "weekend", startDate: "2026-08-02", endDate: "2026-08-02" }],
    });
    const overnight = leave({
      id: "l2",
      segments: [{ category: "overnight", overnightKind: "other", outingKind: null, startDate: "2026-08-02", endDate: "2026-08-03" }],
    });
    const items = buildFeedItems({ ...empty, leaves: [outing, overnight] });
    expect(items.map((i) => i.title)).toEqual(["[외출] 여름 휴가", "[외박] 여름 휴가"]);
    expect(items[0]!.description).toContain("8/2 주말 외출");
  });

  it("초안은 (초안)을 앞에 붙이고, 반려·취소는 내보내지 않는다", () => {
    const items = buildFeedItems({
      ...empty,
      leaves: [
        leave({ id: "d", status: "draft" }),
        leave({ id: "r", status: "rejected" }),
        leave({ id: "c", status: "cancelled" }),
      ],
    });
    expect(items.map((i) => i.uid)).toEqual(["leave-d"]);
    expect(items[0]!.title).toBe("(초안) [휴가] 여름 휴가");
  });
});

describe("buildFeedItems — 개인·부대 일정", () => {
  const base = { id: "e1", title: "면접", startDate: "2026-10-01", endDate: "2026-10-01", startTime: null, endTime: null };

  it("개인 일정은 메모를 설명으로, 부대 일정은 그룹 이름을 제목 앞에", () => {
    const items = buildFeedItems({
      ...empty,
      personalEvents: [{ ...base, note: "정장" }],
      unitEvents: [{ ...base, id: "u1", title: "체육대회", details: "운동복" }],
      unitName: "3중대",
    });
    expect(items).toEqual([
      { uid: "personal-e1", title: "면접", description: "정장", startDate: "2026-10-01", endDate: "2026-10-01", startTime: null, endTime: null },
      { uid: "unit-event-u1", title: "[3중대] 체육대회", description: "운동복", startDate: "2026-10-01", endDate: "2026-10-01", startTime: null, endTime: null },
    ]);
  });

  it("시작·끝 시간이 있으면 시각 일정", () => {
    const [item] = buildFeedItems({
      ...empty,
      personalEvents: [{ ...base, endDate: "2026-10-02", startTime: "09:00", endTime: "18:00", note: null }],
    });
    expect([item!.startTime, item!.endTime]).toEqual(["09:00", "18:00"]);
  });

  it("하루짜리에 시작 시간만 있으면 시각 일정, 끝은 없음", () => {
    const [item] = buildFeedItems({ ...empty, personalEvents: [{ ...base, startTime: "09:00", note: null }] });
    expect([item!.startTime, item!.endTime, item!.description]).toEqual(["09:00", null, null]);
  });

  it("여러 날에 시작 시간만 있거나 끝 시간만 있으면 종일 + 설명 첫 줄에 시간", () => {
    const items = buildFeedItems({
      ...empty,
      personalEvents: [
        { ...base, id: "a", endDate: "2026-10-03", startTime: "09:00", note: "메모" },
        { ...base, id: "b", endTime: "18:00", note: null },
      ],
    });
    expect(items.map((i) => [i.startTime, i.endTime, i.description])).toEqual([
      [null, null, "09:00~\n메모"],
      [null, null, "~18:00"],
    ]);
  });
});

describe("buildFeedItems — 순서", () => {
  it("시작일, 그다음 uid 순으로 정렬해 매번 같은 출력을 낸다", () => {
    const items = buildFeedItems({
      ...empty,
      leaves: [leave({ id: "b", startDate: "2026-09-01", endDate: "2026-09-01", segments: [] }), leave({ id: "a", startDate: "2026-09-01", endDate: "2026-09-01", segments: [] })],
      personalEvents: [{ id: "p", title: "x", startDate: "2026-08-01", endDate: "2026-08-01", startTime: null, endTime: null, note: null }],
    });
    expect(items.map((i) => i.uid)).toEqual(["personal-p", "leave-a", "leave-b"]);
  });
});

describe("feedRangeStart", () => {
  it("6개월 전, 짧은 달은 말일로 접는다", () => {
    expect(feedRangeStart("2026-10-12")).toBe("2026-04-12");
    expect(feedRangeStart("2026-08-31")).toBe("2026-02-28");
  });
});

describe("구독 링크", () => {
  const url = "https://api.leave.moveto.kr/calendar/abc_DEF-123.ics";

  it("webcal 주소는 스킴만 바꾼다", () => {
    expect(calendarFeedWebcalUrl(url)).toBe("webcal://api.leave.moveto.kr/calendar/abc_DEF-123.ics");
  });

  it("구글 추가 주소는 webcal 주소를 cid로 인코딩해 싣는다", () => {
    expect(googleCalendarSubscribeUrl(url)).toBe(
      "https://calendar.google.com/calendar/r?cid=" +
        encodeURIComponent("webcal://api.leave.moveto.kr/calendar/abc_DEF-123.ics"),
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @leave/shared exec vitest run test/calendar-feed.test.ts`
Expected: FAIL — `buildFeedItems is not a function` (또는 export 없음)

- [ ] **Step 3: 구현** — `packages/shared/src/calendar-feed.ts`의 import 줄을 바꾸고 `FeedItem` 타입 아래에 붙인다.

import 교체:

```ts
import { addMonthsClamped, type ISODate } from "./dates";
import {
  balanceLabel,
  isOutingSegments,
  LEAVE_STATUS_LABELS,
  segmentBalanceKey,
  type LeaveCategory,
  type LeaveStatus,
  type OutingKind,
  type OvernightKind,
} from "./leave";
```

타입 아래에 추가:

```ts
/** 실제로 나가지 않은 휴가. 초안은 내보낸다 — 제목으로 구분한다. */
export const FEED_EXCLUDED_LEAVE_STATUSES: readonly LeaveStatus[] = [
  "rejected",
  "cancelled",
];

/**
 * 피드가 담는 가장 이른 날. 이날 이후에 **끝나는** 일정만 싣는다.
 * 지난 일정을 끝없이 실으면 피드가 커지고, 구글은 큰 피드를 더 늦게 받아 간다.
 */
export function feedRangeStart(today: ISODate): ISODate {
  return addMonthsClamped(today, -6);
}

export type FeedLeaveInput = {
  id: string;
  title: string;
  startDate: ISODate;
  endDate: ISODate;
  returnTime: string;
  reason: string | null;
  status: LeaveStatus;
  segments: {
    category: LeaveCategory;
    overnightKind: OvernightKind | null;
    outingKind: OutingKind | null;
    startDate: ISODate;
    endDate: ISODate;
  }[];
};

type FeedEventBase = {
  id: string;
  title: string;
  startDate: ISODate;
  endDate: ISODate;
  startTime: string | null;
  endTime: string | null;
};

export type FeedPersonalEventInput = FeedEventBase & { note: string | null };
export type FeedUnitEventInput = FeedEventBase & { details: string | null };

function monthDay(date: ISODate): string {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function leaveKindPrefix(segments: FeedLeaveInput["segments"]): string {
  if (isOutingSegments(segments)) return "[외출]";
  if (
    segments.length > 0 &&
    segments.every((segment) => segment.category === "overnight")
  ) {
    return "[외박]";
  }
  return "[휴가]";
}

function joinLines(lines: readonly (string | null)[]): string | null {
  const kept = lines.filter((line): line is string => Boolean(line));
  return kept.length > 0 ? kept.join("\n") : null;
}

/**
 * 휴가 한 건 = 일정 하나. 구간마다 쪼개지 않는다 — "연가 4일 + 정기외박 4일"은 한 번의
 * 출타인데, 바깥 캘린더에서 두 칸이 맞붙으면 두 번 나가는 것처럼 읽힌다.
 */
function leaveItem(leave: FeedLeaveInput): FeedItem {
  const prefix = leaveKindPrefix(leave.segments);
  const draft = leave.status === "draft" ? "(초안) " : "";
  const segmentLine = leave.segments
    .map((segment) => {
      const range =
        segment.startDate === segment.endDate
          ? monthDay(segment.startDate)
          : `${monthDay(segment.startDate)}~${monthDay(segment.endDate)}`;
      const key = segmentBalanceKey({
        category: segment.category,
        overnightKind: segment.overnightKind ?? undefined,
        outingKind: segment.outingKind ?? undefined,
      });
      return `${range} ${balanceLabel(key)}`;
    })
    .join(" · ");
  return {
    uid: `leave-${leave.id}`,
    title: `${draft}${prefix} ${leave.title}`,
    description: joinLines([
      segmentLine || null,
      `상태: ${LEAVE_STATUS_LABELS[leave.status]}`,
      `복귀 ${leave.returnTime}`,
      leave.reason ? `사유: ${leave.reason}` : null,
    ]),
    startDate: leave.startDate,
    endDate: leave.endDate,
    startTime: null,
    endTime: null,
  };
}

/**
 * 시간 규칙. 시작 시간이 있고 (끝 시간이 있거나 하루짜리)일 때만 시각 일정이다.
 * 여러 날짜에 시작 시간만 있는 일정을 시각 일정으로 만들면 시작 순간 하나로
 * 줄어들어 여러 날이라는 사실이 사라진다. 그런 일정은 종일로 두고 시간을 설명에 적는다.
 */
function eventItem(
  uid: string,
  title: string,
  event: FeedEventBase,
  body: string | null,
): FeedItem {
  const timed =
    event.startTime !== null &&
    (event.endTime !== null || event.startDate === event.endDate);
  const hint =
    !timed && (event.startTime !== null || event.endTime !== null)
      ? `${event.startTime ?? ""}~${event.endTime ?? ""}`
      : null;
  return {
    uid,
    title,
    description: joinLines([hint, body]),
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: timed ? event.startTime : null,
    endTime: timed ? event.endTime : null,
  };
}

export function buildFeedItems(input: {
  leaves: readonly FeedLeaveInput[];
  personalEvents: readonly FeedPersonalEventInput[];
  unitEvents: readonly FeedUnitEventInput[];
  unitName: string | null;
}): FeedItem[] {
  const unitPrefix = input.unitName ? `[${input.unitName}] ` : "";
  const items = [
    ...input.leaves
      .filter((leave) => !FEED_EXCLUDED_LEAVE_STATUSES.includes(leave.status))
      .map(leaveItem),
    ...input.personalEvents.map((event) =>
      eventItem(`personal-${event.id}`, event.title, event, event.note),
    ),
    ...input.unitEvents.map((event) =>
      eventItem(
        `unit-event-${event.id}`,
        `${unitPrefix}${event.title}`,
        event,
        event.details,
      ),
    ),
  ];
  // 순서를 고정해야 같은 데이터가 같은 피드·같은 서명을 낸다(안드로이드 동기화가 서명을 비교한다).
  return items.sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) || a.uid.localeCompare(b.uid),
  );
}

/** 아이폰은 `webcal://` 링크를 열면 구독 확인 창을 띄운다. */
export function calendarFeedWebcalUrl(feedUrl: string): string {
  return feedUrl.replace(/^https?:\/\//, "webcal://");
}

/** 구글 캘린더의 "URL로 추가" 화면. 삼성 캘린더는 이 구글 계정을 거쳐 받는다. */
export function googleCalendarSubscribeUrl(feedUrl: string): string {
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(
    calendarFeedWebcalUrl(feedUrl),
  )}`;
}
```

`packages/shared/src/index.ts` — 다른 `export *` 줄들 옆에 추가 (알파벳 순서를 따르고 있으면 그 자리에):

```ts
export * from "./calendar-feed";
export * from "./ics";
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @leave/shared exec vitest run test/calendar-feed.test.ts test/ics.test.ts && pnpm --filter @leave/shared check-types`
Expected: PASS, 타입 오류 없음

- [ ] **Step 5: 커밋**

```bash
git add packages/shared
git commit -m "feat(shared): 외부 캘린더 피드 항목 조립과 구독 링크"
```

---

## Task 3: `calendar_feeds` 표

**Files:**
- Modify: `apps/api/src/db/schema.ts` (`personalEvents` 정의 뒤, 타입 export 목록)
- Create: `apps/api/migrations/0039_calendar_feeds.sql`
- Modify: `apps/api/src/lib/delete-account.ts`

**Interfaces:**
- Produces: `calendarFeeds` 표 (`userId` PK, `token` unique, `createdAt`), `type CalendarFeedRow`

- [ ] **Step 1: 스키마 추가** — `apps/api/src/db/schema.ts`의 `personalEvents` 정의 바로 뒤:

```ts
/**
 * 외부 캘린더 구독 링크. 사용자당 하나이고, 재발급은 토큰을 덮어써 예전 링크를 죽인다.
 *
 * 토큰을 세션처럼 해시하지 않는 이유: 이 토큰은 DB에 이미 있는 일정을 **읽게만** 한다.
 * DB를 읽을 수 있는 사람은 토큰 없이도 일정을 본다. 원문이 있어야 사용자가 나중에
 * 링크를 다시 복사할 수 있다(아이폰에 붙인 다음 날 구글에 붙이기).
 */
export const calendarFeeds = sqliteTable("calendar_feeds", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  createdAt: text("created_at").notNull(),
});
```

타입 목록 끝(`PersonalEventRow` 근처)에:

```ts
export type CalendarFeedRow = typeof calendarFeeds.$inferSelect;
```

- [ ] **Step 2: 마이그레이션 생성**

Run: `pnpm --filter @leave/api db:generate`
Expected: `apps/api/migrations/` 아래 새 SQL 파일. 이름이 `0039_calendar_feeds.sql`이 아니면 파일명과 `migrations/meta/_journal.json`의 `tag`를 `0039_calendar_feeds`로 바꾼다. 내용은 아래와 같아야 한다(드리즐이 만든 그대로 둔다):

```sql
CREATE TABLE `calendar_feeds` (
	`user_id` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `calendar_feeds_token_unique` ON `calendar_feeds` (`token`);
```

다른 표의 변경이 함께 생성되면 멈추고 원인을 확인한다(스키마와 마이그레이션이 이미 어긋나 있었다는 뜻이다).

- [ ] **Step 3: 탈퇴 목록에 적기** — `apps/api/src/lib/delete-account.ts`

머리주석의 cascade 목록 `milestone_deliveries)`를 `milestone_deliveries, calendar_feeds)`로 바꾼다. import 목록에 `calendarFeeds`를 넣고, 외래키 있는 표를 명시적으로 지우는 자리(같은 파일에서 `personalEvents`나 `userNotificationPrefs`를 지우는 줄)를 찾아 같은 모양으로 한 줄 추가한다:

```ts
db.delete(calendarFeeds).where(eq(calendarFeeds.userId, userId)),
```

(그 자리가 batch 배열이면 배열 원소로, 개별 `await`면 `await`를 붙여 같은 모양으로.)

- [ ] **Step 4: 확인**

Run: `pnpm --filter @leave/api check-types && pnpm --filter @leave/api db:migrate:local`
Expected: 타입 오류 없음, `0039_calendar_feeds` 적용 성공

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/db/schema.ts apps/api/migrations apps/api/src/lib/delete-account.ts
git commit -m "feat(api): 외부 캘린더 구독 링크 표"
```

---

## Task 4: 링크 관리·항목 API (`/calendar-feed`)

**Files:**
- Modify: `docs/superpowers/specs/2026-10-12-calendar-feed-design.md` (스펙 변경 반영)
- Create: `apps/api/src/lib/calendar-feed.ts`
- Create: `apps/api/src/routes/calendar-feed.contract.ts`
- Create: `apps/api/src/routes/calendar-feed.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/test/calendar-feed.test.mjs`

**Interfaces:**
- Consumes: `buildFeedItems`, `feedRangeStart`, `FeedItem` (Task 2), `calendarFeeds` (Task 3), `generateSessionToken` (`lib/crypto.ts`)
- Produces:
  - `loadFeedItems(db: Db, userId: string, today: ISODate): Promise<FeedItem[]>` (`apps/api/src/lib/calendar-feed.ts`)
  - `feedUrlFor(origin: string, token: string): string` — `${origin}/calendar/${token}.ics`
  - HTTP: `GET /calendar-feed` → `{ url: string | null }`, `POST /calendar-feed` → `{ url: string }`, `DELETE /calendar-feed` → `{ ok: true }`, `GET /calendar-feed/items` → `{ items: FeedItem[] }`

- [ ] **Step 1: 스펙 고치기** — 스펙의 `### 2. 구독 URL` API 표 경로를 `/calendar-feed`(`GET`·`POST`·`DELETE /`)로, `### 4`의 데이터 엔드포인트를 `GET /calendar-feed/items`로 바꾼다. `**피드**` 목록의 rate limit 줄을 다음으로 바꾼다:

```md
- rate limit은 **피드 주인 단위**다. 토큰으로 주인을 찾아 `c.set("user", …)`한 뒤
  `rateLimit({ name: "calendar-feed", limit: 60, windowSeconds: 600 })`를 건다. 기본
  키인 IP를 쓰면 안 된다 — 구글은 모든 사용자의 피드를 같은 IP 대역에서 받아 가서,
  한 사람의 피드가 모두의 갱신을 막는다. 토큰 대입은 256비트 무작위라 막을 필요가 없다.
- 접속 기록(`access_logs.path`)에는 `/calendar/:token`으로 가려 저장한다. 관리 화면이
  그 표를 읽는다.
```

`### 1`의 "자리" 문단을 "순수 조립은 `packages/shared/src/calendar-feed.ts`, 렌더러는 `packages/shared/src/ics.ts`, 조회는 `apps/api/src/lib/calendar-feed.ts`"로, `### 1`의 **시간 규칙**을 Task 2의 규칙(시작 시간이 있고 (끝 시간이 있거나 하루짜리)일 때만 시각 일정, 나머지는 종일 + 설명 첫 줄 `HH:mm~HH:mm`)으로 바꾼다.

- [ ] **Step 2: 실패하는 통합 테스트 작성** — `apps/api/test/calendar-feed.test.mjs`

```js
// 외부 캘린더 구독 링크와 피드.
//
// 피드 URL은 비밀번호와 같다. 여기서 지키는 것은 기능보다 **누가 무엇을 보는가**다 —
// 재발급한 옛 링크는 즉시 죽고, 같은 그룹 동료의 일정은 섞이지 않는다.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createUnit,
  isoDaysFromToday,
  openTestDb,
  req,
  signup,
  sleep,
} from "./helpers.mjs";

async function fetchFeed(url) {
  const res = await fetch(url);
  return { status: res.status, headers: res.headers, text: await res.text() };
}

async function enableFeed(token) {
  const res = await req("POST", "/calendar-feed", { token });
  assert.equal(res.status, 200, JSON.stringify(res.data));
  return res.data.url;
}

function leaveBody(title, startDate, endDate, extra = {}) {
  return {
    title,
    segments: [{ category: "annual", startDate, endDate }],
    ...extra,
  };
}

test("링크는 꺼진 채 시작하고, 켜기·재발급·끄기가 링크 수명을 정한다", async () => {
  const { token } = await signup();
  const initial = await req("GET", "/calendar-feed", { token });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.url, null);

  const first = await enableFeed(token);
  assert.match(first, /\/calendar\/[A-Za-z0-9_-]{43}\.ics$/);
  assert.equal((await req("GET", "/calendar-feed", { token })).data.url, first);
  assert.equal((await fetchFeed(first)).status, 200);

  const second = await enableFeed(token);
  assert.notEqual(second, first);
  assert.equal((await fetchFeed(first)).status, 404, "재발급한 옛 링크는 즉시 죽는다");
  assert.equal((await fetchFeed(second)).status, 200);

  const off = await req("DELETE", "/calendar-feed", { token });
  assert.equal(off.status, 200);
  assert.equal((await fetchFeed(second)).status, 404);
  assert.equal((await req("GET", "/calendar-feed", { token })).data.url, null);
});

test("링크 관리는 로그인이 필요하다", async () => {
  assert.equal((await req("GET", "/calendar-feed")).status, 401);
  assert.equal((await req("POST", "/calendar-feed")).status, 401);
  assert.equal((await req("GET", "/calendar-feed/items")).status, 401);
});

test("항목은 초안을 표시하고 반려·취소와 6개월보다 오래된 일정을 뺀다", async () => {
  const { token } = await signup();
  const soon = isoDaysFromToday(10);
  const old = isoDaysFromToday(-200);

  const draft = await req("POST", "/leaves", {
    token,
    body: leaveBody("초안 계획", soon, soon, { status: "draft" }),
  });
  assert.equal(draft.status, 201, JSON.stringify(draft.data));
  const cancelled = await req("POST", "/leaves", {
    token,
    body: leaveBody("취소될 계획", soon, soon),
  });
  const ancient = await req("POST", "/leaves", {
    token,
    body: leaveBody("오래된 휴가", old, old),
  });
  assert.equal(ancient.status, 201, JSON.stringify(ancient.data));
  // 사용자가 직접 고를 수 없는 종료 상태라 DB에서 바꾼다.
  const db = openTestDb();
  try {
    db.prepare("UPDATE leaves SET status = 'cancelled' WHERE id = ?").run(
      cancelled.data.leave.id,
    );
  } finally {
    db.close();
  }

  const items = await req("GET", "/calendar-feed/items", { token });
  assert.equal(items.status, 200);
  assert.deepEqual(
    items.data.items.map((item) => item.title),
    ["(초안) [휴가] 초안 계획"],
  );
});
```

- [ ] **Step 3: 실패 확인**

Run: `TEST_FILES=calendar-feed.test.mjs pnpm --filter @leave/api test`
Expected: FAIL — `/calendar-feed`가 404 (`initial.status` 200 기대)

- [ ] **Step 4: 조회 함수** — `apps/api/src/lib/calendar-feed.ts`

```ts
/**
 * 사용자 한 명의 외부 캘린더 피드 항목 조회.
 *
 * 사용처: `GET /calendar/:token.ics`(routes/calendar-public.ts),
 * `GET /calendar-feed/items`(routes/calendar-feed.ts).
 *
 * 조립 규칙은 @leave/shared의 `buildFeedItems`에 있다. 여기는 "무엇을 읽는가"만 맡는다.
 * ⚠ 응답이 사용자마다 다르다. 캐싱한다면 키에 사용자 id가 반드시 들어가야 한다.
 */
import {
  buildFeedItems,
  FEED_EXCLUDED_LEAVE_STATUSES,
  feedRangeStart,
  type FeedItem,
  type ISODate,
} from "@leave/shared";
import { and, asc, eq, gte, notInArray } from "drizzle-orm";
import {
  leaveSegments,
  leaves,
  personalEvents,
  unitEvents,
  units,
  users,
} from "../db/schema";
import type { Db } from "./db";

export function feedUrlFor(origin: string, token: string): string {
  return `${origin}/calendar/${token}.ics`;
}

export async function loadFeedItems(
  db: Db,
  userId: string,
  today: ISODate,
): Promise<FeedItem[]> {
  const rangeStart = feedRangeStart(today);
  const visibleLeave = and(
    eq(leaves.userId, userId),
    gte(leaves.endDate, rangeStart),
    notInArray(leaves.status, [...FEED_EXCLUDED_LEAVE_STATUSES]),
  );

  // 네 조회는 서로를 기다리지 않는다. 부대 일정은 사용자 행을 거쳐 "지금 소속 그룹"으로
  // 좁힌다 — 그룹이 없으면 조인이 비어 따로 분기할 필요가 없다.
  const [leaveRows, segmentRows, personalRows, unitRows] = await db.batch([
    db
      .select({
        id: leaves.id,
        title: leaves.title,
        startDate: leaves.startDate,
        endDate: leaves.endDate,
        returnTime: leaves.returnTime,
        reason: leaves.reason,
        status: leaves.status,
      })
      .from(leaves)
      .where(visibleLeave)
      .orderBy(asc(leaves.startDate)),
    db
      .select({
        leaveId: leaveSegments.leaveId,
        category: leaveSegments.category,
        overnightKind: leaveSegments.overnightKind,
        outingKind: leaveSegments.outingKind,
        startDate: leaveSegments.startDate,
        endDate: leaveSegments.endDate,
      })
      .from(leaveSegments)
      .innerJoin(leaves, eq(leaveSegments.leaveId, leaves.id))
      .where(visibleLeave)
      .orderBy(asc(leaveSegments.startDate)),
    db
      .select({
        id: personalEvents.id,
        title: personalEvents.title,
        startDate: personalEvents.startDate,
        endDate: personalEvents.endDate,
        startTime: personalEvents.startTime,
        endTime: personalEvents.endTime,
        note: personalEvents.note,
      })
      .from(personalEvents)
      .where(
        and(
          eq(personalEvents.ownerUserId, userId),
          gte(personalEvents.endDate, rangeStart),
        ),
      ),
    db
      .select({
        id: unitEvents.id,
        title: unitEvents.title,
        startDate: unitEvents.startDate,
        endDate: unitEvents.endDate,
        startTime: unitEvents.startTime,
        endTime: unitEvents.endTime,
        details: unitEvents.details,
        unitName: units.name,
      })
      .from(unitEvents)
      .innerJoin(users, eq(users.unitId, unitEvents.unitId))
      .innerJoin(units, eq(units.id, unitEvents.unitId))
      .where(and(eq(users.id, userId), gte(unitEvents.endDate, rangeStart))),
  ]);

  const segmentsByLeave = new Map<string, typeof segmentRows>();
  for (const segment of segmentRows) {
    const list = segmentsByLeave.get(segment.leaveId) ?? [];
    list.push(segment);
    segmentsByLeave.set(segment.leaveId, list);
  }

  return buildFeedItems({
    leaves: leaveRows.map((leave) => ({
      ...leave,
      segments: segmentsByLeave.get(leave.id) ?? [],
    })),
    personalEvents: personalRows,
    unitEvents: unitRows,
    unitName: unitRows[0]?.unitName ?? null,
  });
}
```

- [ ] **Step 5: 명세** — `apps/api/src/routes/calendar-feed.contract.ts`

```ts
/**
 * 외부 캘린더 구독 링크 라우트의 OpenAPI 명세.
 *
 * 사용처: apps/api/src/routes/calendar-feed.ts. 무인증 피드 자체는
 * routes/calendar-public.ts에 있다 — 캘린더 앱이 받아 가는 iCalendar라 이 명세의
 * JSON 계약에 들지 않는다.
 */
import { createRoute, z } from "@hono/zod-openapi";
import { errorResponse, jsonContent, okSchema } from "../lib/responses";
import { rateLimit } from "../middleware/rate-limit";

const TAGS = ["외부 캘린더"];

const feedItemSchema = z
  .object({
    uid: z.string(),
    title: z.string(),
    description: z.string().nullable(),
    startDate: z.string(),
    endDate: z.string(),
    startTime: z.string().nullable(),
    endTime: z.string().nullable(),
  })
  .openapi("CalendarFeedItem");

export const getCalendarFeedRoute = createRoute({
  method: "get",
  path: "/",
  tags: TAGS,
  summary: "내 구독 링크",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(
      z.object({ url: z.string().nullable() }),
      "구독 링크. 꺼져 있으면 null",
    ),
    401: errorResponse("인증 실패"),
  },
});

export const createCalendarFeedRoute = createRoute({
  method: "post",
  path: "/",
  tags: TAGS,
  summary: "구독 링크 만들기·재발급",
  description:
    "이미 있으면 토큰을 새로 만들어 덮어씁니다. 예전 링크는 즉시 더 이상 열리지 않습니다.",
  security: [{ Bearer: [] }],
  middleware: [
    rateLimit({ name: "calendar-feed-rotate", limit: 10, windowSeconds: 600 }),
  ] as const,
  responses: {
    200: jsonContent(z.object({ url: z.string() }), "새 구독 링크"),
    401: errorResponse("인증 실패"),
    429: errorResponse("요청이 너무 잦음"),
  },
});

export const deleteCalendarFeedRoute = createRoute({
  method: "delete",
  path: "/",
  tags: TAGS,
  summary: "구독 링크 끄기",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(okSchema, "꺼짐"),
    401: errorResponse("인증 실패"),
  },
});

export const listCalendarFeedItemsRoute = createRoute({
  method: "get",
  path: "/items",
  tags: TAGS,
  summary: "외부 캘린더로 내보낼 내 일정",
  description:
    "구독 피드와 같은 항목입니다. 안드로이드 앱이 기기 캘린더에 쓸 때 사용합니다.",
  security: [{ Bearer: [] }],
  responses: {
    200: jsonContent(z.object({ items: z.array(feedItemSchema) }), "일정"),
    401: errorResponse("인증 실패"),
  },
});
```

- [ ] **Step 6: 라우트** — `apps/api/src/routes/calendar-feed.ts`

```ts
/**
 * 외부 캘린더 구독 링크 관리와 내보낼 일정 조회.
 *
 * 마운트 위치: `/calendar-feed` (apps/api/src/index.ts). 명세는 ./calendar-feed.contract.ts.
 */
import { todayInSeoul } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { calendarFeeds } from "../db/schema";
import { createApp } from "../lib/app";
import { feedUrlFor, loadFeedItems } from "../lib/calendar-feed";
import { generateSessionToken } from "../lib/crypto";
import { authMiddleware } from "../middleware/auth";
import { onboardingMiddleware } from "../middleware/onboarding";
import {
  createCalendarFeedRoute,
  deleteCalendarFeedRoute,
  getCalendarFeedRoute,
  listCalendarFeedItemsRoute,
} from "./calendar-feed.contract";

const app = createApp();
app.use("*", authMiddleware);
app.use("*", onboardingMiddleware);

/**
 * 링크 주소. 인증 메일 링크와 같은 이유로 요청 주소가 아니라 `API_ORIGIN`을 쓴다 —
 * wrangler dev는 요청 주소를 커스텀 도메인으로 바꿔 보낸다.
 */
function originOf(env: { API_ORIGIN?: string }, requestUrl: string): string {
  return env.API_ORIGIN ?? new URL(requestUrl).origin;
}

export const calendarFeedRoutes = app
  .openapi(getCalendarFeedRoute, async (c) => {
    const [row] = await drizzle(c.env.DB)
      .select({ token: calendarFeeds.token })
      .from(calendarFeeds)
      .where(eq(calendarFeeds.userId, c.get("user").id))
      .limit(1);
    return c.json(
      {
        url: row
          ? feedUrlFor(originOf(c.env, c.req.url), row.token)
          : null,
      },
      200,
    );
  })
  .openapi(createCalendarFeedRoute, async (c) => {
    const token = generateSessionToken();
    const createdAt = new Date().toISOString();
    await drizzle(c.env.DB)
      .insert(calendarFeeds)
      .values({ userId: c.get("user").id, token, createdAt })
      .onConflictDoUpdate({
        target: calendarFeeds.userId,
        set: { token, createdAt },
      });
    return c.json({ url: feedUrlFor(originOf(c.env, c.req.url), token) }, 200);
  })
  .openapi(deleteCalendarFeedRoute, async (c) => {
    await drizzle(c.env.DB)
      .delete(calendarFeeds)
      .where(eq(calendarFeeds.userId, c.get("user").id));
    return c.json({ ok: true as const }, 200);
  })
  .openapi(listCalendarFeedItemsRoute, async (c) => {
    const items = await loadFeedItems(
      drizzle(c.env.DB),
      c.get("user").id,
      todayInSeoul(),
    );
    return c.json({ items }, 200);
  });
```

- [ ] **Step 7: 마운트** — `apps/api/src/index.ts`

import에 `import { calendarFeedRoutes } from "./routes/calendar-feed";`를 넣고, 라우트 체인의 `.route("/personal-events", personalEventRoutes)` 다음 줄에:

```ts
  .route("/calendar-feed", calendarFeedRoutes)
```

- [ ] **Step 8: 테스트에서 피드 200을 확인하는 첫 테스트는 아직 실패한다(피드 라우트는 Task 5). 그 단언만 빼고 통과하는지 본다**

Run: `TEST_FILES=calendar-feed.test.mjs pnpm --filter @leave/api test`
Expected: "링크 관리는 로그인이 필요하다"와 "항목은 초안을…" PASS. 첫 테스트는 `fetchFeed(first)` 200 단언에서 FAIL(404) — Task 5에서 통과한다.

- [ ] **Step 9: 타입·린트**

Run: `pnpm --filter @leave/api check-types && pnpm --filter @leave/api lint`
Expected: 오류 없음

- [ ] **Step 10: 커밋**

```bash
git add apps/api/src docs/superpowers/specs/2026-10-12-calendar-feed-design.md apps/api/test/calendar-feed.test.mjs
git commit -m "feat(api): 외부 캘린더 구독 링크 관리와 내보낼 일정 조회"
```

---

## Task 5: 무인증 피드 `GET /calendar/:token.ics` + 접속 기록 가리기

**Files:**
- Create: `apps/api/src/routes/calendar-public.ts`
- Modify: `apps/api/src/middleware/access-log.ts`
- Modify: `apps/api/src/index.ts`
- Modify: `apps/api/test/calendar-feed.test.mjs`

**Interfaces:**
- Consumes: `loadFeedItems` (Task 4), `renderIcs` (Task 1), `rateLimit`
- Produces: `GET /calendar/{token}.ics` → `200 text/calendar` | `404`; `maskSecretPath(path: string): string` (access-log.ts, export)

- [ ] **Step 1: 실패하는 테스트 추가** — `apps/api/test/calendar-feed.test.mjs` 끝에

```js
test("피드는 iCalendar로, 내 휴가·개인 일정과 소속 그룹 일정만 담는다", async () => {
  const owner = await signup();
  const created = await createUnit(owner.token, { name: "피드중대" });
  const unitId = created.data.unit.id;
  const peer = await signup();
  await req("POST", "/units/join", {
    token: peer.token,
    body: { code: created.data.invite.code },
  });
  const day = isoDaysFromToday(20);

  await req("POST", "/leaves", { token: owner.token, body: leaveBody("내 휴가", day, day) });
  await req("POST", "/leaves", { token: peer.token, body: leaveBody("동료 휴가", day, day) });
  await req("POST", "/personal-events", {
    token: peer.token,
    body: { title: "동료 개인", startDate: day, endDate: day },
  });
  await req("POST", "/personal-events", {
    token: owner.token,
    body: { title: "내 개인", startDate: day, endDate: day, startTime: "09:30", endTime: "11:00", note: "메모, 쉼표" },
  });
  const event = await req("POST", `/units/${unitId}/events`, {
    token: owner.token,
    body: { title: "체육대회", isHoliday: false, startDate: day, endDate: day },
  });
  assert.equal(event.status, 201, JSON.stringify(event.data));

  const url = await enableFeed(owner.token);
  const feed = await fetchFeed(url);
  assert.equal(feed.status, 200);
  assert.match(feed.headers.get("content-type"), /^text\/calendar/);
  assert.match(feed.headers.get("cache-control"), /private/);
  const text = feed.text.replaceAll("\r\n ", "");
  assert.ok(text.includes("SUMMARY:[휴가] 내 휴가\r\n"));
  assert.ok(text.includes("SUMMARY:내 개인\r\n"));
  assert.ok(text.includes("DESCRIPTION:메모\\, 쉼표\r\n"));
  assert.ok(text.includes("SUMMARY:[피드중대] 체육대회\r\n"));
  assert.ok(!text.includes("동료"), "같은 그룹 동료의 일정은 섞이지 않는다");

  // 그룹을 나가면 부대 일정이 빠진다(관리자는 이관 후에만 나갈 수 있다).
  await req("POST", `/units/${unitId}/transfer`, {
    token: owner.token,
    body: { userId: peer.data.user.id },
  });
  assert.equal((await req("POST", "/units/leave", { token: owner.token })).status, 200);
  assert.ok(!(await fetchFeed(url)).text.includes("체육대회"));
});

test("모르는 토큰과 .ics가 아닌 경로는 404", async () => {
  const base = process.env.API_URL ?? "http://localhost:8799";
  assert.equal((await fetchFeed(`${base}/calendar/${"x".repeat(43)}.ics`)).status, 404);
  assert.equal((await fetchFeed(`${base}/calendar/abc`)).status, 404);
});

test("피드 rate limit은 IP가 아니라 피드 주인 단위다", async () => {
  // 구글은 모든 사용자의 피드를 같은 IP 대역에서 받아 간다. 테스트도 한 IP에서 돈다.
  const a = await enableFeed((await signup()).token);
  const b = await enableFeed((await signup()).token);
  const headers = { "CF-Connecting-IP": "203.0.113.7" };
  let lastA = 0;
  for (let i = 0; i < 61; i += 1) {
    lastA = (await fetch(a, { headers })).status;
  }
  assert.equal(lastA, 429, "한 피드를 10분에 61번 받으면 막힌다");
  assert.equal((await fetch(b, { headers })).status, 200, "다른 사용자의 피드는 막히지 않는다");
});

test("접속 기록에는 피드 토큰이 남지 않는다", async () => {
  const url = await enableFeed((await signup()).token);
  await fetchFeed(url);
  await sleep(800);
  const db = openTestDb();
  try {
    const rows = db
      .prepare("SELECT path FROM access_logs WHERE path LIKE '/calendar/%'")
      .all();
    assert.ok(rows.length > 0);
    for (const row of rows) assert.equal(row.path, "/calendar/:token");
  } finally {
    db.close();
  }
});
```

- [ ] **Step 2: 실패 확인**

Run: `TEST_FILES=calendar-feed.test.mjs pnpm --filter @leave/api test`
Expected: FAIL — 피드 요청 404

- [ ] **Step 3: 피드 라우트** — `apps/api/src/routes/calendar-public.ts`

```ts
/**
 * 외부 캘린더 구독 피드 — 로그인 없이 토큰 주소로 받는 iCalendar.
 *
 * 마운트 위치: `/calendar` (apps/api/src/index.ts). 링크 관리는 routes/calendar-feed.ts.
 *
 * 토큰이 곧 열쇠다. 모르는 토큰은 이유를 붙이지 않고 404로 돌려보낸다.
 *
 * rate limit을 토큰 주인 단위로 거는 이유: `rateLimit`은 비로그인 요청을 IP로 세는데,
 * 구글 캘린더는 모든 사용자의 피드를 같은 구글 IP 대역에서 받아 간다. IP로 세면 한
 * 사람의 피드가 모두의 갱신을 막는다. 그래서 토큰으로 주인을 먼저 찾아 `user`에 넣고
 * 같은 미들웨어를 건다 — 접속 기록도 그 사용자의 동의 여부를 그대로 따른다.
 */
import { renderIcs, todayInSeoul } from "@leave/shared";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { createMiddleware } from "hono/factory";
import { calendarFeeds, users } from "../db/schema";
import { createApp, type AppEnv } from "../lib/app";
import { loadFeedItems } from "../lib/calendar-feed";
import { rateLimit } from "../middleware/rate-limit";

const FEED_FILE_RE = /^([A-Za-z0-9_-]{20,100})\.ics$/;
const NOT_FOUND = { error: "요청한 리소스를 찾을 수 없습니다" } as const;

const resolveFeedOwner = createMiddleware<AppEnv>(async (c, next) => {
  const match = FEED_FILE_RE.exec(c.req.param("file") ?? "");
  if (!match) return c.json(NOT_FOUND, 404);
  const [row] = await drizzle(c.env.DB)
    .select({ user: users })
    .from(calendarFeeds)
    .innerJoin(users, eq(users.id, calendarFeeds.userId))
    .where(eq(calendarFeeds.token, match[1]!))
    .limit(1);
  if (!row) return c.json(NOT_FOUND, 404);
  c.set("user", row.user);
  return next();
});

const app = createApp();

export const calendarPublicRoutes = app.get(
  "/:file",
  resolveFeedOwner,
  rateLimit({ name: "calendar-feed", limit: 60, windowSeconds: 600 }),
  async (c) => {
    const items = await loadFeedItems(
      drizzle(c.env.DB),
      c.get("user").id,
      todayInSeoul(),
    );
    return c.body(renderIcs(items, { calendarName: "리브", now: new Date() }), 200, {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, max-age=300",
    });
  },
);
```

- [ ] **Step 4: 마운트** — `apps/api/src/index.ts`에 `import { calendarPublicRoutes } from "./routes/calendar-public";`, 체인의 `.route("/calendar-feed", calendarFeedRoutes)` 다음 줄에:

```ts
  .route("/calendar", calendarPublicRoutes)
```

- [ ] **Step 5: 접속 기록 가리기** — `apps/api/src/middleware/access-log.ts`

`accessLogMiddleware` 정의 위에 추가:

```ts
/**
 * 구독 피드 주소의 토큰은 비밀번호와 같다. 경로째 남기면 관리 화면이 남의 일정 열쇠를
 * 들고 있게 된다(routes/calendar-public.ts).
 */
export function maskSecretPath(path: string): string {
  return path.startsWith("/calendar/") ? "/calendar/:token" : path;
}
```

insert의 `path: clamp(req.path, MAX_PATH_LENGTH),`를 다음으로 바꾼다:

```ts
        path: clamp(maskSecretPath(req.path), MAX_PATH_LENGTH),
```

- [ ] **Step 6: 통과 확인**

Run: `TEST_FILES=calendar-feed.test.mjs pnpm --filter @leave/api test`
Expected: 7 tests PASS (Task 4의 첫 테스트 포함)

`/calendar/abc` 테스트가 다른 404 모양으로 실패하면 `app.notFound`에 걸린 것이므로 그대로 404면 통과다.

- [ ] **Step 7: 실제 iCalendar 파서로 읽기** — 위 테스트를 돌린 상태에서 피드 하나를 저장해 파싱한다.

```bash
mkdir -p /tmp/claude-1000/ics-check && cd /tmp/claude-1000/ics-check
python3 -m venv venv && ./venv/bin/pip -q install icalendar
```

테스트 도중 피드를 파일로 남기는 대신, 로컬 dev 서버(`pnpm --filter @leave/api dev`)에서 가입 → `POST /calendar-feed` → 받은 URL을 `curl -s "$URL" > feed.ics`로 저장하고:

```bash
./venv/bin/python -I -c "
import icalendar,sys
cal=icalendar.Calendar.from_ical(open('feed.ics','rb').read())
events=[c for c in cal.walk('VEVENT')]
print(len(events)); [print(e['SUMMARY'], e['DTSTART'].dt, e.get('DTEND') and e['DTEND'].dt) for e in events]
"
```

Expected: 오류 없이 만든 일정 수만큼 출력, 종일 일정의 DTEND가 끝날 + 1일.

- [ ] **Step 8: 전체 API 테스트·타입·린트**

Run: `pnpm --filter @leave/api test && pnpm --filter @leave/api check-types && pnpm --filter @leave/api lint`
Expected: 전부 PASS

- [ ] **Step 9: 커밋**

```bash
git add apps/api/src apps/api/test/calendar-feed.test.mjs
git commit -m "feat(api): 무인증 iCalendar 구독 피드와 접속 기록의 토큰 가리기"
```

---

## Task 6: 클라이언트 훅 (`packages/client`)

**Files:**
- Modify: `packages/client/src/query-keys.ts`
- Create: `packages/client/src/hooks/calendar-feed.ts`
- Modify: `packages/client/src/index.ts`

**Interfaces:**
- Consumes: `GET/POST/DELETE /calendar-feed`, `GET /calendar-feed/items` (Task 4)
- Produces:
  - `queryKeys.calendarFeed = ["calendarFeed"]`, `queryKeys.calendarFeedItems = ["calendarFeed", "items"]`
  - `useCalendarFeed(): UseQueryResult<{ url: string | null }>`
  - `useEnableCalendarFeed(): UseMutationResult<{ url: string }, Error, void>` — 만들기·재발급 겸용
  - `useDisableCalendarFeed(): UseMutationResult<{ ok: true }, Error, void>`
  - `useCalendarFeedItems(enabled: boolean): UseQueryResult<{ items: FeedItem[] }>`

- [ ] **Step 1: 키** — `packages/client/src/query-keys.ts`의 `queryKeys` 객체 안 알맞은 자리(개인 일정 키 근처)에:

```ts
  /** 외부 캘린더 구독 링크. */
  calendarFeed: ["calendarFeed"] as const,
  /**
   * 외부 캘린더로 내보낼 내 일정. 링크 접두사 아래라 링크를 바꿀 때 함께 무효화되지만,
   * 일정이 바뀌는 쓰기(휴가·개인·부대 일정)는 이 키를 따로 무효화한다(invalidate.ts).
   */
  calendarFeedItems: ["calendarFeed", "items"] as const,
```

- [ ] **Step 2: 훅** — `packages/client/src/hooks/calendar-feed.ts`

```ts
/**
 * 외부 캘린더 구독 링크와 내보낼 일정.
 *
 * 사용처: 웹 프로필의 외부 캘린더 카드, 앱의 외부 캘린더 화면, 안드로이드 기기 캘린더 동기화.
 */
import type { FeedItem } from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryRequestOptions, useLeaveApi } from "../context";
import { queryKeys } from "../query-keys";
import { setAuthoritativeQueryData } from "./invalidate";

type CalendarFeed = { url: string | null };

export function useCalendarFeed() {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.calendarFeed,
    queryFn: (context) =>
      adapter.client["calendar-feed"]
        .$get(
          {},
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<CalendarFeed>(response)),
  });
}

/** 만들기와 재발급은 같은 요청이다 — 서버가 토큰을 덮어쓴다. */
export function useEnableCalendarFeed() {
  const adapter = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      adapter.unwrap<{ url: string }>(
        await adapter.client["calendar-feed"].$post(),
      ),
    onSuccess: (data) =>
      setAuthoritativeQueryData<CalendarFeed>(
        queryClient,
        queryKeys.calendarFeed,
        { url: data.url },
      ),
  });
}

export function useDisableCalendarFeed() {
  const adapter = useLeaveApi();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      adapter.unwrap<{ ok: true }>(
        await adapter.client["calendar-feed"].$delete(),
      ),
    onSuccess: () =>
      setAuthoritativeQueryData<CalendarFeed>(
        queryClient,
        queryKeys.calendarFeed,
        { url: null },
      ),
  });
}

export function useCalendarFeedItems(enabled: boolean) {
  const adapter = useLeaveApi();
  return useQuery({
    queryKey: queryKeys.calendarFeedItems,
    enabled,
    queryFn: (context) =>
      adapter.client["calendar-feed"].items
        .$get(
          {},
          queryRequestOptions(adapter.useRequestAbortSignal, context),
        )
        .then((response) => adapter.unwrap<{ items: FeedItem[] }>(response)),
  });
}
```

`$get({}, options)`의 첫 인자 모양이 다른 무인자 GET 훅과 다르면(예: `hooks/auth.ts`의 `useMe`), 그 훅의 호출 모양을 그대로 따른다.

- [ ] **Step 3: 내보내기** — `packages/client/src/index.ts`의 `export * from "./hooks/personal-events";` 다음 줄에:

```ts
export * from "./hooks/calendar-feed";
```

- [ ] **Step 4: 확인**

Run: `pnpm --filter @leave/client check-types && pnpm --filter @leave/client test && pnpm --filter @leave/client lint`
Expected: 오류 없음, 기존 테스트 PASS

- [ ] **Step 5: 커밋**

```bash
git add packages/client
git commit -m "feat(client): 외부 캘린더 구독 링크 훅"
```

---

## Task 7: 웹 — 프로필의 외부 캘린더 카드

**Files:**
- Create: `apps/web/src/components/CalendarFeedCard.tsx`
- Modify: `apps/web/src/pages/ProfilePage.tsx`

**Interfaces:**
- Consumes: `useCalendarFeed`, `useEnableCalendarFeed`, `useDisableCalendarFeed` (Task 6), `calendarFeedWebcalUrl`, `googleCalendarSubscribeUrl` (Task 2)

- [ ] **Step 1: 컴포넌트** — `apps/web/src/components/CalendarFeedCard.tsx`

```tsx
import { useState } from "react";
import {
  useCalendarFeed,
  useDisableCalendarFeed,
  useEnableCalendarFeed,
} from "@leave/client";
import {
  calendarFeedWebcalUrl,
  googleCalendarSubscribeUrl,
} from "@leave/shared";
import { ActionIcon } from "./ActionIcon";

/**
 * 리브 일정을 아이폰·구글 캘린더에서 구독하는 링크.
 *
 * 링크는 비밀번호와 같다. 재발급과 끄기는 이미 붙여 둔 캘린더를 끊으므로 한 번 묻는다.
 */
export function CalendarFeedCard() {
  const feed = useCalendarFeed();
  const enable = useEnableCalendarFeed();
  const disable = useDisableCalendarFeed();
  const [copied, setCopied] = useState(false);
  const url = feed.data?.url ?? null;
  const busy = enable.isPending || disable.isPending;

  const copy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
  };

  const rotate = () => {
    if (
      window.confirm(
        "새 링크를 만들면 지금 링크로 구독한 캘린더는 더 이상 갱신되지 않아요. 계속할까요?",
      )
    ) {
      setCopied(false);
      enable.mutate();
    }
  };

  const turnOff = () => {
    if (
      window.confirm(
        "링크를 끄면 구독한 캘린더에서 리브 일정이 더 이상 갱신되지 않아요. 끌까요?",
      )
    ) {
      setCopied(false);
      disable.mutate();
    }
  };

  return (
    <section
      className="card"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-md)" }}
    >
      <h2 className="display-xs">외부 캘린더</h2>
      <p className="body-sm text-body">
        외출·외박·휴가·개인 일정·부대 일정을 아이폰 캘린더나 구글 캘린더에서
        볼 수 있어요. 삼성 캘린더는 구글 캘린더에 추가하면 함께 보여요.
      </p>
      {feed.isPending ? null : url === null ? (
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={() => enable.mutate()}
        >
          <ActionIcon name="calendar" />
          구독 링크 만들기
        </button>
      ) : (
        <>
          <div style={{ display: "flex", gap: "var(--sp-md)", flexWrap: "wrap" }}>
            <a className="btn btn-secondary" href={calendarFeedWebcalUrl(url)}>
              iPhone·Mac 캘린더에 추가
            </a>
            <a
              className="btn btn-secondary"
              href={googleCalendarSubscribeUrl(url)}
              target="_blank"
              rel="noreferrer"
            >
              Google 캘린더에 추가
            </a>
            <button type="button" className="btn btn-secondary" onClick={() => void copy()}>
              {copied ? "복사했어요" : "링크 복사"}
            </button>
          </div>
          <p className="body-sm text-body">
            구글 캘린더는 바뀐 일정이 반영되기까지 최대 하루가 걸릴 수 있어요.
            링크를 가진 사람은 누구나 일정을 볼 수 있으니 공유하지 마세요.
          </p>
          <div style={{ display: "flex", gap: "var(--sp-md)", flexWrap: "wrap" }}>
            <button type="button" className="btn btn-tertiary" disabled={busy} onClick={rotate}>
              링크 재발급
            </button>
            <button type="button" className="btn btn-tertiary" disabled={busy} onClick={turnOff}>
              끄기
            </button>
          </div>
        </>
      )}
      {enable.error || disable.error ? (
        <p className="body-sm" role="alert">
          {(enable.error ?? disable.error)?.message}
        </p>
      ) : null}
    </section>
  );
}
```

`ActionIcon`이 `"calendar"` 이름을 모르면 `apps/web/src/components/ActionIcon.tsx`의 이름 목록에서 달력 아이콘 이름을 골라 쓰고, 없으면 아이콘 줄을 뺀다.

- [ ] **Step 2: 프로필에 붙이기** — `apps/web/src/pages/ProfilePage.tsx`

import에 `import { CalendarFeedCard } from "../components/CalendarFeedCard";`, `<PasskeyManager />` 다음 줄에 `<CalendarFeedCard />`.

- [ ] **Step 3: 타입·린트·테스트**

Run: `pnpm --filter @leave/web check-types && pnpm --filter @leave/web lint && pnpm --filter @leave/web test`
Expected: 오류 없음

- [ ] **Step 4: 브라우저 확인** — 메모리 `web-authed-browser-verification`의 절차로 로그인한 프로필 화면을 연다(`pnpm dev:web`). 확인할 것: 카드가 보인다 → `구독 링크 만들기` → 세 버튼 + 안내 → `링크 복사` 후 "복사했어요" → `링크 재발급` 확인창 수락 → 링크가 바뀐다(복사해 비교) → `끄기` → 만들기 버튼으로 돌아간다. 375px 폭에서 버튼이 카드 밖으로 넘치지 않는다.

- [ ] **Step 5: 커밋**

```bash
git add apps/web/src
git commit -m "feat(web): 프로필에서 외부 캘린더 구독 링크 관리"
```

---

## Task 8: 앱 — 외부 캘린더 화면 (구독 링크)

**Files:**
- Create: `apps/native/src/screens/calendar-export.tsx`
- Create: `apps/native/src/app/calendar-export.tsx`
- Modify: `apps/native/src/app/_layout.tsx` (`widget-settings` Stack.Screen 다음)
- Modify: `apps/native/src/screens/profile.tsx` (위젯 카드 다음)

**Interfaces:**
- Consumes: Task 6 훅, Task 2 링크 함수, `expo-clipboard`, `expo-linking`
- Produces: 라우트 `/calendar-export`, `CalendarExportScreen`, `testID="open-calendar-export"`. Task 15가 이 화면 맨 위에 안드로이드 영역을 끼운다 — 그 자리에 `{/* ANDROID_DEVICE_EXPORT */}` 같은 표시는 두지 않는다. Task 15는 `ScrollView`의 첫 자식으로 넣는다.

- [ ] **Step 1: 화면** — `apps/native/src/screens/calendar-export.tsx`

```tsx
/**
 * 외부 캘린더 화면 — 리브 일정을 아이폰·구글 캘린더에서 구독하는 링크를 관리한다.
 *
 * 사용처: 라우트 `app/calendar-export.tsx`. 프로필 탭에서 들어온다.
 *
 * 링크는 비밀번호와 같다. 재발급과 끄기는 이미 붙여 둔 캘린더를 끊으므로 한 번 묻는다.
 */
import * as Clipboard from "expo-clipboard";
import * as Linking from "expo-linking";
import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";
import {
  useCalendarFeed,
  useDisableCalendarFeed,
  useEnableCalendarFeed,
} from "@leave/client/hooks/calendar-feed";
import {
  calendarFeedWebcalUrl,
  googleCalendarSubscribeUrl,
} from "@leave/shared/calendar-feed";
import { Button } from "@/components/button";
import { ContentPanel } from "@/components/content-panel";
import { layout, makeStyles, spacing } from "@/theme";

function confirm(title: string, message: string, action: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "취소", style: "cancel", onPress: () => resolve(false) },
      { text: action, style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export function CalendarExportScreen() {
  const styles = useStyles();
  const feed = useCalendarFeed();
  const enable = useEnableCalendarFeed();
  const disable = useDisableCalendarFeed();
  const [copied, setCopied] = useState(false);
  const url = feed.data?.url ?? null;
  const busy = enable.isPending || disable.isPending;

  const rotate = async () => {
    if (
      await confirm(
        "링크 재발급",
        "새 링크를 만들면 지금 링크로 구독한 캘린더는 더 이상 갱신되지 않아요.",
        "재발급",
      )
    ) {
      setCopied(false);
      enable.mutate();
    }
  };

  const turnOff = async () => {
    if (
      await confirm(
        "구독 링크 끄기",
        "구독한 캘린더에서 리브 일정이 더 이상 갱신되지 않아요.",
        "끄기",
      )
    ) {
      setCopied(false);
      disable.mutate();
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      <ContentPanel style={styles.card}>
        <Text selectable style={styles.sectionTitle}>
          캘린더 구독 링크
        </Text>
        <Text selectable style={styles.sectionBody}>
          외출·외박·휴가·개인 일정·부대 일정을 아이폰 캘린더나 구글 캘린더에서 볼
          수 있어요. 삼성 캘린더는 구글 캘린더에 추가하면 함께 보여요.
        </Text>
        {feed.isPending ? null : url === null ? (
          <Button
            icon="calendarAdd"
            title="구독 링크 만들기"
            disabled={busy}
            onPress={() => enable.mutate()}
            testID="calendar-feed-enable"
          />
        ) : (
          <View style={styles.actions}>
            {process.env.EXPO_OS === "ios" ? (
              <Button
                icon="calendarAdd"
                title="iPhone 캘린더에 추가"
                onPress={() => void Linking.openURL(calendarFeedWebcalUrl(url))}
              />
            ) : null}
            <Button
              icon="calendarAdd"
              title="Google 캘린더에 추가"
              variant="secondary"
              onPress={() => void Linking.openURL(googleCalendarSubscribeUrl(url))}
            />
            <Button
              icon="copy"
              title={copied ? "복사했어요" : "링크 복사"}
              variant="secondary"
              onPress={() => {
                void Clipboard.setStringAsync(url).then(() => setCopied(true));
              }}
            />
            <Text selectable style={styles.sectionBody}>
              구글 캘린더는 바뀐 일정이 반영되기까지 최대 하루가 걸릴 수 있어요.
              링크를 가진 사람은 누구나 일정을 볼 수 있으니 공유하지 마세요.
            </Text>
            <Button
              icon="refresh"
              title="링크 재발급"
              variant="tertiary"
              disabled={busy}
              onPress={() => void rotate()}
            />
            <Button
              icon="close"
              title="끄기"
              variant="tertiary"
              disabled={busy}
              onPress={() => void turnOff()}
            />
          </View>
        )}
        {enable.error || disable.error ? (
          <Text selectable style={styles.error}>
            {(enable.error ?? disable.error)?.message}
          </Text>
        ) : null}
      </ContentPanel>
    </ScrollView>
  );
}

const useStyles = makeStyles(({ colors }) => ({
  root: { flex: 1, backgroundColor: colors.canvasSoft },
  content: {
    padding: layout.screenPadding,
    gap: spacing.lg,
  },
  card: { gap: spacing.md },
  actions: { gap: spacing.sm },
  sectionTitle: { fontSize: 17, fontWeight: "600", color: colors.ink },
  sectionBody: { fontSize: 14, lineHeight: 20, color: colors.inkMuted },
  error: { fontSize: 14, color: colors.danger },
}));
```

스타일 토큰 이름(`layout.screenPadding`, `spacing.lg`, `colors.inkMuted`, `colors.danger`)과 `sectionTitle`/`sectionBody` 값은 `screens/profile.tsx`의 `useStyles`에서 같은 이름의 스타일을 찾아 **그 값을 그대로** 쓴다. 이름이 없는 토큰은 profile.tsx가 쓰는 이름으로 바꾼다.

- [ ] **Step 2: 라우트 파일** — `apps/native/src/app/calendar-export.tsx`

```tsx
/**
 * 라우트 `외부 캘린더` → `screens/calendar-export.tsx`.
 * 프로필 탭에서 들어오고, 탭 밖의 최상위 라우트라 어디서 열어도 같은 화면이다.
 */
import { CalendarExportScreen } from "@/screens/calendar-export";

export default function CalendarExportRoute() {
  return <CalendarExportScreen />;
}
```

- [ ] **Step 3: Stack 등록** — `apps/native/src/app/_layout.tsx`의 `name="widget-settings"` `Stack.Screen` 블록을 그대로 복사해 바로 아래에 붙이고 `name="calendar-export"`, `title: "외부 캘린더"`로 바꾼다. 위젯 설정이 `Stack.Protected` 안에 있으면 같은 블록 안에 둔다.

- [ ] **Step 4: 프로필 카드** — `apps/native/src/screens/profile.tsx`의 위젯 `ContentPanel` 바로 다음에:

```tsx
        <ContentPanel style={styles.card}>
          <Text selectable style={styles.sectionTitle}>
            외부 캘린더
          </Text>
          <Text selectable style={styles.sectionBody}>
            리브 일정을 아이폰·구글·삼성 캘린더에서 함께 볼 수 있어요.
          </Text>
          <Button
            icon="calendar"
            title="외부 캘린더 연결"
            variant="secondary"
            onPress={() => router.push("/calendar-export")}
            testID="open-calendar-export"
          />
        </ContentPanel>
```

- [ ] **Step 5: 타입·린트·테스트** — 메모리 `deploy-workflow`: native tsc는 힙을 늘려야 한다.

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint && pnpm --filter @leave/native test`
Expected: 오류 없음

- [ ] **Step 6: 웹 타깃으로 화면 확인** — 메모리 `native-web-verification`의 절차로 apps/native 웹 타깃을 띄워 프로필 → `외부 캘린더 연결` → 만들기 → 버튼들(웹은 iOS가 아니므로 iPhone 버튼 없음) → 재발급·끄기 확인창. `Alert.alert` 확인창이 웹 타깃에서 동작하지 않으면 그 메모리에 적힌 대로 기기 검증 항목으로 남긴다.

- [ ] **Step 7: 커밋**

```bash
git add apps/native/src
git commit -m "feat(native): 외부 캘린더 구독 링크 화면"
```

---

## Task 9: 릴리스 1 전체 검증과 배포 준비

- [ ] **Step 1: 전체 품질 검사**

Run: `pnpm quality`
Expected: 전부 PASS. 실패하면 메모리 `web-e2e-pitfalls`의 원인(8787 상주 서버, signup 429)부터 확인한다.

- [ ] **Step 2: 실기 확인 (사람)** — 로컬 API는 휴대폰에서 닿지 않으므로 **API 배포 후** 확인한다. 배포는 사용자 승인 뒤 `deploy-web` skill(API: 프로덕션 D1 마이그레이션 `0039` 포함 → 웹)과 `deploy-app` skill(OTA)을 따른다. 확인 목록:
  - 아이폰: `iPhone 캘린더에 추가` → 구독 확인 창 → 캘린더 앱에 `리브` 캘린더와 일정이 보인다. 종일 휴가의 마지막 날이 포함돼 있다.
  - 구글: `Google 캘린더에 추가` → 구글 캘린더 웹에 `리브`가 추가된다. 갤럭시의 삼성 캘린더에 구글 계정을 통해 나타난다.
  - 리브에서 휴가 하나를 지운다 → 아이폰 캘린더에서 새로고침(캘린더 목록 당겨서) 후 사라진다.
  - `링크 재발급` → 아이폰 구독이 다음 갱신부터 실패한다.

---

## Task 10: `expo-calendar` 설치와 권한 (릴리스 2 시작)

**Files:**
- Modify: `apps/native/package.json`, `pnpm-lock.yaml`
- Modify: `apps/native/app.json`

- [ ] **Step 1: 설치**

Run: `cd apps/native && npx expo install expo-calendar`
Expected: SDK에 맞는 `expo-calendar` 버전이 `dependencies`에 고정 버전으로 들어간다(다른 expo 패키지처럼 `^` 없이. 붙어 있으면 지운다 — 커밋 `a6326b7`이 지정자를 고정 버전에 맞췄다).

- [ ] **Step 2: API 표면 확인** — 이 계획의 bridge는 `expo-calendar/legacy`의 함수형 API(`requestCalendarPermissionsAsync`, `getCalendarPermissionsAsync`, `getCalendarsAsync`, `createCalendarAsync`, `deleteCalendarAsync`, `getEventsAsync`, `createEventAsync`, `deleteEventAsync`, `EntityTypes`, `CalendarAccessLevel`)를 쓴다.

Run: `node -e "const p=require('./apps/native/node_modules/expo-calendar/package.json');console.log(p.version, Object.keys(p.exports||{}))"`
Expected: `./legacy` export가 있다. 없으면 같은 이름의 함수가 루트 export(`expo-calendar`)에 있는지 `apps/native/node_modules/expo-calendar/build/index.d.ts`에서 확인하고, Task 13의 import 경로를 `expo-calendar`로 바꾼다. 둘 다 없으면 멈추고 보고한다.

- [ ] **Step 3: app.json** — `expo.plugins`에 추가:

```json
[
  "expo-calendar",
  {
    "calendarPermission": "리브 일정을 이 기기의 캘린더에 추가하려면 캘린더 접근 권한이 필요해요."
  }
]
```

`expo.android.permissions`(지금 `[]`)를:

```json
"permissions": ["android.permission.READ_CALENDAR", "android.permission.WRITE_CALENDAR"]
```

`blockedPermissions`에는 두 권한이 없음을 확인한다.

- [ ] **Step 4: 지문이 바뀌었는지 확인** — 메모리 `deploy-workflow`의 fingerprint 절차로 이전 커밋과 지문을 비교한다.

Expected: android·ios 지문이 모두 바뀐다(= OTA로 못 나감, 새 빌드 필요. 정상).

- [ ] **Step 5: 커밋**

```bash
git add apps/native/package.json apps/native/app.json pnpm-lock.yaml
git commit -m "chore(native): 안드로이드 기기 캘린더 쓰기용 expo-calendar와 캘린더 권한"
```

---

## Task 11: 기기 일정 변환과 내용 서명 (순수)

**Files:**
- Create: `apps/native/src/device-calendar-export/convert.ts`
- Create: `apps/native/test/device-calendar-export.test.ts`

**Interfaces:**
- Consumes: `FeedItem` (`@leave/shared/calendar-feed`), `addDays` (`@leave/shared/dates`)
- Produces:
  - `type DeviceEventInput = { title: string; notes: string; startDate: Date; endDate: Date; allDay: boolean; timeZone: string }`
  - `toDeviceEvent(item: FeedItem): DeviceEventInput`
  - `itemsSignature(items: readonly FeedItem[]): string`

- [ ] **Step 1: 실패하는 테스트** — `apps/native/test/device-calendar-export.test.ts`

```ts
import { describe, expect, it } from "vitest";
import type { FeedItem } from "@leave/shared/calendar-feed";
import {
  itemsSignature,
  toDeviceEvent,
} from "../src/device-calendar-export/convert";

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    uid: "leave-1",
    title: "[휴가] 여름 휴가",
    description: "8/2~8/5 연가",
    startDate: "2026-08-02",
    endDate: "2026-08-05",
    startTime: null,
    endTime: null,
    ...overrides,
  };
}

describe("toDeviceEvent", () => {
  it("종일 일정은 UTC 자정, 끝은 끝날 다음 날 UTC 자정", () => {
    const event = toDeviceEvent(item());
    expect(event.allDay).toBe(true);
    expect(event.timeZone).toBe("UTC");
    expect(event.startDate.getTime()).toBe(Date.UTC(2026, 7, 2));
    expect(event.endDate.getTime()).toBe(Date.UTC(2026, 7, 6));
  });

  it("시각 일정은 서울 시각으로", () => {
    const event = toDeviceEvent(
      item({ startDate: "2026-10-01", endDate: "2026-10-02", startTime: "09:30", endTime: "18:00" }),
    );
    expect(event.allDay).toBe(false);
    expect(event.timeZone).toBe("Asia/Seoul");
    expect(event.startDate.toISOString()).toBe("2026-10-01T00:30:00.000Z");
    expect(event.endDate.toISOString()).toBe("2026-10-02T09:00:00.000Z");
  });

  it("끝 시간이 없는 시각 일정은 시작과 같은 시각에 끝난다", () => {
    const event = toDeviceEvent(item({ startDate: "2026-10-01", endDate: "2026-10-01", startTime: "09:30" }));
    expect(event.endDate.getTime()).toBe(event.startDate.getTime());
  });

  it("설명이 없으면 빈 메모", () => {
    expect(toDeviceEvent(item({ description: null })).notes).toBe("");
  });
});

describe("itemsSignature", () => {
  it("같은 항목은 같은 서명, 하나라도 바뀌면 다른 서명", () => {
    const a = [item(), item({ uid: "leave-2" })];
    expect(itemsSignature(a)).toBe(itemsSignature([item(), item({ uid: "leave-2" })]));
    expect(itemsSignature(a)).not.toBe(itemsSignature([item(), item({ uid: "leave-2", title: "바뀜" })]));
    expect(itemsSignature([])).not.toBe(itemsSignature(a));
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @leave/native exec vitest run test/device-calendar-export.test.ts`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현** — `apps/native/src/device-calendar-export/convert.ts`

```ts
/**
 * 피드 항목 → 기기 캘린더 일정 입력. 순수 함수라 기기 없이 테스트한다.
 *
 * 사용처: ./bridge.android.ts(쓰기), ./calendar-export-sync.android.tsx(서명 비교).
 */
import type { FeedItem } from "@leave/shared/calendar-feed";
import { addDays } from "@leave/shared/dates";

export type DeviceEventInput = {
  title: string;
  notes: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  timeZone: string;
};

function utcMidnight(date: string): Date {
  return new Date(`${date}T00:00:00Z`);
}

function seoulTime(date: string, time: string): Date {
  return new Date(`${date}T${time}:00+09:00`);
}

/**
 * 안드로이드 캘린더 제공자는 종일 일정을 **UTC 자정**으로 저장하라고 요구한다.
 * 서울 자정(= 전날 15:00 UTC)으로 쓰면 삼성 캘린더에서 하루 앞당겨 보인다.
 * 끝은 배타적이라 끝날 다음 날 자정이다.
 */
export function toDeviceEvent(item: FeedItem): DeviceEventInput {
  if (item.startTime === null) {
    return {
      title: item.title,
      notes: item.description ?? "",
      startDate: utcMidnight(item.startDate),
      endDate: utcMidnight(addDays(item.endDate, 1)),
      allDay: true,
      timeZone: "UTC",
    };
  }
  const start = seoulTime(item.startDate, item.startTime);
  return {
    title: item.title,
    notes: item.description ?? "",
    startDate: start,
    // 안드로이드는 반복 없는 일정에 끝 시각을 요구한다. 끝이 없으면 시작 시각에 끝낸다.
    endDate:
      item.endTime === null ? start : seoulTime(item.endDate, item.endTime),
    allDay: false,
    timeZone: "Asia/Seoul",
  };
}

/**
 * 마지막으로 쓴 내용과 같은지 가리는 서명. 서버가 정렬해 보내므로(buildFeedItems)
 * 직렬화한 문자열을 FNV-1a로 접기만 하면 된다. 보안 용도가 아니다.
 */
export function itemsSignature(items: readonly FeedItem[]): string {
  const text = JSON.stringify(items);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${items.length}:${hash.toString(16)}`;
}
```

- [ ] **Step 4: 통과 확인**

Run: `pnpm --filter @leave/native exec vitest run test/device-calendar-export.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add apps/native/src/device-calendar-export/convert.ts apps/native/test/device-calendar-export.test.ts
git commit -m "feat(native): 피드 항목을 안드로이드 기기 일정으로 바꾸는 변환"
```

---

## Task 12: 기기 내보내기 설정 (기기 로컬)

**Files:**
- Create: `apps/native/src/device-calendar-export/storage.ts`, `storage.native.ts`
- Create: `apps/native/src/device-calendar-export/preferences.ts`
- Create: `apps/native/src/device-calendar-export/use-export-preferences.ts`
- Modify: `apps/native/test/device-calendar-export.test.ts`

**Interfaces:**
- Produces:
  - `type ExportPreferences = { enabled: boolean; calendarId: string | null; signature: string | null }`
  - `normalizeExportPreferences(value: unknown): ExportPreferences`
  - `getExportPreferences()`, `loadExportPreferences(): Promise<ExportPreferences>`, `saveExportPreferences(next: ExportPreferences): Promise<ExportPreferences>`, `subscribeExportPreferences(listener): () => void`
  - `useExportPreferences(): ExportPreferences`

- [ ] **Step 1: 실패하는 테스트 추가** — `apps/native/test/device-calendar-export.test.ts` 끝에

```ts
import { normalizeExportPreferences } from "../src/device-calendar-export/preferences";

describe("normalizeExportPreferences", () => {
  it("저장된 적 없으면 꺼짐", () => {
    expect(normalizeExportPreferences(undefined)).toEqual({ enabled: false, calendarId: null, signature: null });
  });

  it("모양이 어긋난 값은 버린다", () => {
    expect(normalizeExportPreferences({ enabled: "yes", calendarId: 3, signature: ["x"] })).toEqual({
      enabled: false,
      calendarId: null,
      signature: null,
    });
  });

  it("아는 값은 지킨다", () => {
    const value = { enabled: true, calendarId: "12", signature: "3:abc" };
    expect(normalizeExportPreferences(value)).toEqual(value);
  });
});
```

(import 줄은 파일 맨 위 import 묶음으로 옮긴다.)

- [ ] **Step 2: 실패 확인**

Run: `pnpm --filter @leave/native exec vitest run test/device-calendar-export.test.ts`
Expected: FAIL — preferences 모듈 없음

- [ ] **Step 3: 저장소** — `widgets/storage*.ts`와 같은 짝.

`apps/native/src/device-calendar-export/storage.native.ts`:

```ts
/**
 * 기기 캘린더 내보내기 설정 저장소 — iOS/Android 구현.
 *
 * 위젯 설정과 데이터베이스를 나눈다. 위젯 설정은 로그아웃해도 남는 기기 취향이지만,
 * 이 값은 로그아웃할 때 `리브` 캘린더와 함께 지운다(./bridge.android.ts).
 */
import { SQLiteStorage } from "expo-sqlite/kv-store";

export interface ExportStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const exportStorage: ExportStorage = new SQLiteStorage(
  "leave-calendar-export.db",
);
```

`apps/native/src/device-calendar-export/storage.ts`:

```ts
/**
 * 기기 캘린더 내보내기 설정 저장소 — 웹(Expo web 타깃) 구현.
 * 웹에는 기기 캘린더가 없어 값을 쓰지 않지만, 같은 모듈 모양을 지킨다.
 */
export interface ExportStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const exportStorage: ExportStorage = {
  getItem: async (key) => globalThis.localStorage?.getItem(key) ?? null,
  setItem: async (key, value) => {
    globalThis.localStorage?.setItem(key, value);
  },
};
```

- [ ] **Step 4: 설정 스토어** — `apps/native/src/device-calendar-export/preferences.ts` (`widgets/preferences.ts`와 같은 모양)

```ts
/**
 * 안드로이드 기기 캘린더 내보내기 설정 — 이 기기에서만 뜻이 있는 값.
 *
 * 사용처: screens/calendar-export.tsx(켜고 끄기), ./calendar-export-sync.android.tsx(동기화).
 *
 * 서버에 두지 않는 이유: `calendarId`는 이 휴대폰의 캘린더 제공자가 준 번호라 다른
 * 기기에서는 아무 뜻이 없다.
 */
import { exportStorage } from "./storage";

const STORAGE_KEY = "leave.calendar-export.preferences";

export type ExportPreferences = {
  enabled: boolean;
  /** 우리가 만든 `리브` 캘린더. 아직 만들지 않았으면 null. */
  calendarId: string | null;
  /** 마지막으로 쓴 내용의 서명(convert.ts의 itemsSignature). */
  signature: string | null;
};

export const defaultExportPreferences: ExportPreferences = {
  enabled: false,
  calendarId: null,
  signature: null,
};

export function normalizeExportPreferences(value: unknown): ExportPreferences {
  const raw = (value ?? {}) as Partial<Record<keyof ExportPreferences, unknown>>;
  return {
    enabled: raw.enabled === true,
    calendarId: typeof raw.calendarId === "string" ? raw.calendarId : null,
    signature: typeof raw.signature === "string" ? raw.signature : null,
  };
}

let current: ExportPreferences = defaultExportPreferences;
let loaded = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeExportPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getExportPreferences(): ExportPreferences {
  return current;
}

export async function loadExportPreferences(): Promise<ExportPreferences> {
  if (loaded) return current;
  loaded = true;
  try {
    const stored = await exportStorage.getItem(STORAGE_KEY);
    if (stored) current = normalizeExportPreferences(JSON.parse(stored));
  } catch {
    // 못 읽으면 꺼진 상태로 간다. 다시 켜면 캘린더를 새로 만든다.
  }
  emit();
  return current;
}

export async function saveExportPreferences(
  next: ExportPreferences,
): Promise<ExportPreferences> {
  current = normalizeExportPreferences(next);
  loaded = true;
  emit();
  try {
    await exportStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // 저장 실패는 이번 실행을 막지 않는다 — 메모리 값으로 계속 동작한다.
  }
  return current;
}
```

`apps/native/src/device-calendar-export/use-export-preferences.ts`:

```ts
import { useEffect, useSyncExternalStore } from "react";
import {
  getExportPreferences,
  loadExportPreferences,
  subscribeExportPreferences,
  type ExportPreferences,
} from "./preferences";

export function useExportPreferences(): ExportPreferences {
  useEffect(() => {
    void loadExportPreferences();
  }, []);

  return useSyncExternalStore(
    subscribeExportPreferences,
    getExportPreferences,
    getExportPreferences,
  );
}
```

- [ ] **Step 5: 통과 확인**

Run: `pnpm --filter @leave/native exec vitest run test/device-calendar-export.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: 커밋**

```bash
git add apps/native/src/device-calendar-export apps/native/test/device-calendar-export.test.ts
git commit -m "feat(native): 기기 캘린더 내보내기 설정 저장"
```

---

## Task 13: 기기 캘린더 bridge (안드로이드)

**Files:**
- Create: `apps/native/src/device-calendar-export/bridge.ts`
- Create: `apps/native/src/device-calendar-export/bridge.android.ts`

**Interfaces:**
- Consumes: `toDeviceEvent` (Task 11), 설정 스토어 (Task 12)
- Produces (두 파일 같은 시그니처):
  - `deviceExportSupported: boolean` (android만 true)
  - `requestExportPermission(): Promise<boolean>`
  - `hasExportPermission(): Promise<boolean>`
  - `writeItems(items: readonly FeedItem[], calendarId: string | null): Promise<string>` — 캘린더가 없으면 만들고, 일정을 모두 지운 뒤 다시 쓰고, 쓴 캘린더 ID를 돌려준다
  - `removeExportCalendar(): Promise<void>` — 설정의 캘린더를 지우고 설정을 꺼짐으로 되돌린다

- [ ] **Step 1: no-op 짝** — `apps/native/src/device-calendar-export/bridge.ts`

```ts
/**
 * 기기 캘린더 bridge — iOS·웹 구현(아무것도 하지 않는다).
 * 아이폰은 구독 링크가 기본 캘린더에 그대로 붙어 직접 쓰기가 필요 없다.
 * `.android.ts` 짝이 Metro의 플랫폼 확장자 규칙에 따라 안드로이드에서 선택된다.
 */
import type { FeedItem } from "@leave/shared/calendar-feed";

export const deviceExportSupported = false;

export async function requestExportPermission(): Promise<boolean> {
  return false;
}

export async function hasExportPermission(): Promise<boolean> {
  return false;
}

export async function writeItems(
  _items: readonly FeedItem[],
  calendarId: string | null,
): Promise<string> {
  return calendarId ?? "";
}

export async function removeExportCalendar(): Promise<void> {}
```

- [ ] **Step 2: 안드로이드 구현** — `apps/native/src/device-calendar-export/bridge.android.ts` (Task 10 Step 2에서 import 경로를 바꿨으면 그 경로로)

```ts
/**
 * 기기 캘린더 bridge — 안드로이드 구현. expo-calendar와 닿는 유일한 자리.
 *
 * 우리가 만든 `리브` 로컬 캘린더 **안에만** 쓴다. 사용자의 다른 캘린더는 읽지도
 * 고치지도 않는다. 끌 때는 그 캘린더를 통째로 지운다.
 */
import type { FeedItem } from "@leave/shared/calendar-feed";
import * as Calendar from "expo-calendar/legacy";
import { toDeviceEvent } from "./convert";
import {
  getExportPreferences,
  loadExportPreferences,
  saveExportPreferences,
  defaultExportPreferences,
} from "./preferences";

export const deviceExportSupported = true;

const CALENDAR_TITLE = "리브";
/** 사용자가 지운 캘린더와 지금 일정을 모두 덮을 만큼 넓은 범위. */
const SCAN_START = new Date(Date.UTC(2000, 0, 1));
const SCAN_END = new Date(Date.UTC(2100, 0, 1));

export async function requestExportPermission(): Promise<boolean> {
  const { status } = await Calendar.requestCalendarPermissionsAsync();
  return status === "granted";
}

export async function hasExportPermission(): Promise<boolean> {
  const { status } = await Calendar.getCalendarPermissionsAsync();
  return status === "granted";
}

async function calendarExists(id: string): Promise<boolean> {
  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  return calendars.some((calendar) => calendar.id === id);
}

async function createCalendar(): Promise<string> {
  return Calendar.createCalendarAsync({
    title: CALENDAR_TITLE,
    name: "leave",
    color: "#2F6B4F",
    entityType: Calendar.EntityTypes.EVENT,
    source: { isLocalAccount: true, name: CALENDAR_TITLE, type: "LOCAL" },
    ownerAccount: "leave",
    accessLevel: Calendar.CalendarAccessLevel.OWNER,
  });
}

/**
 * 바뀌었으면 다시 쓴다. 일정별로 차이를 맞추는 것보다 느리지만 어긋날 수가 없다 —
 * 어긋난 동기화가 남기는 유령 일정은 틀린 날짜를 믿게 만든다.
 * 사용자가 `리브` 캘린더를 지웠으면 새로 만든다.
 */
export async function writeItems(
  items: readonly FeedItem[],
  calendarId: string | null,
): Promise<string> {
  const id =
    calendarId !== null && (await calendarExists(calendarId))
      ? calendarId
      : await createCalendar();
  const existing = await Calendar.getEventsAsync([id], SCAN_START, SCAN_END);
  for (const event of existing) {
    await Calendar.deleteEventAsync(event.id);
  }
  for (const item of items) {
    await Calendar.createEventAsync(id, toDeviceEvent(item));
  }
  return id;
}

/** 끄기·로그아웃·인증 만료. 권한이 없으면 지울 수 없으니 설정만 비운다. */
export async function removeExportCalendar(): Promise<void> {
  await loadExportPreferences();
  const { calendarId } = getExportPreferences();
  if (calendarId !== null && (await hasExportPermission())) {
    try {
      if (await calendarExists(calendarId)) {
        await Calendar.deleteCalendarAsync(calendarId);
      }
    } catch {
      // 캘린더 제공자 오류로 남은 캘린더는 사용자가 기기 설정에서 지울 수 있다.
    }
  }
  await saveExportPreferences(defaultExportPreferences);
}
```

`color` 값은 `apps/native/src/theme`의 브랜드 색 hex로 바꾼다(테마 파일에서 `brand` 값을 찾아 같은 hex).

- [ ] **Step 3: 타입·린트**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint`
Expected: 오류 없음. `createCalendarAsync`의 `source` 타입이 `type`을 받지 않으면 `type` 필드를 지우고 `isLocalAccount: true`만 남긴다(안드로이드 구현이 로컬 계정 타입을 채운다).

- [ ] **Step 4: 커밋**

```bash
git add apps/native/src/device-calendar-export
git commit -m "feat(native): 안드로이드 리브 기기 캘린더 쓰기 bridge"
```

---

## Task 14: 일정 쓰기 뒤 항목 쿼리 무효화

**Files:**
- Modify: `packages/client/src/hooks/invalidate.ts`
- Modify: `packages/client/src/hooks/personal-events.ts`
- Modify: `packages/client/src/hooks/unit-events.ts`

**Interfaces:**
- Consumes: `queryKeys.calendarFeedItems` (Task 6)

- [ ] **Step 1: 휴가** — `invalidate.ts`의 `LEAVE_MUTATION_KEYS` 배열 끝에 `queryKeys.calendarFeedItems,`를 넣고, 바로 위 주석 끝에 한 줄: `외부 캘린더로 내보내는 일정도 함께 낡는다.`

- [ ] **Step 2: 개인 일정** — `personal-events.ts`의 `invalidateEventMonths` 함수 안, `Promise.all` 앞에:

```ts
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendarFeedItems });
```

- [ ] **Step 3: 부대 일정** — `unit-events.ts`의 `invalidateUnitEventMonths` 함수 안, `dutyDays` 무효화 줄 다음에:

```ts
  void queryClient.invalidateQueries({ queryKey: queryKeys.calendarFeedItems });
```

그룹 가입·탈퇴(`hooks/units.ts`)는 이미 모든 쿼리를 무효화하므로 손대지 않는다.

- [ ] **Step 4: 기존 무효화 테스트 확인**

Run: `pnpm --filter @leave/client test && pnpm --filter @leave/client check-types`
Expected: PASS. `invalidation.test.tsx`가 `LEAVE_MUTATION_KEYS`의 정확한 목록을 단언하면 그 기대값에 `["calendarFeed", "items"]`를 더한다.

- [ ] **Step 5: 커밋**

```bash
git add packages/client/src
git commit -m "feat(client): 일정이 바뀌면 외부 캘린더 내보내기 항목도 다시 받는다"
```

---

## Task 15: 동기화 컴포넌트, 로그아웃 정리, 안드로이드 토글

**Files:**
- Create: `apps/native/src/device-calendar-export/calendar-export-sync.tsx`
- Create: `apps/native/src/device-calendar-export/calendar-export-sync.android.tsx`
- Modify: `apps/native/src/app/_layout.tsx`
- Modify: `apps/native/src/api/provider.tsx`
- Modify: `apps/native/src/screens/calendar-export.tsx`

**Interfaces:**
- Consumes: Task 11–14 전부, `useCalendarFeedItems` (Task 6), `captureHandledError` (`@/lib/observability`)
- Produces: `CalendarExportSync({ authenticated }: { authenticated: boolean })`

- [ ] **Step 1: no-op 짝** — `calendar-export-sync.tsx`

```tsx
/** 기기 캘린더 동기화 — iOS·웹에서는 할 일이 없다. 안드로이드 구현은 `.android.tsx`. */
export function CalendarExportSync(_props: { authenticated: boolean }) {
  return null;
}
```

- [ ] **Step 2: 안드로이드 구현** — `calendar-export-sync.android.tsx`

```tsx
/**
 * 내보낼 일정을 받아 `리브` 기기 캘린더에 맞춘다. 화면을 그리지 않는 컴포넌트다.
 *
 * 사용처: app/_layout.tsx의 RootNavigator. `WidgetSync`와 같은 자리다.
 *
 * 언제 맞추는가: 항목 쿼리 결과가 바뀔 때. 그 쿼리는 앱이 포그라운드로 올 때
 * (query-persistence.ts가 focusManager를 AppState에 묶었다)와 휴가·개인·부대 일정을
 * 쓴 뒤(Task 14의 무효화) 다시 받아진다.
 *
 * 한계: 앱이 실행 중일 때만 맞춘다. 관리자가 바꾼 부대 일정은 다음에 앱을 열 때 반영된다.
 */
import { useCalendarFeedItems } from "@leave/client/hooks/calendar-feed";
import { useEffect, useRef, useState } from "react";
import { captureHandledError } from "@/lib/observability";
import { hasExportPermission, writeItems } from "./bridge";
import { itemsSignature } from "./convert";
import { getExportPreferences, saveExportPreferences } from "./preferences";
import { useExportPreferences } from "./use-export-preferences";

function ReadyCalendarExportSync() {
  const preferences = useExportPreferences();
  const items = useCalendarFeedItems(preferences.enabled);
  const running = useRef(false);
  // 쓰는 도중 항목이 또 바뀌면 그 effect는 건너뛴다. 쓰기가 끝나면 한 번 더 돌려 놓친 변경을 맞춘다.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const data = items.data?.items;
    if (!preferences.enabled || !data || running.current) return;
    const signature = itemsSignature(data);
    if (signature === preferences.signature) return;

    running.current = true;
    void (async () => {
      try {
        if (!(await hasExportPermission())) {
          // 기기 설정에서 권한을 거둬 갔다. 화면 토글이 꺼짐으로 보이게 한다.
          await saveExportPreferences({ ...getExportPreferences(), enabled: false });
          return;
        }
        const calendarId = await writeItems(data, getExportPreferences().calendarId);
        // 쓰는 동안 사용자가 껐으면 켜짐으로 되돌려 놓지 않는다. 끄기가 캘린더를 지운다.
        if (getExportPreferences().enabled) {
          await saveExportPreferences({ enabled: true, calendarId, signature });
        }
        // 성공했을 때만 다시 본다. 실패마다 다시 돌면 고장 난 캘린더 제공자에 무한히 쓴다.
        setRetry((count) => count + 1);
      } catch (error) {
        captureHandledError(error, { source: "device_calendar_export" });
      } finally {
        running.current = false;
      }
    })();
  }, [items.data, preferences.enabled, preferences.signature, retry]);

  return null;
}

export function CalendarExportSync({ authenticated }: { authenticated: boolean }) {
  // 로그아웃 상태에서는 항목 요청이 아예 나가지 않도록 컴포넌트를 갈아 끼운다.
  return authenticated ? <ReadyCalendarExportSync /> : null;
}
```

`captureHandledError`의 두 번째 인자 `source` 값 타입이 문자열 리터럴 합집합이면 그 정의(`apps/native/src/lib/observability`)에 `"device_calendar_export"`를 추가한다.

- [ ] **Step 3: 마운트** — `apps/native/src/app/_layout.tsx`

import: `import { CalendarExportSync } from "@/device-calendar-export/calendar-export-sync";`

`lifecycle` 프래그먼트의 `WidgetSync` 줄 다음에:

```tsx
      {widgetState === "ready" ? <CalendarExportSync authenticated /> : null}
```

(`ready`는 로그인 + 온보딩 완료다. 온보딩 전에는 `/calendar-feed/items`가 onboarding 미들웨어에 막힌다.)

- [ ] **Step 4: 로그아웃·401 정리** — `apps/native/src/api/provider.tsx`

import: `import { removeExportCalendar } from "@/device-calendar-export/bridge";`

`setUnauthorizedHandler` 콜백 안 `void resetWidgetSession(false);` 다음 줄에:

```ts
      void removeExportCalendar();
```

`setSessionToken`의 `if (token === null) {` 블록 맨 앞에:

```ts
          await removeExportCalendar();
```

탈퇴는 성공 후 `setSessionToken(null)`을 거치므로 따로 처리하지 않는다 — 탈퇴 흐름이 정말 그 함수를 부르는지 `useDeleteAccount`(packages/client)에서 확인하고, 아니면 멈추고 보고한다.

- [ ] **Step 5: 안드로이드 토글** — `apps/native/src/screens/calendar-export.tsx`

import 추가:

```tsx
import { NativeCheckbox } from "@/components/native-checkbox";
import {
  deviceExportSupported,
  removeExportCalendar,
  requestExportPermission,
} from "@/device-calendar-export/bridge";
import { saveExportPreferences } from "@/device-calendar-export/preferences";
import { useExportPreferences } from "@/device-calendar-export/use-export-preferences";
```

컴포넌트 안 훅 선언부에:

```tsx
  const exportPreferences = useExportPreferences();
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const toggleDeviceExport = async (next: boolean) => {
    setDeviceError(null);
    if (!next) {
      await removeExportCalendar();
      return;
    }
    if (!(await requestExportPermission())) {
      setDeviceError("캘린더 권한이 없어 추가할 수 없어요. 기기 설정에서 허용해 주세요.");
      return;
    }
    // 켜기만 저장한다. 실제 쓰기는 CalendarExportSync가 항목을 받아 맡는다.
    await saveExportPreferences({ ...exportPreferences, enabled: true, signature: null });
  };
```

`ScrollView`의 첫 자식으로(구독 링크 `ContentPanel` 앞에):

```tsx
      {deviceExportSupported ? (
        <ContentPanel style={styles.card}>
          <Text selectable style={styles.sectionTitle}>
            휴대폰 캘린더에 바로 추가
          </Text>
          <Text selectable style={styles.sectionBody}>
            이 휴대폰에 `리브` 캘린더를 만들고 일정을 넣어요. 삼성 캘린더에서 바로
            보여요. 앱을 열 때마다 맞춰요.
          </Text>
          <NativeCheckbox
            value={exportPreferences.enabled}
            onValueChange={(next) => void toggleDeviceExport(next)}
            label="휴대폰 캘린더에 추가"
            testID="device-calendar-export-toggle"
          />
          {deviceError ? (
            <Text selectable style={styles.error}>
              {deviceError}
            </Text>
          ) : null}
        </ContentPanel>
      ) : null}
```

본문의 백틱은 쓰지 말고 `‘리브’ 캘린더`처럼 따옴표로 바꾼다(JSX 텍스트에 백틱이 그대로 보인다).

- [ ] **Step 6: 전체 네이티브 확인**

Run: `NODE_OPTIONS=--max-old-space-size=8192 pnpm --filter @leave/native check-types && pnpm --filter @leave/native lint && pnpm --filter @leave/native test`
Expected: 오류 없음

- [ ] **Step 7: 커밋**

```bash
git add apps/native/src packages/client/src
git commit -m "feat(native): 안드로이드에서 리브 일정을 기기 캘린더에 맞추기"
```

---

## Task 16: 릴리스 2 검증 (실기, 사람 + 빌드)

- [ ] **Step 1: 전체 품질 검사**

Run: `pnpm quality`
Expected: PASS

- [ ] **Step 2: 개발 빌드로 갤럭시 확인** — `deploy-app` skill의 절차로 안드로이드 빌드를 만든다(사용자 승인 후). 확인 목록:
  - 외부 캘린더 화면에 `휴대폰 캘린더에 바로 추가`가 보인다. iPhone에서는 보이지 않는다.
  - 켜기 → 권한 요청 → 허용 → 삼성 캘린더의 캘린더 목록에 `리브`, 휴가가 보인다. **종일 휴가가 하루 밀리지 않는다**(시작일·끝날 확인).
  - 리브에서 휴가 날짜를 바꾼다 → 삼성 캘린더에 반영(중복 없음).
  - 앱을 백그라운드로 보냈다 돌아온다 → 오류 없음.
  - 기기 설정에서 캘린더 권한을 끈다 → 앱으로 돌아오면 토글이 꺼짐.
  - 끄기 → `리브` 캘린더가 사라진다.
  - 다시 켠 뒤 로그아웃 → `리브` 캘린더가 사라진다.
- [ ] **Step 3: 스토어 제출 준비 (사람)** — Play Console 데이터 보안 양식에 "캘린더 — 기기에서만 쓰고 수집·전송하지 않음"을 적는다. iOS도 지문이 바뀌었으므로 새 빌드를 함께 낸다(`deploy-app` skill).
