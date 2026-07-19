# 리브 v2 설계 — 달력 스크롤 · 공휴일 · 부대 관리 · 랜딩

작성일: 2026-07-19 · 브랜치: `feature/leave-v2`

## 목표

한 번의 릴리스로 다음 6개 작업 묶음을 처리한다.

1. 부대 달력을 **버튼 이동 → iOS 기본 캘린더식 세로 무한 스크롤**로 전환 (웹·앱)
2. 달력에 **한국 공휴일**(대체공휴일·음력 포함) 표시
3. 앱 `내 휴가`·`알림` 탭 **제목 위 여백 축소**
4. **부대 관리자** 권한 체계: 관리자만 부대 관리, 관리자 **이관**, **부대 인원** 설정(출타율 계산 근거), **가입 승인**, **부대원 제거**, 부대 정보(이름·출타율·인원·설명·이미지) 전체 수정
5. 웹 **홍보용 랜딩 페이지**를 로그아웃 상태의 메인(`/`)으로

각 묶음은 독립적으로 배포 가능하도록 설계한다. 랜딩(5)은 나머지와 무관하게 먼저 병합 가능.

## 확정된 결정 (브레인스토밍 Q&A)

- 공휴일: **정적 표(shared 내장, 2024–2030)**. 대체공휴일·음력 실제 관측일 하드코딩, 오프라인·테스트 가능
- 부대 인원: **수동 인원 우선, 미설정 시 앱 가입자 수로 대체**
- 달력 상세: **세로 무한 스크롤 + 바텀시트(앱)/사이드패널(웹)**
- 관리자 이관: **다른 부대원 있으면 이관 후 나가기, 혼자 남은 관리자가 나가면 빈 부대 삭제**
- 랜딩 CTA: 주 `무료로 시작하기`(→ `/signup`), 보조 `로그인`. 앱스토어 배지는 "곧 출시" 플레이스홀더(앱 미출시 전제)

---

## 1. 데이터 모델 & 마이그레이션 (`apps/api`)

`apps/api/src/db/schema.ts` `units` 테이블에 컬럼 추가:

- `adminId: text("admin_id").notNull()` — 부대 관리자 사용자 id
- `headcount: integer("headcount")` (nullable) — 관리자가 설정한 부대 인원
- `imageKey: text("image_key")` (nullable) — 부대 이미지 R2 키

신규 테이블 `unitJoinRequests`:

```
id         text PK
unitId     text NOT NULL   (index)
userId     text NOT NULL   UNIQUE   // 1인 1건 대기
createdAt  text NOT NULL
```

가입 신청은 이 테이블의 행으로만 존재한다. 승인 → 행 삭제 + `users.unitId` 설정. 거절 → 행 삭제.

**마이그레이션** `migrations/0002_unit_admin.sql` (drizzle-kit generate 후 손보정):

- `ALTER TABLE units ADD COLUMN admin_id text;` → `UPDATE units SET admin_id = creator_id;` (기존 부대 관리자 = 생성자)
- `ALTER TABLE units ADD COLUMN headcount integer;`
- `ALTER TABLE units ADD COLUMN image_key text;`
- `CREATE TABLE unit_join_requests (...)` + 인덱스/유니크
- SQLite는 기존 컬럼에 `NOT NULL`을 나중에 강제하기 까다로우므로 스키마상 `adminId`는 notNull이되 마이그레이션에서 backfill 후 사용. 애플리케이션 레벨에서 항상 채워 넣는다.

## 2. 공유 로직 (`packages/shared`)

### `src/holidays.ts` (신규)

```ts
export const HOLIDAYS: Record<ISODate, string>  // 2024-01-01 ~ 2030-12-31
export function getHoliday(date: ISODate): string | null
export function isHoliday(date: ISODate): boolean
```

- 양력 고정: 신정, 삼일절, 어린이날, 현충일, 광복절, 개천절, 한글날, 성탄절
- 음력/변동: 설날(전날·당일·다음날), 부처님오신날, 추석(전날·당일·다음날) — **연도별 실제 관측일**을 표로 하드코딩
- 대체공휴일: 각 연도 실제 적용일 포함
- `index.ts`에서 재노출. vitest 테스트로 대표일(설날/추석/대체공휴일/주말겹침) 검증

### `src/schemas.ts`

- `unitCreateSchema`에 `headcount: z.int().min(1).optional()` 추가
- 신규 `unitUpdateSchema` — `name?, description?, maxLeaveNumerator?, maxLeaveDenominator?, headcount?` 전부 optional, 비율 refine 유지
- 신규 `unitTransferSchema = z.object({ userId: z.string().min(1) })`
- 타입 export 추가

### 출타율 계산 (`src/overage.ts`는 그대로, 호출부에서 인원 결정)

허용 인원 = `floor((headcount ?? 앱가입자수) × 비율)`. shared에 헬퍼 추가:

```ts
export function effectiveMemberCount(headcount: number | null, appMemberCount: number): number
```

