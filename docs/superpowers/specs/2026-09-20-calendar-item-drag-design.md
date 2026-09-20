# 달력 — 개인 일정도 끌어 옮기고, 칸 어디를 눌러도 집힌다

## 문제

### 1. 개인 일정은 달력에서 손댈 수 없다

달력 탭에서 내 휴가는 칩을 길게 눌러 다른 날짜로 끌어 옮길 수 있고, 움직이지 않고
1초를 더 누르고 있으면 수정·삭제 메뉴가 열린다
(`components/calendar-drag/`, `screens/calendar/use-leave-drag.ts`).

개인 일정에는 그런 조작이 없다. 칸에 제목 알약이 그려지기만 하고, 옮기거나 지우려면
날짜를 눌러 시트를 열고 → 일정을 눌러 폼으로 들어가야 한다. 같은 달력 위의 같은
성격의 항목인데 조작 방법이 다르다.

### 2. 날짜 선택 터치와 칩 길게 누르기가 겹친다

길게 누르기 인식기가 **재원 칩에만** 붙어 있다(`useLeaveChipDrag` → `MyLeaveChip`).
칩은 높이 11px 알약이고 날짜 칸은 92px다. 휴대폰에서 칩을 정확히 짚기 어려워, 조금만
빗나가면 길게 눌러도 드래그가 시작되지 않고 손을 떼는 순간 **날짜가 선택되어 버린다.**
휴가를 옮기려던 조작이 매번 시트를 여는 조작이 된다.

날짜 선택은 **언제나 짧은 탭**이다. 즉 "길게 눌렀다"는 신호는 날짜 선택과 겹칠 이유가
없고, 칸 어디에서 났든 그 날의 일정을 집으려는 뜻으로 읽어도 된다.

## 결정된 요구사항

브레인스토밍에서 확정한 것:

- 개인 일정도 휴가와 **같은 조작**을 갖는다 — 끌어서 옮기기, 1초 유지 시 수정·삭제.
- 칸 어디를 길게 눌러도 그 날의 일정이 집힌다. 한 칸에 휴가와 개인 일정이 함께 있으면
  **손가락에 더 가까운 쪽**이 집힌다.
- 하루에 개인 일정이 여럿이면 **칸에 제목이 보이는 첫 일정**을 집는다.
- 250ms~1초 사이에 움직이지 않고 손을 떼면 **날짜 선택으로 되돌린다.**
- 범위는 네이티브 달력 탭뿐이다. `apps/web`의 달력(드래그 없음)과 부대 일정(칸에 알약이
  없고 관리자 전용)은 건드리지 않는다.

## 설계

### 1. 무엇을 집었는가 — 제스처가 칩에서 칸으로 올라간다

길게 누르기를 `MyLeaveChip`이 아니라 **날짜 칸 자체**가 받는다.

```
┌──────────────┐  ← 이 뷰가 250ms 길게 누르기를 받는다
│      15      │
│  [ 연가 ]    │  ← onLayout으로 칸 안 y·height를 기록
│  [ 면회 ]    │  ← onLayout으로 칸 안 y·height를 기록
│  [ 여유 20% ]│
└──────────────┘
```

RNGH의 `TouchData`는 `absoluteX/absoluteY`와 함께 **제스처가 붙은 뷰 기준의 `x`/`y`** 를
준다. 칩과 알약은 칸 `Pressable`의 직계 자식이라 `onLayout`의 `layout.y`가 같은 기준계다.
그래서 `measure()` 호출 없이 손가락 y와 각 항목의 세로 구간을 비교해 가까운 쪽을 고를 수
있다. 알약 위를 직접 누르면 거리가 0이라 자연히 그것이 이긴다.

판정은 숫자 몇 개에서 나오는 순수 함수라 따로 떼어 둔다 — `apps/native/test`는 node
환경이라 react-native를 불러올 수 없고, 이 규칙이야말로 경계마다 테스트가 필요하다
(`month-cell-index.ts`를 떼어 둔 것과 같은 이유).

```ts
// components/calendar-drag/grab-target.ts (새 파일)

/** 칸 안에서 항목이 차지한 세로 구간. onLayout의 layout에서 그대로 온다. */
export type GrabRect = { y: number; height: number };

export type GrabCandidate<T> = { subject: T; rect: GrabRect | null };

/**
 * 손가락에 가장 가까운 후보. 구간 안이면 거리 0이고, 밖이면 가까운 모서리까지의
 * 거리다. 같으면 앞선 후보(= 칸에서 위에 그려진 것)가 이긴다.
 *
 * rect가 아직 없는 후보는 건너뛴다 — 다만 **전부** 없으면 첫 후보를 돌려준다.
 * 레이아웃이 도착하기 전에 누른 첫 손가락이 아무것도 집지 못하는 쪽보다 낫다.
 */
export function nearestGrabTarget<T>(
  touchY: number,
  candidates: readonly GrabCandidate<T>[],
): T | null;
```

