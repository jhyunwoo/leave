# 달력 — 기기 캘린더 일정을 겹쳐 본다

## 문제

달력 탭은 "언제 나갈 수 있는가"에 답하는 화면이다. 내 휴가, 그룹 출타율, 부대 일정,
개인 일정이 한 칸에 모여 있어서 날짜를 고르기 전에 그날의 사정을 다 읽을 수 있다.

그런데 **사용자의 사정 대부분은 리브 바깥에 있다.** 학교 시험, 가족 행사, 면접, 동아리
일정은 전부 아이폰 기본 캘린더나 구글 캘린더에 들어 있다. 지금은 휴가를 잡을 때
앱 두 개를 번갈아 보며 머릿속에서 겹쳐야 한다. 리브가 "그날 뭔가 있다"를 모르니
달력은 반쪽짜리 답만 준다.

같은 것을 리브 개인 일정으로 **다시 적으라고** 요구할 수는 없다. 이미 적어 둔 것을
옮겨 적는 일은 아무도 하지 않고, 두 벌이 되는 순간 어느 쪽이 맞는지 알 수 없다.

## 결정된 요구사항

브레인스토밍에서 확정한 것:

- **보기 전용 겹쳐보기다.** 기기 캘린더를 읽어 달력 탭에 그리기만 한다. 리브 서버에
  올리지 않고, 친구에게 보이지 않고, 리브 안에서 수정·삭제·드래그할 수 없다.
  설정 토글을 끄면 즉시 사라진다.
- **어느 캘린더를 볼지 사용자가 고른다.** 마스터 토글 하나 + 기기 캘린더 목록의
  캘린더별 체크박스. 기본값은 구독·생일 같은 읽기 전용 캘린더를 끈 상태다.
- **칸에는 알약 한 줄**을 개인 일정 아래에 둔다. 중성색 외곽선 + 기기 캘린더의 색 점으로
  "내가 리브에 적은 것"과 구분한다. 여럿이면 `제목 +N`으로 접는다.
- 범위는 **네이티브 달력 탭뿐**이다. 친구 비교 달력, 웹 앱, 위젯은 건드리지 않는다.

## 배포 제약 — OTA로 닿지 않는다

`expo-calendar`는 autolink되는 네이티브 모듈이고 캘린더 읽기 권한이 따라붙는다.
`app.json`의 `runtimeVersion.policy`가 `"fingerprint"`이므로 **이 기능은 기존 스토어
사용자에게 OTA로 절대 배달되지 않는다.** 새 EAS 빌드 → 스토어 심사 → 배포가 필수다.
배경은 `apps/native/AGENTS.md`에 있다.

`app.json`에 함께 들어가는 것:

- `ios.infoPlist.NSCalendarsUsageDescription`과 `NSCalendarsFullAccessUsageDescription`
  (iOS 17+는 후자를 본다). 문구는 읽기 목적만 적는다.
- `android.permissions`에 `READ_CALENDAR`. 지금은 `permissions: []`이고
  `blockedPermissions`만 채워져 있다.
- `android.blockedPermissions`에 `WRITE_CALENDAR`. 쓰기 권한이 모듈을 따라 조용히
  들어오는 것을 막는다 — 우리는 쓰지 않고, 심사에서 설명할 것도 없어야 한다.

`ios.privacyManifests`는 손대지 않는다. 기기에 남기지도 서버로 보내지도 않으므로
`NSPrivacyCollectedDataTypes`에 해당하는 항목이 없다.

## 설계

### 1. 어디에 사는가

```
apps/native/src/device-calendar/
  preferences.ts               토글 + 고른 캘린더 ID (기기 로컬, 모듈 스토어)
  storage.ts / storage.native.ts   localStorage / SecureStore-급 저장소 짝
  bridge.ts / bridge.native.ts     expo-calendar 얇은 감싸개 (웹은 no-op)
  dates.ts                     Date → ISODate 접기 (순수, 테스트 대상)
  types.ts                     DeviceEvent, DeviceCalendar
  use-device-calendar-events.ts    월 단위 useQuery
  use-device-calendar-preferences.ts
```

`packages/client`가 아니라 `apps/native`다. client는 웹과 공유하므로 `expo-calendar`를
import할 수 없고, `eslint.config.mjs`의 `no-restricted-imports`가 이를 오류로 만든다.

### 2. 설정값 — `widgets/preferences.ts`와 같은 모양