## 3. API (`apps/api`)

### `lib/serialize.ts` — `serializeUnit`

`unitSchema`(responses.ts)에 `adminId`, `headcount`(nullable), `imageKey`(nullable) 추가. `memberCount`는 지금처럼 **앱 가입자 수**. 클라이언트는 `headcount ?? memberCount`로 기준 인원 계산.

### `routes/units.ts`

관리자 전용(요청자 `user.id !== unit.adminId`면 403):

- `PATCH /units/:id` — `unitUpdateSchema`. 이름 변경 시 중복 검사. 출타율/인원 변경은 캐시 무효화(`bumpUnitVersion`)
- `GET /units/:id/requests` — 대기 신청 목록(join `users`로 이름·계급·군종)
- `POST /units/:id/requests/:userId/approve` — 대상 `unitId=id` 설정, 신청 행 삭제, 신규+구 부대 캐시 무효화
- `POST /units/:id/requests/:userId/reject` — 신청 행 삭제
- `POST /units/:id/members/:userId/remove` — 대상 `unitId=null`(자기 자신 불가), 캐시 무효화
- `POST /units/:id/transfer` — `unitTransferSchema`. 대상이 현재 부대원인지 검증 후 `adminId` 변경

일반:

- `POST /units/:id/join` — **즉시 가입 → 가입 신청 생성**으로 변경. 이미 그 부대 소속이면 no-op, 이미 대기 신청 있으면 교체. 응답 `{ requested: true }`
- `POST /units/leave` — 관리자면서 다른 부대원 존재 시 **409**(이관 먼저). 관리자가 혼자면 부대·신청·이미지 삭제 후 탈퇴. 그 외 기존 동작
- `GET /units/:id/members` — 기존 유지(관리자 UI에서 재사용)

### `routes/images.ts`

- `PUT /images/unit/:id` (authMiddleware, 관리자 검증) — R2 키 `units/:id/{uuid}.ext`, `units.imageKey` 갱신, 이전 이미지 삭제. `GET /:key`는 기존 공개 서빙 재사용

### `routes/auth.ts` — `GET /auth/me`

- `unit`에 위 필드 포함(serializeUnit)
- 응답에 `joinRequest: { unitId, unitName } | null` 추가 — 대기 신청 표시용

### 출타율 계산 반영

- `routes/units.ts` calendar 핸들러: `computeDayStats`의 `memberCount`를 `effectiveMemberCount(unit.headcount, members.length)`로
- `lib/overage.ts`: `findExceededDates`의 `memberCount` 동일하게 변경(시그니처에 `unit.headcount` 전달)

### 테스트

`apps/api/test/*.test.mjs` 패턴으로 관리자 플로우(가입 신청→승인/거절, 이관, 제거, 인원 기반 출타율, 비관리자 403) 통합 테스트 추가.

## 4. 달력 세로 스크롤 + 공휴일 (웹·앱)

공통 원칙: 기존 **한 달 그리드**(`MonthCalendar`, `buildMonthGrid`)를 그대로 살리되, 공휴일 스타일을 추가하고, 여러 달을 세로로 쌓는 **스크롤 컨테이너**를 새로 만든다. 월 데이터는 지금의 월별 `GET /units/:id/calendar`를 **달 블록별로 지연 로드**(React Query가 월별 캐시).

### 공휴일 표시(양 플랫폼 `MonthCalendar`)

- 셀 날짜가 공휴일이면 일요일과 동일한 빨간 날짜색 + 작은 공휴일 이름 라벨
- 접근성 라벨에 공휴일명 포함

### 웹 (`apps/web`)

- 신규 `components/calendar/CalendarScroll.tsx` — 세로 스크롤 컨테이너. 초기 현재 ±12개월, 상·하단 IntersectionObserver 센티넬로 12개월씩 확장(prepend 시 `scrollTop` 보정). 상단 요일 헤더 `position: sticky`, 각 달 위 "YYYY년 M월" 라벨
- 각 달 블록 = `MonthBlock`(자체 `useCalendar(unitId, month)`)
- 날짜 탭 → 기존 `DayPanel` 사이드패널(현 2컬럼 레이아웃 유지). "오늘" 버튼 → 현재 달로 스크롤(scrollIntoView)
- `CalendarPage`는 헤더(부대명·연도)만 유지하고 본문을 `CalendarScroll`로 교체

### 앱 (`apps/native`)

- 신규 `components/calendar-scroll.tsx` — `FlatList`(세로), `data`=월 문자열 배열, `maintainVisibleContentPosition={{minIndexForVisible:0}}`로 위 확장 시 점프 방지, `onEndReached`/상단 도달 시 월 추가
- 각 항목 = `MonthBlock`(자체 `useCalendar`). 상단 sticky 요일 헤더
- 날짜 탭 → **바텀시트**(RN `Modal` presentationStyle 활용 또는 절대배치 시트)에 `DayPanel` 내용
- `screens/calendar/index.tsx`의 본문을 스크롤 컴포넌트로 교체, "오늘" 버튼은 리스트를 현재 달로 스크롤