후보는 **집을 수 있는 것만** 넣는다 — 내 휴가는 `isUserEditableLeaveStatus(status)`일 때만,
개인 일정은 그 칸 목록의 첫 항목만.

`useLeaveChipDrag` → `useDayCellDrag`로 옮기고, `onStart`에서 `pointer.touch.y`와 ref에
모인 사각형들로 `nearestGrabTarget`을 불러 `context.begin(subject, date, touch)`에 넘긴다.
인라인 콜백이 Worklets 변환을 거치며 클로저 값을 복사하는 문제(같은 객체를 공유해야
`onTouchesDown`이 기록한 손가락을 `onStart`에서 읽을 수 있다)는 지금 구조를 그대로 지킨다.

### 2. 제스처는 집을 것이 있는 칸에만 붙는다

빈 칸까지 `GestureDetector`를 달면 마운트된 6개월 × 42칸 = 250여 개의 네이티브 인식기가
생긴다. 휴가(편집 가능 상태)나 개인 일정이 있는 칸에만 붙인다.

이 판정은 **저장된 데이터로만** 한다. 드래그 덧그림(`dragPreview`)을 섞으면 끌고 가는
도중에 목적지 칸이 "집을 것 있음"으로 바뀌며 트리 모양이 달라져 `Pressable`이 리마운트된다.

칸이 훅과 ref를 갖게 되므로 `month-calendar.tsx`(858줄)의 인라인 칸 JSX를 `DayCell`
컴포넌트로 떼어낸다. 달별 `memo` 경계(`MonthCalendar`)는 그대로 둔다.

칩·알약은 그리기 전담이 된다. 칩이 제 `GestureDetector` 때문에 칸의 눌림을 삼켜서 달아
둔 안쪽 `Pressable`("죽은 영역" 주석)은 함께 사라진다.

### 3. 짧은 탭과 긴 누름을 가르는 선

| 누른 시간       | 지금                       | 바뀐 뒤       |
| --------------- | -------------------------- | ------------- |
| ~250ms          | 날짜 선택                  | 그대로        |
| 250ms~1초 뒤 뗌 | (칩 위였다면) 아무 일 없음 | **날짜 선택** |
| 1초 유지        | 수정·삭제 메뉴             | 그대로        |
| 끌어서 놓음     | 이동                       | 그대로        |

가운데 줄이 새로 더하는 것이다. 칸 전체가 길게 누르기를 받으면 "조금 느리게 눌렀는데
아무 일도 일어나지 않는" 칸이 생기는데, 그건 고장으로 읽힌다.

`isDragPressSuppressed()`가 손 뗀 직후의 `onPress`를 이미 먹고 있으므로, 억제를 푸는
방식으로 되돌리지 않는다. 그건 "제스처가 활성화된 뒤에도 RN Pressable이 onPress를
쏘는가"라는 플랫폼 의존 동작에 기대게 된다. 대신 드래그 상태로 **명시적으로** 알린다 —
`release()`가 `"cancel"`일 때 atom을 `null`로 지우는 대신 `phase: "tapped"`로 두고,
화면 훅이 그걸 보고 `onSelectDate(grabDate)`를 부른 뒤 지운다. `dropped`·`editing`을
다루는 방식과 같다.

### 4. 드래그 상태의 일반화 — `state/calendar-drag.ts`

```ts
/** 달력에서 끌 수 있는 것. 세션·격자·두 손가락 스크롤은 이게 무엇인지 모른다. */
export type CalendarDragSubject =
  | { kind: "leave"; leaveId: string }
  | { kind: "personalEvent"; eventId: string };

export type CalendarDragPhase =
  | "dragging"
  | "editing"
  | "dropped"
  | "saving"
  /** 움직이지 않고 1초 전에 손을 뗐다. 화면이 날짜 선택으로 되돌린다. */
  | "tapped";
```

`LeaveDrag`는 `CalendarDrag`로, `LeaveDragPhase`는 `CalendarDragPhase`로 이름을 바꾸고
`leaveId` 자리에 `subject`를 넣는다. `grabDate`/`hoverDate`/`deltaDays`/`hasMoved`/`phase`는
그대로다. `CalendarDragSession`도 생성자 첫 인자 말고는 손대지 않는다 —
격자 계산·월 이어붙임 보정(`rebase`)·두 번째 손가락 스크롤은 끌고 있는 것이 무엇인지
알 필요가 없는 코드다.