모듈 스토어 + `useSyncExternalStore` + 플랫폼별 저장소. 위젯 설정이 이미 이 패턴이고,
이유도 같다 — 서버에 올릴 값이 아니라 **이 기기의 취향**이다. 기기마다 붙어 있는
캘린더가 다르므로 계정에 묶으면 오히려 틀린다.

```ts
type DeviceCalendarPreferences = {
  enabled: boolean;
  /** 명시적으로 켠 캘린더 ID. 여기 없는 것은 꺼진 것이다. */
  calendarIds: string[];
};
```

`normalize`가 하는 일이 위젯 설정보다 중요하다.

- **기기에서 사라진 캘린더 ID는 읽는 자리에서 걸러낸다.** 계정을 지웠는데 설정에 ID가
  남아 있으면 목록에 유령 행이 생긴다.
- **모르는 캘린더는 꺼짐이다.** 허용 목록으로 두는 이유가 이것이다. 나중에 회사 계정을
  붙였을 때 남의 업무 일정이 말없이 달력에 나타나면 안 된다.

### 3. 기본 선택 — 공휴일 중복을 기본값에서 끝낸다

**처음 권한을 승인한 순간** 캘린더 목록을 읽어 `calendarIds`를 정한다.
`allowsModifications`가 참인 캘린더만 켜고, 구독·생일·읽기 전용은 끈다.

리브는 이미 `shared/holidays.ts`의 `getHoliday`로 공휴일을 빨갛게 그린다. "대한민국
공휴일" 구독 캘린더를 그대로 켜면 모든 공휴일 칸에 같은 말이 두 번 적히고, 생일
캘린더를 켜면 칸이 생일로 덮인다. 껐다 켜는 것은 언제든 할 수 있지만, **첫인상이
쓰레기 더미면 기능을 꺼 버리고 다시 오지 않는다.**

이 판정은 순수 함수(`defaultCalendarIds(calendars)`)로 두고 테스트한다.

### 4. bridge — 기기와 닿는 유일한 자리

```ts
type DeviceCalendar = { id: string; title: string; color: string;
                        source: string; allowsModifications: boolean };

type DeviceEvent = {
  id: string;
  title: string;
  startDate: ISODate;          // 포함 시작
  endDate: ISODate;            // 포함 끝
  startTime: LocalTime | null; // 종일이면 null ("HH:mm")
  endTime: LocalTime | null;
  calendarId: string;
  color: string;               // 기기 캘린더의 색. 칸의 점에 그대로 쓴다
};
```

`startDate`/`endDate`가 `PersonalEvent`와 같은 모양인 것이 핵심이다. 그래야
`components/month-cell-index.ts`의 `buildRangeIndex`를 **그대로** 쓸 수 있고, 여러 날에
걸친 일정이 개인 일정과 똑같은 규칙으로 칸마다 펼쳐진다. `DatedRange`는 이미 구조적
타입이라 손댈 것이 없다.

`bridge`가 노출하는 것은 다섯뿐이다.

```ts
getPermission(): Promise<"granted" | "denied" | "undetermined">
requestPermission(): Promise<"granted" | "denied">
listCalendars(): Promise<DeviceCalendar[]>
listEvents(month: string, calendarIds: string[]): Promise<DeviceEvent[]>
openEvent(id: string): Promise<void>
```

웹 짝(`bridge.ts`)은 전부 no-op이다 — 권한은 항상 `"denied"`, 목록은 빈 배열.
설정 화면은 열리되 "이 기기에서는 쓸 수 없어요"를 보여준다.

`expo-calendar`를 import하는 파일은 `bridge.native.ts` **하나뿐**이다. 화면과 훅은
`DeviceEvent`만 알면 된다. 모듈 API가 SDK를 건너며 바뀌어도 고칠 자리가 한 곳이다.

### 5. 날짜 접기 — 가장 틀리기 쉬운 자리

`expo-calendar`는 `Date`를 주고 리브 전체는 `ISODate` 문자열로 돈다. 접는 곳은
`dates.ts` 한 곳이고, 규칙은 둘로 갈린다.

**시간이 있는 일정** → `Asia/Seoul` 기준으로 접는다. `shared/dates.ts`의
`todayInSeoul(now)`가 `Intl` 포매터로 이미 정확히 이 일을 한다. 다만 이름이 뜻을
가린다 — `todayInSeoul(event.startDate)`는 읽는 사람을 속인다. `seoulDate(at: Date)`로
내놓고 `todayInSeoul()`이 그것을 부르게 한다. 한 줄짜리 개명이고 기존 호출부는 그대로다.

