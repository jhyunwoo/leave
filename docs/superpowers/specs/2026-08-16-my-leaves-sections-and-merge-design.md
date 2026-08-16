# 내 휴가 — 다가오는/지난 섹션 분리와 붙은 휴가 자동 병합

## 문제

### 1. 목록이 한 덩어리다

`내 휴가`는 서버가 준 순서(`startDate desc`) 그대로 한 목록에 전부 쌓는다. 다음 주에
나갈 휴가와 반년 전에 다녀온 휴가가 같은 무게로 섞여 있어, 계획을 확인하려면 지나간
것들을 눈으로 걸러야 한다.

`apps/web/src/pages/LeavesPage.tsx`와 `apps/native/src/screens/leaves.tsx`는 파일 상단
주석에 이미 "다가오는 일정과 지난 일정을 나누고"라고 적혀 있지만 코드는 그렇게 하지
않는다. 주석이 약속만 하고 구현이 없는 상태다.

### 2. 이어지는 휴가가 여러 건으로 쪼개진다

2월 3일~5일 휴가를 만든 뒤 2월 6일~9일 휴가를 따로 만들면 목록에 두 건으로 남는다.
실제로는 2월 3일부터 9일까지 한 번 나갔다 오는 일정이다. 달력에서도, 목록에서도,
상세에서도 한 일정이 둘로 보인다.

