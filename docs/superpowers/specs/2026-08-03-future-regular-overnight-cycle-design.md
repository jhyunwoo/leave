# 미래 정기외박 주기 미리 쓰기

## 문제

다음 정기외박 주기 날짜로 휴가를 등록하려 하면 폼이 "정기외박를 N일 초과했어요"를
띄우고 등록 버튼을 막는다. 아직 도래하지 않았을 뿐 그 주기에는 반드시 몫이 들어오므로
미리 잡을 수 있어야 한다.

### 원인

서버는 이미 주기별로 검증한다. `apps/api/src/lib/leave-balances.ts`의
`assertRegularOvernightAvailable`은 오늘이 아니라 *요청한 날짜가 속한 주기*의 몫과
비교하고, `apps/api/test/leaves.test.mjs`의 "지난 주기 몫은 그 주기 날짜로 쓸 수 있어야 함"이
이를 확인한다. 미래 주기도 같은 경로라 서버는 이미 통과시킨다.

막는 쪽은 폼이다. `apps/native/src/components/leave-form-modal.tsx`와
`apps/web/src/components/LeaveFormModal.tsx`는 `/leaves/balances`가 주는 스칼라
`remainingDays` 하나만 본다. 정기외박의 그 값은 서버가 `cycleFor(config, today)` —
**이번 주기** 잔여로 채우므로, 미래 주기 날짜를 골라도 이번 주기 잔여(보통 0)와 비교돼
`overused`에 걸리고 `canSubmit`이 false가 된다.

폼은 이미 필요한 재료를 모두 갖고 있다 — `useLeaveBalances().regularOvernight`(주기 설정),
`useMyLeaves()`(내 전체 휴가와 구간, 서버가 필터 없이 전부 준다), `useMe().dischargeAt`.
따라서 API 스키마 변경 없이 고칠 수 있고, 구버전 앱도 그대로 동작한다.

## 설계

### 1. 공용 주기 검증 함수 — `packages/shared/src/regular-overnight.ts`

서버가 `assertRegularOvernightAvailable` 안에 갖고 있던 규칙을 순수 함수로 끌어내
앱·웹·서버가 같은 것을 쓴다. 여기에 전역일 상한을 새로 넣는다.

```ts
export type RegularOvernightBlock =
  | { kind: "before_first_grant"; firstGrantDate: ISODate }
  | { kind: "after_discharge"; cycle: RegularOvernightCycle }
  | { kind: "over_cycle"; cycle: RegularOvernightCycle; usedDays: number };

/** 막을 이유가 있으면 그 이유를, 없으면 null. 첫 번째 이유만 돌려준다. */
export function checkRegularOvernight(input: {
  config: RegularOvernightConfig | null | undefined;
  existing: readonly SegmentLike[];
  requested: readonly SegmentLike[];
  dischargeAt: ISODate;
}): RegularOvernightBlock | null;

/** 세 화면이 같은 문구를 쓰도록 메시지도 여기서 만든다. */
export function regularOvernightBlockMessage(
  block: RegularOvernightBlock,
): string;

/**
 * [from, to]가 걸친 주기 기준 잔여(여러 주기면 가장 빡빡한 쪽). 재원 칩 숫자용.
 * 쓸 수 있는 주기가 없으면(설정 꺼짐·첫 적립 전·전역 후) 0.
 */
export function regularOvernightAvailableIn(input: {
  config: RegularOvernightConfig | null | undefined;
  used: readonly SegmentLike[];
  dischargeAt: ISODate;
  from: ISODate;
  to: ISODate;
}): number;
```

검사 순서와 규칙:

1. `existing`은 이미 저장된 구간, `requested`는 이번에 넣으려는 구간이다. 수정이면
   호출하는 쪽이 그 휴가의 구간을 `existing`에서 빼서 넘긴다(자기 자신과 부딪히지 않도록).
2. 설정이 꺼져 있으면 주기 개념이 없으므로 항상 `null`(= 막지 않음). 이때 정기외박은
   적립분 모델로 따로 검사된다.
3. 요청 구간에 첫 적립 전 날짜가 있으면 `before_first_grant`.
4. 요청 구간이 걸친 주기 중 `cycle.start > dischargeAt`인 것이 있으면 `after_discharge`.
   적립일이 전역 뒤라 그 몫을 애초에 받지 못한다.
5. `existing + requested`를 주기별로 합산해 `usedDays > cycle.grantDays`인 주기가 있으면
   `over_cycle`. 요청이 건드리지 않은 주기는 검사하지 않는다(이미 어긋나 있는 과거를
   새 등록의 이유로 삼지 않는다 — 현재 서버 동작과 같다).