**종일 일정** → 기기가 준 날짜 성분을 그대로 쓴다. 시간대로 접으면 하루가 밀린다.
여기에 플랫폼 차이가 얹힌다 — 종일 일정의 끝 날짜가 iOS는 포함, Android는 배타인
것으로 알려져 있어 한쪽은 하루를 당겨야 한다. **정확한 동작은 구현 전에 v57 문서
(`https://docs.expo.dev/versions/v57.0.0/sdk/calendar/`)와 실기기로 확인하고**, 결과를
이 파일의 순수 함수에 가둔다. 경계값 테스트가 여기 몰리는 이유다.

### 6. 월 단위 조회 — `MonthBlock`의 기존 자리 옆

`components/calendar-scroll.tsx`의 `MonthBlock`은 이미 달마다
`useCalendar` · `usePersonalEvents(props.month)`를 부른다. 그 옆에 한 줄이 더 붙는다.

```ts
const deviceEvents = useDeviceCalendarEvents(props.month);
```

`useQuery`이고 키는 `["deviceCalendar", month, calendarIds.join(",")]`다.
`enabled`는 `토글 ON && 권한 granted && 고른 캘린더 ≥ 1`.

**디스크에 남지 않는다.** `lib/query-persistence.ts`의 `PERSISTED_QUERY_ROOTS`는 허용
목록이고 `deviceCalendar`는 거기 없다. 남의 캘린더 제목이 SQLite에 눌러앉는 사고가
구조가 아니라 우연으로 막히지 않게, 이 사실을 `use-device-calendar-events.ts`의
머리주석에 적는다.

다시 읽는 시점은 셋이고, **셋 다 이미 있는 장치로 얻는다.**

1. 월 블록 마운트 — 스크롤로 새 달에 들어갈 때.
2. 설정 변경 — 캘린더를 켜고 끄면 키가 바뀌므로 자동이다.
3. **앱이 앞으로 돌아올 때.** `lib/query-persistence.ts`의
   `configureQueryOnlineManager()`가 React Query의 `focusManager`를 이미 `AppState`에
   이어 두었고, `refetchOnWindowFocus`는 기본이 켜짐이다. 전역 `staleTime`이 15초라
   앱을 다시 열면 알아서 다시 읽는다. **추가 코드가 없다** — 무효화를 따로 걸지 않는다.

3번이 이 기능에서 가장 흔한 "왜 안 바뀌지"를 막는다. 기기 캘린더는 리브 밖에서
바뀌고, 사용자는 캘린더 앱에서 일정을 고친 뒤 곧장 리브로 돌아온다.

대신 이 쿼리만 **`networkMode: "always"`** 를 준다. 전역 기본은 `"offlineFirst"`인데,
그건 통신을 하는 쿼리를 위한 값이다. 기기 캘린더는 네트워크를 전혀 쓰지 않으므로
신호가 없다고 재시도가 멈출 이유가 없다 — 그리고 이 앱의 사용자는 **신호가 없는 곳에서
달력을 본다.** 생활관에서 자기 기기의 일정이 안 보이면 기능이 없는 것과 같다.

### 7. 칸에 그리기 — `components/month-calendar.tsx`

`deviceEvents` prop을 받아 `buildRangeIndex`를 한 번 더 돌리고, 개인 일정 알약 **아래에**
한 줄을 그린다.

```
┌──────────────┐
│      15      │
│ [■ 연가 3일 ]│  ← 재원 칩
│ [ 동아리 모임]│  ← 개인 일정 (brand 외곽선)
│ [• 팀 회의+2]│  ← 외부 (중성색 외곽선 + 캘린더 색 점)
└──────────────┘
```

제목 접기는 `shared/calendar.ts`의 `personalEventCellLabel`을 그대로 쓴다 — 인자가
`readonly { title: string }[]`이라 이미 맞는다. 색 점은 그날 첫 일정의 `color`다.
`compact` 변형(44px 칸)에서는 다른 항목과 마찬가지로 그리지 않는다.

접근성 라벨에는 접힌 제목까지 넣는다. 칸에서 접힌 것이 스크린리더에서도 사라지면
그 정보는 어디에도 없다 — 개인 일정이 같은 규칙을 따르고 있다.

### 8. 읽기 전용을 드래그가 지키게 한다 — `calendar-drag/grab-target.ts`