## 5. 부대 관리 UI (웹·앱)

관리자 판별: `me.user.id === me.unit.adminId`.

- **관리자 전용 화면/섹션 "부대 관리"**:
  - 부대 정보 수정 폼(이름·설명·출타율·부대 인원·이미지 업로드)
  - 대기 가입 신청 목록 → 승인/거절
  - 부대원 목록(`GET members`) → 각 행에 제거 / 관리자 이관 버튼(자기 자신 제외)
- **일반 부대원**: 관리 진입점 숨김. 부대 정보(인원·출타율)만 열람
- **가입 신청 상태**: `me.joinRequest` 있으면 부대 찾기 화면에 "가입 신청됨 · 승인 대기" 표시, 신청 취소 가능(선택)
- 출타율 안내 문구: `기준 인원 = headcount ?? 가입자수` 로 표기(웹 `CalendarPage` legend, 앱 동일)
- 웹: `pages/UnitManagePage.tsx`(관리자만 라우팅) + `UnitsPage`에서 진입 버튼. 앱: `screens/unit-manage.tsx` + `app/unit-manage.tsx` 라우트
- API 훅: `queries.ts`(웹·앱)에 `useUnitUpdate`, `useJoinRequests`, `useApproveRequest`, `useRejectRequest`, `useRemoveMember`, `useTransferAdmin`, `useUploadUnitImage` 추가. `useJoinUnit`은 신청 시맨틱으로 조정

## 6. 앱 탭 제목 위 여백 축소

- `apps/native/src/screens/leaves.tsx`, `notifications.tsx`: `paddingTop: insets.top + spacing.lg` → `insets.top + spacing.xs`
- 웹 병행: `LeavesPage`·`NotificationsPage` 상단 패딩 `--sp-2xl` → `--sp-lg`

## 7. 웹 랜딩 페이지 (`apps/web`)

라우팅(저위험): 로그아웃 상태의 `/`를 랜딩으로, 로그인 상태의 `/`는 기존 달력 유지.

`App.tsx`:
```
비인증: <Route path="/" element={<LandingPage/>} />, "*" → "/"
        (기존 /login, /signup 유지)
인증:   기존 AuthedApp 그대로
```
`LandingPage`는 `AppLayout`(me 필요)을 쓰지 않는 독립 공개 페이지. 자체 헤더(로고 + 로그인/시작하기)와 푸터.

구성 섹션:
1. 상단 내비(로고 `리브` + `로그인`·`무료로 시작하기`)
2. 히어로 — 핵심 카피("부대 출타율, 미리 보고 계획하세요") + 서브카피 + CTA + **달력 목업 비주얼**(출타율 초과일 빨간 표시가 보이는 정적 미니 달력, 순수 CSS/SVG)
3. 핵심 기능 3~4개 카드: 부대 달력 함께 보기 · 출타율 초과 알림(인앱+푸시) · 계급 자동 진급 · 부대 관리(승인·인원)
4. 3단계 사용법: 가입 → 부대 찾기/승인 → 휴가 등록·달력 확인
5. 플랫폼 안내(iOS·Android·웹) + 앱스토어 "곧 출시" 배지 + 시작하기 CTA
6. 푸터(리브, 개인정보 안내, 로그인)

기존 Wise풍 디자인 토큰(라임 `#9fe870`, 대형 디스플레이 타이포, 카드/라운드) 사용. 반응형·라이트 테마. 외부 이미지 없이 CSS/SVG 목업. **구현 시 frontend-design 스킬로 완성도 향상.**

---

## 작업 순서 (의존성)

1. shared: holidays + schemas + effectiveMemberCount + 테스트
2. api: 스키마/마이그레이션 → serialize/responses → units/images/auth 라우트 → overage 반영 → 테스트
3. web/native 공용 API 훅 갱신
4. 달력 스크롤 + 공휴일 UI (웹, 앱)
5. 부대 관리 UI (웹, 앱)
6. 탭 여백 (웹, 앱)
7. 랜딩 페이지 (웹) — 독립, 병렬 가능

## 검증

- `pnpm test --filter @leave/shared` (holidays 유닛)
- `pnpm test --filter @leave/api` (관리자 플로우 통합)
- `pnpm check-types` 전체
- 웹 `pnpm --filter @leave/web build`, 앱 타입체크
- 달력 스크롤/랜딩은 실제 렌더 확인(웹 dev, 앱 시뮬레이터/Expo)

## 스코프에서 제외 (YAGNI)

- 부대별 자동 가입(승인 없이) 옵션 — 모든 가입은 승인 필요
- 공휴일 실시간 API/캐시 — 정적 표로 충분
- 관리자 복수 지정 — 단일 관리자 + 이관으로 충분
- 가로 스와이프 페이징 — 세로 스크롤로 확정