**전역일 상한이 이 설계의 유일한 새 규칙이다.** `apps/api/src/lib/leave-grants.ts`의
`buildCycleList`가 "보유 휴가" 화면에서 주기를 전역일까지만 세는 것과 같은 기준이라,
앞으로 받을 몫으로 화면에 보여준 주기가 곧 미리 쓸 수 있는 주기가 된다.

### 2. 서버 — `apps/api/src/lib/leave-balances.ts`

`assertRegularOvernightAvailable`은 저장된 구간을 모아 `checkRegularOvernight`에 넘기고
결과가 있으면 `regularOvernightBlockMessage`를 던지는 얇은 껍데기가 된다. 미래 주기 허용은
이미 동작하므로 실제 동작 변경은 전역 후 주기 차단 하나뿐이다.

`assertSegmentsAvailable`은 `user`에서 `dischargeAt`을 읽어야 하므로 파라미터 타입에
`dischargeAt: string`을 더한다. 호출하는 두 곳(`apps/api/src/routes/leaves.ts`,
`apps/admin/worker/routes/leaves-content.ts`)은 이미 전체 사용자 행을 넘기므로 그대로 컴파일된다.

#### 곁가지: dischargeAt 정규화

주기 계산에 쓰는 `dischargeAt`은 DB 원본이 아니라 `normalizeLegacyDischargeDate`를 거친
값으로 통일한다. 폼은 `/auth/me`에서 정규화된 값을 받으므로(`apps/api/src/lib/serialize.ts`),
맞추지 않으면 구버전 가입자 한정으로 폼과 서버의 상한이 하루 어긋난다. 같은 이유로
`getLeaveBalanceSummary`와 `buildGrantsPage`가 `regularOvernightSummary`에 넘기는
`user.dischargeAt`도 정규화한다.

이건 요청 범위 밖의 수정이다. 하지 않으면 "보유 휴가에는 앞으로 받을 몫으로 잡히는데
등록은 막히는" 경계 케이스가 남아서 포함한다.

### 3. 폼 — 앱·웹 두 모달

두 모달이 같은 구조라 같은 변경을 대칭으로 넣는다.

- `useMyLeaves()`와 `useMe()`를 추가로 읽는다. 수정 중이면 `editing.id`인 휴가는 빼고
  나머지 구간을 `existing`으로 삼는다.
- `overused` 스칼라 검사에서 `regular_overnight`을 제외한다(주기 설정이 켜져 있을 때만).
  대신 `checkRegularOvernight` 결과를 별도 블로커로 두고 `canSubmit` 조건에 넣는다.
- 오류 문구는 `regularOvernightBlockMessage`를 그대로 쓴다 — 서버와 같은 문장이 된다.
  예: `정기외박 3주기(08-15~09-25) 몫 3일을 1일 초과했어요`.
- 재원 칩 숫자는 전역 `availableByKey` 하나가 아니라 **구간 행마다** 계산한다. 그 행의
  날짜가 속한 주기 기준 잔여를 쓰고, 여러 주기에 걸치면 최솟값을 쓴다. 그래야
  "칩 숫자 ≥ 0"과 "오류 없음"이 항상 일치한다. 다른 재원의 숫자는 지금대로 스칼라를 쓴다.
- `useMyLeaves()`가 아직 로딩 중이면 `existing`이 비어 폼이 낙관적으로 동작한다.
  서버가 최종 관문이므로 그대로 둔다.

관리자 폼(`apps/admin/src/components/RecordForm.tsx`)은 잔여 검사를 하지 않아 손대지 않는다.

### 4. 테스트

- `packages/shared/test/regular-overnight.test.ts`
  - 미래 주기 날짜는 그 주기 몫 안에서 허용된다.
  - 미래 주기 몫을 넘기면 `over_cycle`.
  - 첫 적립 전이면 `before_first_grant`.
  - 적립일이 전역 뒤인 주기는 `after_discharge`.
  - 설정이 꺼져 있으면 항상 `null`.
  - `regularOvernightAvailableIn`이 주기 밖에서 0, 주기 안에서 잔여를, 초과 상태에서 음수를 준다.
- `apps/api/test/leaves.test.mjs` — 기존 "해군·공군 정기외박은 주기 안에서만 쓰이고
  이월되지 않는다" 테스트에 이어서:
  - 미래 주기 날짜로 등록이 201로 성공한다.
  - 같은 미래 주기에 몫을 넘기면 400.
  - 적립일이 전역 뒤인 주기 날짜는 400.

## 하지 않는 것

- API 응답 스키마 변경. 폼이 이미 가진 데이터로 충분하고, 스키마를 바꾸면 앱 빌드와
  서버 배포 순서가 묶인다.
- 휴가 날짜 자체의 전역일 제한. 지금도 없고, 이번 변경은 정기외박 재원에만 해당한다.
- 관리자 폼에 잔여 검사 추가.