데이터 모델은 이미 이것을 표현할 수 있다. 휴가 한 건은 여러 **구간**을 갖고("2/3~2/5는
연가, 2/6~2/9는 정기외박"), 스키마(`leaveCreateSchema`)가 구간들이 빈틈도 겹침도 없이
이어질 것을 강제한다. 즉 붙어 있는 두 휴가를 합치는 일은 새 모델을 만드는 게 아니라
구간을 이어 붙이는 일이다.

## 결정된 요구사항

브레인스토밍에서 확정한 것:

- 병합은 **화면 표시가 아니라 저장 시점에 서버에서 실제로** 일어난다.
- **붙은 경우만** 병합한다. **겹치면 오류**로 막는다.
- **같은 상태끼리만** 병합한다(초안은 초안끼리, 희망은 희망끼리).
- 제목은 **직접 지은 이름을 우선**한다.
- **이미 저장된 데이터는 손대지 않는다.** 마이그레이션 없이 앞으로 저장하는 것부터
  적용한다.
- 섹션 분리는 **네이티브와 웹 둘 다** 적용한다.

## 설계

### 1. 병합 규칙 — `packages/shared/src/leave-merge.ts` (새 파일)

DB를 모르는 순수 함수가 규칙 전부를 소유한다. 서버가 유일한 호출자지만, 경계 조건이
많은 규칙이라 vitest 단위 테스트로 전부 덮을 수 있는 자리에 둔다.

```ts
/** 병합 판정에 필요한 만큼의 휴가 한 건. 라우트가 DB 행에서 만들어 넘긴다. */
export type MergeCandidate = {
  id: string;
  title: string;
  reason: string | null;
  status: LeaveStatus;
  createdAt: string;
  segments: LeaveSegment[];
};

export type LeaveMergePlan =
  /** 기간이 겹치는 같은 상태의 휴가가 있다. 라우트가 400으로 돌려준다. */
  | { kind: "conflict"; conflictWith: MergeCandidate; overlapStart: ISODate }
  /** 합칠 이웃이 없다. 지금과 똑같이 저장한다. */
  | { kind: "alone" }
  /** 이웃을 흡수한다. */
  | {
      kind: "merged";
      /** 살아남는 행의 id. incoming.id일 수도, 이웃의 id일 수도 있다. */
      hostId: string;
      createdAt: string;
      title: string;
      reason: string | null;
      segments: LeaveSegment[];
      /** 삭제할 휴가 id들. hostId는 포함하지 않는다. */
      absorbedIds: string[];
    };

export function planLeaveMerge(
  incoming: MergeCandidate,
  others: readonly MergeCandidate[],
): LeaveMergePlan;
```

`incoming.id`는 등록(POST)일 때 새로 발급한 UUID, 수정(PATCH)일 때 대상 휴가의 id다.
`others`에는 `incoming.id`와 같은 id가 들어오지 않는다.

#### 이웃 판정

`others` 중 **`status`가 `incoming`과 같은 것만** 본다. 상태가 다르면 붙어 있든 겹치든
건드리지 않는다 — 지금 동작 그대로다.

같은 상태인 것들에 대해:

| 관계 | 판정 |
| --- | --- |
| `이웃.endDate + 1일 === incoming.startDate` | 병합 대상 |
| `incoming.endDate + 1일 === 이웃.startDate` | 병합 대상 |
| 하루라도 겹침 (`rangesOverlap`) | `conflict` |
| 그 외 | 무시 |

`conflict`는 병합보다 먼저 판정한다. 겹치는 게 하나라도 있으면 다른 이웃과의 병합
가능성을 따지지 않고 즉시 `conflict`를 돌려준다. 겹침을 알리는 게 먼저다.

#### 연쇄 병합

이웃을 흡수하면 기간이 늘어나고, 늘어난 기간에 또 다른 휴가가 붙을 수 있다. 이 규칙이
처음부터 있었다면 그런 상태가 저장될 수 없지만, **기존 데이터에는 있을 수 있다.**
그래서 더 붙을 이웃이 없을 때까지 반복한다.

반복 중에 새로 겹침이 드러나면 `conflict`가 아니라 **그 이웃을 흡수하지 않고 넘어간다**.
기존 데이터 때문에 사용자가 자기 휴가를 고치지 못하게 되면 안 된다.

#### 구간 합치기

흡수 대상 전부의 구간을 모아 시작일 순으로 정렬한 뒤:

1. 앞 구간의 끝 다음 날에 뒤 구간이 시작하는지 확인한다. 빈틈이나 겹침이 있으면 **병합을
   포기하고 `alone`을 돌려준다**(기존 데이터 방어).
2. **재원 키(`segmentBalanceKey`)가 같은 구간이 연달아 오면 하나로 합친다.** 시작일은
   앞 구간, 종료일은 뒤 구간, `days`는 `inclusiveDays`로 다시 센다.
3. 합친 결과가 30구간을 넘으면 **병합을 포기하고 `alone`을 돌려준다**
   (`leaveCreateSchema`의 `.max(30)`).

**재원이 다르면 절대 합치지 않는다.** 이것이 이 설계의 핵심 보존 조건이다.

```
연가 2/3~2/5 (3일)  +  정기외박 2/6~2/9 (4일)
  → 휴가 1건, 기간 2/3~2/9, 구간 2개
     [연가 2/3~2/5 · 3일] [정기외박 2/6~2/9 · 4일]

연가 2/3~2/5 (3일)  +  연가 2/6~2/9 (4일)
  → 휴가 1건, 기간 2/3~2/9, 구간 1개
     [연가 2/3~2/9 · 7일]
```

잔여 차감은 휴가가 아니라 구간 단위로 움직이므로(`allocateAllGrants`가 구간의 재원
키별로 적립분에 배분한다) 두 경우 모두 재원별 사용 일수가 병합 전과 같다. 상세 화면의
재원 배지(`SegmentBadges`)와 보유 휴가의 재원별 사용량도 그대로다.

#### 제목

자동 제목과 사용자가 직접 지은 이름을 가르는 규칙이 이미 있다 —
`packages/client/src/forms/use-leave-form.ts`의 `titleFromDrafts`/`isDerivedTitle`.
서버가 써야 하므로 **`packages/shared/src/leave-title.ts`로 옮긴다.** 두 함수는
`BALANCE_LABELS`와 `SegmentDraft`(둘 다 이미 `@leave/shared`)에만 의존하는 순수 함수라
client에 있을 이유가 없다.

- 호출처는 `apps/native/src/components/leave-form-modal.tsx` 한 곳뿐이다. import를
  `@leave/client`에서 `@leave/shared`로 바꾼다.
- `packages/client/test/leave-title.test.ts`를 `packages/shared/test/`로 옮긴다.
- 구간에서 바로 제목을 짓도록 `titleFromSegments(segments)`를 함께 둔다. 자동 제목은
  첫 구간의 재원 키만 보므로 `titleFromDrafts`와 같은 결과를 낸다.

병합 시 제목 선택:

1. 직접 지은 이름(`!isDerivedTitle`)이 **하나**면 그것을 쓴다.
2. **여럿**이면 시작일이 가장 이른 휴가의 제목을 쓴다.
3. **하나도 없으면**(전부 자동 제목) 합쳐진 구간으로 `titleFromSegments`를 다시 돌린다.
   연가 뒤에 정기외박이 붙으면 "연가 계획"이 유지되고, 정기외박 뒤에 연가가 붙으면
   "정기외박 계획"이 된다 — 첫 구간이 제목을 정한다는 기존 규칙과 같다.

#### 사유

시작일 순으로 이어 붙인다. `null`·빈 문자열은 건너뛰고, 같은 문구는 한 번만 넣고,
남은 것을 줄바꿈(`\n`)으로 잇는다. 결과가 500자를 넘으면 500자에서 자른다
(`leaveCreateSchema`의 `.max(500)`). 남는 게 없으면 `null`.

#### 살아남는 행

**합쳐진 기간의 시작일이 가장 이른 휴가**의 `id`와 `createdAt`을 유지한다. 새 휴가를
기존 휴가 뒤에 붙이는 가장 흔한 경우, 기존 휴가의 상세 링크가 그대로 살아 있다.
`status`는 전부 같으므로 그대로다.

### 2. 서버 반영 — `apps/api/src/lib/leave-merge.ts` (새 파일)

`routes/leaves.ts`의 POST·PATCH가 각각 이 헬퍼 하나를 부른다.

헬퍼 안에만 있는 조회 함수:

```ts
async function loadMergeCandidates(
  db: Db,
  userId: string,
  input: { excludeLeaveId?: string; status: LeaveStatus },
): Promise<MergeCandidate[]>;
```

`status`가 같은 내 휴가를 구간과 함께 읽는다. 날짜로 좁히지 않는다 — 연쇄 병합은
흡수할 때마다 기간이 늘어나므로, `[startDate - 1일, endDate + 1일]` 창으로 좁히면 창
밖의 이웃이 애초에 안 읽혀 한 홉에서 멈춘다. 한 사용자의 휴가는 수십 건 규모라
상태로만 좁혀도 충분히 싸다.

라우트의 순서:

1. 스키마 검증(지금 그대로) → `toSegments(input)` → `segmentsRange`
2. `loadMergeCandidates`
3. `planLeaveMerge`
4. `kind === "conflict"` → `400`, `"2월 5일은 이미 등록한 휴가와 겹칩니다"`
   (`overlapStart`를 `fmtDateShort`로 찍는다)
5. `assertSegmentsAvailable(db, user, 합쳐진 구간, [incoming.id, ...absorbedIds])`
6. `db.batch`로 한 번에:
   - 흡수될 휴가의 구간 삭제 → 휴가 행 삭제
   - 살아남는 행 upsert(POST에서 host가 이웃이면 update, host가 새 휴가면 insert)
   - 살아남는 행의 구간 교체
7. `bumpUnitVersion(c.env.CACHE, user.unitId)`
8. `checkOverageAndNotify`를 **합쳐진 휴가 전체 기간**으로 부른다

#### `assertSegmentsAvailable` 시그니처 변경

지금은 제외할 휴가를 하나만 받는다:

```ts
assertSegmentsAvailable(db, user, segments, replacingLeaveId?: string)
```

병합에서는 흡수될 이웃들의 구간이 **이미 DB에 있다.** 그대로 두면 같은 날을 두 번 세고
"잔여가 부족합니다"로 잘못 막는다. 여러 개를 제외할 수 있어야 한다:

```ts
assertSegmentsAvailable(db, user, segments, replacingLeaveIds?: string[])
```

`apps/api/src/lib/leave-balances.ts` 안에서 `ne(leaveSegments.leaveId, ...)`를
`notInArray(leaveSegments.leaveId, ...)`로 바꾼다 — `userSegmentsExcluding`(101줄 근처)과
`regularOvernightSegments`(88줄 근처) 두 곳. 빈 배열이면 제외 없이 전부 센다.

호출처는 `routes/leaves.ts`의 POST·PATCH 두 곳뿐이다.

#### 응답

형태(`{ leave, exceededDates }`)는 바뀌지 않는다. 다만 **`leave.id`가 요청한 id와 다를 수
있다** — 수정하던 휴가가 앞 휴가에 흡수된 경우다. 이 때문에 클라이언트에서 한 곳을 고친다:

- `apps/web/src/pages/LeaveDetailPage.tsx` — 상세 화면에서 수정해 흡수되면 URL의 휴가가
  사라진다. 저장 응답의 `leave.id`가 현재 `leaveId`와 다르면 그 id로 `navigate`한다.
- `apps/native/src/screens/leaves.tsx`의 `selectedLeaveId`는 이미
  `myLeaves.find(...) ?? null`로 사라진 선택을 비우므로 손대지 않는다.
- 알림은 저장된 `leaveId`로 이동하지 않고 날짜로 내 휴가를 다시 찾으므로
  (`apps/native/src/screens/notifications.tsx`) 흡수된 id가 링크를 깨지 않는다.

POST에서 이웃에 흡수돼도 응답 코드는 `201`을 유지한다. 사용자 입장에서 등록은 성공했다.

#### 오프라인 캐시

`apps/native/src/lib/query-persistence.ts`의 `CACHE_BUSTER`는 **범프하지 않는다.**
`/leaves/mine` 응답의 *모양*이 바뀌지 않고 행 수만 달라진다 — 기존 "휴가 삭제"와 같은
경로다.

### 3. 화면 — 다가오는/지난 분리

#### 분류·정렬은 `@leave/client`에 한 벌 — `packages/client/src/my-leaves-sections.ts` (새 파일)

```ts
export type MyLeaveSections = { upcoming: MyLeave[]; past: MyLeave[] };

export function partitionMyLeaves(
  leaves: readonly MyLeave[] | undefined,
  today: ISODate = todayInSeoul(),
): MyLeaveSections;
```

- **지난 휴가**: `endDate < today`
- **다가오는 휴가**: 나머지. **오늘 진행 중인 휴가**(시작했지만 아직 안 끝난)도 여기
  들어간다 — 아직 지나가지 않았다. 시작일이 과거라 정렬상 자연히 맨 위에 온다.
- 다가오는 정렬: 시작일 오름차순, 같으면 종료일 오름차순
- 지난 정렬: 종료일 내림차순, 같으면 시작일 내림차순

서버의 `/leaves/mine` 정렬은 그대로 둔다. 분류하는 쪽이 어차피 다시 정렬한다.

#### 웹 — `apps/web/src/pages/LeavesPage.tsx`

지금의 목록 하나를 두 섹션으로 나눈다. 각 섹션에 제목("다가오는 휴가" / "지난 휴가")과
건수를 달고, **비어 있는 섹션은 통째로 숨긴다.** 둘 다 비면 지금의 "아직 등록한 휴가가
없어요" 카드를 그대로 쓴다. 행 안쪽(제목·기간·사유·재원 배지·수정/삭제 버튼)은 손대지
않는다.

#### 네이티브 — `apps/native/src/screens/leaves.tsx`

`leaveList`를 같은 규칙으로 두 개의 `ContentPanel`로 나눈다. 패널 제목은 이미 있는
`styles.sectionTitle`("휴가 재원"에 쓰는 것)을 재사용해 톤을 맞춘다. 태블릿 3열
배치·인스펙터 선택·`ActionMenu` 동작은 그대로다.

두 화면 모두 파일 상단 주석이 이미 이 동작을 약속하고 있어, 이번 변경으로 주석과 코드가
처음으로 일치한다.

## 테스트

**단위 (vitest)**

- `packages/shared/test/leave-merge.test.ts`
  - 붙은 두 휴가가 합쳐지고, 재원이 다르면 구간 2개와 일수가 그대로 남는다
  - 같은 재원이 연달아 오면 한 구간으로 합쳐지고 일수 합이 같다
  - 겹치면 `conflict`와 겹치기 시작한 날짜를 돌려준다
  - 상태가 다르면 붙어 있어도 `alone`
  - 앞뒤 양쪽에 붙으면 셋이 하나로 합쳐진다(연쇄)
  - 제목: 직접 지은 이름 하나 / 여럿 / 전부 자동
  - 사유: 둘 다 있음 / 하나만 / 중복 / 500자 초과
  - 살아남는 id·createdAt이 시작일이 이른 쪽이다
  - 30구간을 넘으면 `alone`
  - 이어붙였을 때 빈틈이 생기면 `alone`
- `packages/shared/test/leave-title.test.ts` — 기존 client 테스트를 옮기고
  `titleFromSegments`를 추가로 덮는다
- `packages/client/test/my-leaves-sections.test.ts` — 오늘 시작·오늘 종료·진행 중 경계와
  두 섹션의 정렬

**통합 (`apps/api/test/leaves.test.mjs`)**

- 붙은 휴가를 연달아 등록하면 `/leaves/mine`이 1건을 주고 그 구간이 2개다
- 재원별 일수가 병합 전 합과 같다(`/leaves/balances`로 확인)
- 겹치는 등록은 400이고 메시지에 날짜가 있다
- 상태가 다르면(초안 + 희망) 2건으로 남는다
- 흡수된 휴가의 id로 `GET`/`PATCH` 하면 404다

## 검증

API(`pnpm --filter @leave/api exec wrangler dev --port 8787`)를 띄우고
`agent-browser`로 웹(`pnpm dev:web`, 5173)과 네이티브 web target(8081)에서 각각 확인한다:

1. 붙는 휴가 2건을 등록 → 목록에 1건, 재원 배지 2개, 기간이 전체로 늘어남
2. 다가오는 휴가가 위, 지난 휴가가 아래이고 각 섹션의 순서가 규칙대로임
3. 겹치는 등록이 날짜가 담긴 오류 문구로 막힘
4. `console`과 `errors`가 깨끗함

## 범위 밖

- **기존 데이터 마이그레이션.** 이미 저장된 붙은 휴가는 그대로 둔다. 그중 하나를 수정해
  저장하는 순간 병합된다.
- **폼에서의 병합 미리보기**("이 휴가와 합쳐집니다"). `planLeaveMerge`가 순수 함수라
  나중에 붙일 수 있지만 이번에는 하지 않는다.
- **병합 되돌리기.** 합쳐진 휴가를 다시 쪼개려면 수정 화면에서 기간을 줄이고 새 휴가를
  만들면 된다.
- **상태가 다른 휴가끼리의 겹침 차단.** 지금처럼 허용한다. 초안도 잔여를 소비하므로
  (`userSegments`에 상태 필터가 없다) 잔여가 빠듯하면 기존 잔여 검사에서 걸린다.
