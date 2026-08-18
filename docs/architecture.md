# 아키텍처

이 문서는 "무엇이 어디에 사는가"와 "왜 그 자리인가"를 다룬다.
명령어와 실행 방법은 [README.md](../README.md), 에이전트용 작업 규칙은 [AGENTS.md](../AGENTS.md)에 있다.

## 패키지와 책임

| 경로              | 한 줄 책임                                     | 담지 않는 것                                |
| ----------------- | ---------------------------------------------- | ------------------------------------------- |
| `packages/shared` | 플랫폼과 무관한 도메인 규칙(순수 함수·zod)     | React, 네트워크, DB, 런타임 전역            |
| `packages/client` | 웹·앱이 함께 쓰는 데이터 계층(쿼리 훅·폼 상태) | 화면(JSX), 스타일, localStorage/SecureStore |
| `apps/api`        | 공개 API 워커 (Hono + D1 + KV)                 | 화면, 클라이언트 캐시 정책                  |
| `apps/web`        | 웹 화면 (Vite + React)                         | 도메인 규칙, 서버 상태 사본                 |
| `apps/native`     | iOS/Android 화면 (Expo)                        | 도메인 규칙, 서버 상태 사본                 |
| `apps/admin`      | 운영자 콘솔 (SPA + 전용 워커)                  | 사용자 앱과 공유하는 화면                   |

## 의존 방향

```
        packages/shared          ← 아무것도 위로 의존하지 않는다
         ↑     ↑      ↑
         │     │      └──────── apps/admin
         │     └───────────── apps/api
   packages/client
         ↑        ↑
   apps/web   apps/native
```

- `apps/admin`은 서버 전용 경계 `@leave/api/server`(apps/api/src/admin-shared.ts)로 스키마와 암호·푸시 헬퍼를 가져온다.
  브라우저 번들에서는 import하지 않는다.
- `packages/client`는 `@leave/api`에서 **타입만** 가져온다(`AppType`). Hono RPC가 성립하는 지점이며,
  값 import는 서버 코드를 클라이언트 번들로 끌어온다.
- 웹과 네이티브는 서로의 구현을 모른다. 공유할 것이 생기면 아래로 내린다.

이 규칙은 문서가 아니라 도구가 지킨다 — `eslint.config.mjs`의 `no-restricted-imports`가 어긋난 import를
오류로 만든다. 예외를 두려면 그 파일에 이유와 함께 적는다.

## 어디에 두는가

**순수한 휴가·달력 규칙** → `packages/shared`.
서버와 두 앱이 같은 답을 내야 하는 것은 전부 여기다(잔여 계산, 정기외박 주기, 계급 진급, 날짜 표기).
Date 객체를 밖으로 내보내지 않는 것이 이 패키지의 규칙이다 — 타임존 때문에 하루가 밀리는 사고를 막는다.

**웹/앱의 서버 데이터 접근** → `packages/client/src/hooks`.
화면에서 `useQuery`를 직접 부르지 않는다. 캐시 키는 `query-keys.ts` 한 곳에서만 만들고,
"이 뮤테이션 뒤에 무엇이 낡는가"는 `hooks/invalidate.ts`의 묶음으로 이름 붙여 둔다.

**플랫폼 차이**(토큰 저장소, 인증 실패 시 정리) → `LeaveApiAdapter`. 앱 루트에서 한 번 주입한다.

**서버 상태 vs 화면 상태** → TanStack Query가 서버 상태를, Jotai/`useState`가 화면 상태를 가진다.
지금 Jotai가 들고 있는 것은 세션 토큰 하나뿐이다.

## API 워커 구조

```
routes/<기능>.contract.ts   이 API가 약속하는 것 (경로·입력 스키마·응답 코드)
routes/<기능>.ts            HTTP 흐름 — 권한 확인 → 아래 호출 → 상태 코드 선택
lib/*.ts                    여러 표를 함께 바꾸거나 규칙을 판정하는 작업
db/schema.ts                D1 테이블 정의
middleware/*.ts             인증·온보딩·rate limit·접속 기록·최소 버전
```

명세와 구현을 나눈 이유는 길이가 아니다. 한 파일에 두면 어느 쪽을 읽든 다른 쪽을 계속 건너뛰게 되고,
"이 API가 무엇을 약속하는가"(문서와 클라이언트 타입의 출처)를 한눈에 확인할 수 없다.

`lib/`에 올리는 기준은 다음 중 하나에 해당할 때다. 한 줄짜리 조회는 라우트에 그냥 둔다.

- 여러 표를 순서대로 바꾼다 (`delete-account.ts`, `unit-membership.ts`, `leave-merge.ts`)
- 순서나 동시성에 뜻이 있어 설명이 필요하다 (초대코드 소진, 관리자 이관)
- 여러 라우트가 같은 판정을 쓴다 (`unit-access.ts`, `leave-balances.ts`)

**오류 처리**: 사용자가 입력을 고쳐 해결할 수 있는 것만 `LeaveRuleError`(`lib/errors.ts`)로 던지고
라우트가 400으로 바꾼다. 그 밖의 오류는 그대로 올려 보내 `index.ts`의 `onError`가 500으로 처리한다.
인프라 장애 메시지가 클라이언트로 새지 않게 하는 경계다.

**캐시**: 부대 달력은 KV에 캐싱하고 "부대별 버전 토큰"으로 무효화한다(`lib/cache.ts`).
부대원·휴가·설정이 바뀌는 모든 경로에서 `bumpUnitVersion`을 부른다.

**바인딩**: `wrangler.jsonc`가 실제로 주는 바인딩과 코드가 믿는 `AppBindings`가 어긋나면
`bindings-drift.ts`에서 타입 검사가 깨진다. 생성물은 `pnpm --filter @leave/api types`로 갱신한다.

## 관리자 워커 구조

```
worker/index.ts        보안 헤더 → CSRF → 인증 → 비밀번호 변경 강제 → 라우트
worker/auth.ts         쿠키 세션, 로그인 시도 제한, 권한 미들웨어
worker/audit.ts        감사 로그 (민감 키는 저장 전에 가린다)
worker/routes/*.ts     리소스 하나에 파일 하나
```

접근 단계가 세 겹인 것과 데이터를 바꾸는 모든 라우트가 `writeAudit`을 부르는 것이 이 워커의 핵심이다.
라우트를 추가할 때 두 가지를 지킨다.

1. `operations`에 마운트한다(그래야 세 겹을 모두 통과한다).
2. 변경 라우트라면 변경 전/후 스냅샷과 함께 감사 로그를 남긴다.

리소스마다 파일을 나눈 이유는, 이름만 보고 찾을 수 있게 하기 위해서다.
"공통 CRUD 프레임워크"를 만들지 않는다 — 권한 판정이 눈에 보이는 편이 낫다.

## 관리자 화면 구조

```
src/pages/entity-configs.tsx   리소스별 표시 설정(제목·열·생성 가능 여부)
src/pages/EntityPage.tsx       목록·검색·상세 서랍·삭제 확인 — 리소스와 무관한 흐름
src/components/RecordForm.tsx  어떤 폼을 그릴지 고르는 분기
src/components/record-form/    리소스별 입력과 서버로 보낼 본문
```

새 리소스를 붙이려면 `EntityResource`에 이름을 넣고 `entityConfigs`에 항목을 더한다.
편집까지 필요하면 `EditableResource`에 넣고 `record-form/`에 입력 컴포넌트와 payload 함수를 만든다.
분기를 표로 감추지 않고 `switch`로 두는 이유는, 빠뜨린 것이 컴파일 오류로 드러나게 하려는 것이다.