`nearestGrabTarget`은 **거리 상한이 없다.** 칸 어디를 길게 눌러도 가장 가까운 끌 수 있는
항목이 집힌다(`2026-09-20-calendar-item-drag-design.md`의 결정이고, 그 자체로는 옳다).

외부 알약을 개인 일정 **아래에** 그리면 그대로 깨진다: 외부 일정을 길게 누르면 바로
위의 개인 일정이 들려 올라간다. 읽기 전용이어야 할 것이 남의 일정을 옮기는 손잡이가 된다.

고치는 법은 후보에 **막개**를 허용하는 것이다.

```ts
type GrabCandidate<T> = { subject: T | null; rect: GrabRect | null };
```

가장 가까운 후보의 `subject`가 `null`이면 `nearestGrabTarget`도 `null`을 돌려준다.
외부 알약이 `slot: "external"`로 자기 사각형을 `onLayout`에 등록하면, 그 위의 길게
누르기는 아무것도 집지 않는다. `DayCellSlot`에 `"external"`이 더해진다.

마지막 줄의 `candidates[0]?.subject ?? null` 되돌림(사각형이 아직 하나도 안 잡혔을 때의
보험)은 그대로 둔다 — 첫 후보가 막개면 자연히 `null`이다.

### 9. 하루 패널 — `screens/calendar/day-panel.tsx`

`deviceEvents?: readonly DeviceEvent[]` prop을 받아 `내 개인 일정 N건` 아래에
`기기 캘린더 N건` 섹션을 둔다. 행마다 색 점 + 제목 + 시간 + 캘린더 이름.

행을 누르면 **기기 캘린더 앱에서 그 일정을 연다**(`bridge.openEvent`). 리브 안에는
수정 경로를 두지 않는다 — 보기 전용 결정의 당연한 귀결이고, 고칠 곳이 한 군데뿐이어야
두 벌이 생기지 않는다.

패널은 좁은 창의 바텀시트와 넓은 창의 인스펙터에서 같은 컴포넌트다
(`screens/calendar/index.tsx`가 같은 prop을 두 자리에 넘긴다). 외부 일정도 같은 자리에
넘긴다 — 지금 `panelPersonalEvents`가 그렇게 쓰이고 있다.

### 10. 설정 화면 — `screens/calendar-settings.tsx`

프로필 탭이 설정 화면이다. `홈 화면 위젯` 카드 옆에 카드를 하나 더 두고
`/calendar-settings`로 보낸다. 라우트 `app/calendar-settings.tsx` + 화면
`screens/calendar-settings.tsx`, `widget-settings`와 정확히 같은 짝이다.
`experiments.typedRoutes`가 켜져 있어 라우트 타입은 자동으로 생긴다.

카드 둘:

1. **외부 캘린더 일정 보기** — 마스터 토글. 설명이 이 기능의 계약을 그대로 적는다:
   *"기기 캘린더를 읽어 달력 탭에만 겹쳐 보여줍니다. 리브 서버에 올라가지 않고,
   친구에게 보이지 않고, 리브에서는 고칠 수 없어요."* 켜는 순간 권한을 요청한다.
2. **가져올 캘린더** — 목록. 행마다 색 점 + 이름 + 출처(iCloud/Gmail…) + `NativeCheckbox`.
   마스터가 꺼져 있으면 비활성.

권한은 세 상태로 다룬다.

- **미요청** — 토글을 켜는 순간 요청한다. 설정 화면에 들어온 것만으로는 묻지 않는다.
- **거부** — 카드가 안내 문구 + `Linking.openSettings()` 버튼으로 바뀌고 마스터 토글은
  꺼진 채 둔다. 앱 안에서 다시 물어봐야 소용없다(OS가 두 번째 요청을 무시한다).
- **승인** — 목록을 읽고, `calendarIds`가 비어 있으면 §3의 기본 선택을 채운다.

iOS 17+에는 전체 접근과 별도로 제한적 접근이 있어 목록이 일부만 올 수 있다. 그때는 빈
화면 대신 "기기 설정에서 리브에 보여줄 캘린더를 더 고를 수 있어요" 한 줄을 단다.

## 테스트

`docs/testing.md`의 표를 따른다. `apps/native/test`는 node 환경이라 react-native를 불러올
수 없다 — 그래서 순수 함수에만 붙이고, 그게 위험이 몰린 자리와 정확히 겹친다.