`LeaveDragVerdict`(`ok`/`merge`/`conflict`)는 휴가만의 개념이라 그대로 둔다. 개인 일정은
서버에 겹침 제약이 없어(`apps/api/src/routes/personal-events.ts`) 늘 `ok`다.

**미리보기 atom은 둘로 나눈다.**

```ts
export const calendarDragPreviewAtom: Atom<Map<ISODate, LeaveDragDay> | null>;
export const personalEventDragPreviewAtom: Atom<Map<
  ISODate,
  PersonalEventDragDay
> | null>;
```

하나로 묶으면 개인 일정을 끄는 동안 hover가 바뀔 때마다 재원 칩까지 모든 칸에서 다시
그려진다. `sliceMonthPreview`로 달별로 좁혀 `memo`를 살리는 기존 규칙은 양쪽 모두 쓴다 —
`useMonthDragPreview(month)` 옆에 `useMonthPersonalDragPreview(month)`를 두고,
`MonthBlock`(`calendar-scroll.tsx`)이 둘 다 좁혀 `MonthCalendar`에 넘긴다.

```ts
export type PersonalEventDragDay = {
  event: PersonalEvent;
  role: "origin" | "target";
  phase: CalendarDragPhase;
};
```

### 5. 개인 일정 알약의 덧그림

휴가 칩과 같은 규칙이다 — 출발 자리는 흐리게(`origin`), 도착 자리는 강조(`target`),
두 자리가 겹치면 도착이 이긴다.

칸의 알약은 `personalEventCellLabel(events)`로 "첫 제목 + 나머지 개수"를 그린다. 그래서:

- **도착 칸**: 끌고 있는 일정을 목록 **맨 앞에** 끼워 그 제목이 보이게 한다.
- **출발 칸**: 저장된 목록을 그대로 두고(그 일정이 아직 들어 있다) 알약을 흐리게 그린다.

하루에 일정이 여럿인 출발 칸은 알약 하나가 통째로 흐려진다. 알약은 한 줄뿐이고 칸 높이
예산에 여유가 없어 둘로 쪼갤 수 없다 — 드문 경우라 그대로 두고 주석으로 남긴다.

### 6. 놓았을 때 / 1초 눌렀을 때 — `screens/calendar/use-calendar-item-drag.ts`

`use-leave-drag.ts`를 이 이름으로 옮기고 개인 일정 분기를 더한다. 휴가 분기(겹침 판정,
확정 휴가 확인, 정기외박 주기 재선택, 오프라인 차단)는 지금 코드 그대로다.

끌고 있는 개인 일정 객체는 `usePersonalEvents(drag.grabDate.slice(0, 7))`로 찾는다.
`MonthBlock`이 이미 같은 키로 채워 둔 캐시라 추가 요청이 나가지 않는다. 시작일이 앞 달인
일정도 그 달 응답에 들어 있다(서버가 겹치는 일정을 모두 준다).

- **이동**: `startDate`/`endDate`를 `deltaDays`만큼 민다. 기간 길이와 시간은 보존한다.
  `useUpdatePersonalEvent`. `deltaDays === 0`이면 아무것도 하지 않는다.
- **`editing`**: `chooseHoldAction(event.title, "개인 일정 작업을 선택하세요.")` →
  `수정`이면 개인 일정 폼으로, `삭제`면 확인 후 `useDeletePersonalEvent`.
- **`tapped`**: `onSelectDate(drag.grabDate)`.

날짜 밀기는 순수 함수로 떼어 테스트한다 — `packages/shared/src/dates.ts`에 `addDays` 옆으로:

```ts
export function shiftDateRange(
  range: { startDate: ISODate; endDate: ISODate },
  days: number,
): { startDate: ISODate; endDate: ISODate };
```

머리말 안내(`statusLabel`)에 제목을 넣는다 — `면회 · 3월 15일로 옮기기`. 하루에 일정이
여럿일 때 무엇이 움직이는지 알 수 있는 유일한 단서다. 휴가 쪽 문구는 그대로 둔다.

### 7. 수정 이동은 기존 모달 규칙을 그대로 탄다 — `screens/calendar/index.tsx`

iOS는 한 화면에 모달을 하나만 띄운다. 좁은 창에서 날짜 시트가 떠 있으면 먼저 닫고 다
닫힌 뒤에 밀어야 한다(`openAfterSheet`). 개인 일정 수정도 예외가 아니다.
`CalendarIntent`의 `personalEvent` 갈래에 기존 일정을 여는 경우를 더한다:

```ts
type CalendarIntent =
  | { kind: "form"; date: ISODate }
  | { kind: "leave"; leaveId: string }
  | { kind: "personalEvent"; date: ISODate }
  | { kind: "personalEventEdit"; eventId: string; month: string }
  | { kind: "unitEvent"; date: ISODate };
```

`useCalendarItemDrag`는 `onEditLeave`(지금의 `setEditingLeave`)와 나란히
`onEditPersonalEvent`, `onSelectDate`를 받는다. 앞의 둘은 화면이 `openAfterSheet`로 감싸
넘긴다.

### 8. 편집 메뉴 문구 — `lib/dialog.ts` / `dialog.native.ts`

`chooseLeaveHoldAction(title)` → `chooseHoldAction(title, message)`. 반환 타입
`LeaveHoldAction`은 `HoldAction`으로 이름만 바꾼다.

안드로이드가 버튼 배열의 **끝을 pop해** 확인 자리(오른쪽·강조)에 놓기 때문에 그대로 쓰면
삭제가 습관적으로 누르는 자리에 온다 — 그래서 플랫폼별로 순서를 뒤집어 둔 기존 규칙은
그대로 지킨다. 웹 구현(`prompt`)도 메시지만 인자로 받게 바꾼다.

## 테스트

`pnpm test`(`apps/native/test`)는 node 환경이라 react-native를 불러올 수 없다. 순수 부분만
본다.

- **`grab-target.test.ts` (새 파일)** — 칩 위, 알약 위, 둘 사이, 날짜 숫자 위(위쪽 빈 자리),
  칸 아래 빈 자리에서 각각 무엇이 잡히는지. 후보가 하나뿐일 때. 거리가 같을 때 위쪽이
  이기는지. rect가 아직 없을 때 첫 후보로 떨어지는지.
- **`calendar-drag-session.test.ts`** — `leaveId` → `subject`로 바뀐 세션(기존 테스트 갱신).
- **`calendar-drag-gesture.test.mjs`** — 실제 Expo Worklets 변환을 돌려 인라인 콜백의 클로저
  회귀를 잡는 기존 테스트. 대상 파일 경로가 바뀌므로 갱신하고, **개인 일정만 있는 칸에서도
  제스처가 켜지는지**와 **`onStart`가 `onTouchesDown`이 기록한 손가락의 `y`를 읽는지**를
  더한다.
- **`packages/shared/test/dates.test.ts`** — `shiftDateRange`(음수·월 경계).

터치 판정 자체는 단위 테스트로 잡히지 않는다. `agent-browser`로 `pnpm dev:web`(Expo Web)
렌더를 확인하고, 실제 기기 검증은 사용자에게 요청한다.

## 손대는 파일

```
packages/shared/src/dates.ts          shiftDateRange
apps/native/src/
  state/calendar-drag.ts              subject 유니온, tapped, 개인 일정 미리보기 atom
  components/calendar-drag/
    grab-target.ts                    (새로) 가까운 항목 고르기 — 순수
    context.ts                        begin(subject, …)
    session.ts                        leaveId → subject
    use-leave-chip-drag.ts            → use-day-cell-drag.ts
    use-calendar-drag.ts              begin 시그니처, cancel → tapped
  components/month-calendar.tsx       DayCell 분리, onLayout 등록, 알약 덧그림
  components/calendar-scroll.tsx      개인 일정 미리보기 슬라이스 전달
  screens/calendar/use-leave-drag.ts  → use-calendar-item-drag.ts
  screens/calendar/index.tsx          개인 일정 수정 의도 배선
  lib/dialog.ts, lib/dialog.native.ts chooseHoldAction(title, message)
```

## 하지 않는 것

- `apps/web`의 달력. 별도 구현이고 드래그가 없다.
- 부대 일정의 드래그. 칸에 알약이 없고 관리자 전용이다.
- 개인 일정의 겹침·병합 판정. 서버에 그런 제약이 없다.
- 캐시 버스터(`CACHE_BUSTER`) 범프. 응답 모양이 바뀌지 않는다.

## 알려진 위험

칸 전체가 길게 누르기를 받으면, 스크롤하려고 손가락을 얹었다가 250ms 머뭇거린 순간
휴가를 집을 수 있다. 지금은 11px 칩 위에서만 나던 일이 칸 전체로 넓어진다. 임계값
250ms는 유지하되 기기에서 확인하고, 잦으면 올리는 쪽으로 조정한다.