| 파일 | 고정하는 것 |
| --- | --- |
| `test/device-calendar-dates.test.ts` | 종일/시간 일정 접기, KST 자정 경계, 월말·연말, 포함·배타 끝, 여러 날 걸침 |
| `test/device-calendar-preferences.test.ts` | 사라진 ID 걸러내기, 모르는 캘린더는 꺼짐, `defaultCalendarIds` 규칙 |
| `test/calendar-grab-target.test.ts` (기존) | 가장 가까운 후보가 막개면 `null`. 막개만 있으면 `null` |
| `packages/shared/test/dates.test.ts` (기존) | `seoulDate`가 `todayInSeoul`과 같은 답을 준다 |

화면 자체는 `check-types` + `lint` + 실기기 확인이다. Maestro는 붙이지 않는다 —
시뮬레이터에 캘린더 데이터를 심는 고정장치가 없어 테스트가 환경에 매달린다.

마지막에 `pnpm quality`를 통과시킨다.

## 손대는 파일

**새로 만드는 것**

- `apps/native/src/device-calendar/` — §1의 목록 전부
- `apps/native/src/screens/calendar-settings.tsx`
- `apps/native/src/app/calendar-settings.tsx`
- `apps/native/test/device-calendar-dates.test.ts`
- `apps/native/test/device-calendar-preferences.test.ts`

**고치는 것**

- `apps/native/app.json` — 권한·usage description·`expo-calendar` 의존
- `apps/native/package.json` — `expo-calendar` 고정 버전(`^` 없이). `scripts`는 건드리지 않는다
- `apps/native/src/components/calendar-scroll.tsx` — `MonthBlock`이 훅을 부르고 prop을 내린다
- `apps/native/src/components/month-calendar.tsx` — `deviceEvents` prop, 알약 한 줄, `external` 슬롯
- `apps/native/src/components/calendar-drag/grab-target.ts` — 막개 후보
- `apps/native/src/components/calendar-drag/use-day-cell-drag.ts` — `DayCellSlot`에 `"external"`
- `apps/native/src/screens/calendar/day-panel.tsx` — `기기 캘린더 N건` 섹션
- `apps/native/src/screens/calendar/index.tsx` — 패널 두 자리에 `deviceEvents` 전달
- `apps/native/src/screens/profile.tsx` — 설정 진입 카드
- `packages/shared/src/dates.ts` — `seoulDate` 내놓기

## 하지 않는 것

- **리브 휴가를 기기 캘린더에 쓰기.** 쓰기 권한 자체를 막는다(§배포 제약).
- **리브 개인 일정으로 가져오기.** 두 벌이 생기고 양방향 동기화 문제가 따라온다.
- **친구 비교 달력에 반영.** 거기는 "남과 내 출타가 겹치는가"를 보는 화면이고 내 기기
  일정은 그 질문에 답하지 않는다.
- **알림.** 기기 캘린더가 이미 알린다.
- **웹 앱과 위젯.** 웹은 `bridge.ts` no-op으로 받는다.

## 알려진 위험

**종일 일정의 끝 날짜가 플랫폼마다 다르다.** 설계에서 가장 확신이 낮은 곳이고,
틀리면 여러 날 일정이 하루 길거나 짧게 칠해진다. 구현 첫 단계에서 실기기로 확인하고
테스트로 굳힌다(§5).

**칸이 한 줄 더 빽빽해진다.** 92px 칸에 재원 칩·개인 일정·외부 일정·출타자 이니셜·제한
배지·출타율 신호가 모두 들어갈 수 있다. 실기기에서 최악의 날(전부 있는 날)을 만들어
보고, 넘치면 외부 알약을 가장 먼저 접는다 — 리브가 책임지는 정보가 남의 캘린더보다
앞선다.

**반복 일정이 많은 캘린더는 조회가 무겁다.** `expo-calendar`는 반복을 인스턴스로 펼쳐
주므로 매일 반복하는 일정 몇 개면 한 달에 수백 건이 된다. 월 단위로 끊어 읽는 것이
이미 방어지만, 실기기에서 스크롤이 무거우면 `enabled` 조건에 "보이는 달 ± 1"을 더한다.

**권한 상태는 앱 밖에서 바뀐다.** 사용자가 기기 설정에서 권한을 거둬도 리브는 모른다.
설정 화면에 들어올 때마다 `getPermission()`을 다시 읽고, 조회가 권한 오류로 실패하면
토글을 꺼서 상태를 맞춘다.
