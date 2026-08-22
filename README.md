# 리브 (Leave)

군 병사들이 부대별로 휴가를 계획·공유하고, 날짜별 출타 인원이 부대의 **하루 최대 출타 인원**을 넘는 날을 미리 확인하는 서비스.

- 회원가입 시 군종(육/해/공)·입대일·전역예정일·계급을 등록하면 복무기간에 따라 **계급이 자동 진급**됩니다 (이병 2개월 → 일병 6개월 → 상병 6개월 → 병장).
- 부대를 검색해 가입하거나, 없으면 **하루 최대 출타 인원**(예: 4명)과 함께 새로 만들 수 있습니다. 이 값은 부대 관리자가 직접 지정하며 언제든 바꿀 수 있습니다.
- 부대 달력에서 부대원들의 휴가를 함께 보고, **최대 출타 인원 초과일은 빨간색**으로 표시됩니다.
- 정확한 가입 이메일로 친구 요청을 보내고 상대가 수락하면, 서로의 **공유 가능한 휴가 날짜·상태만** 최대 10명까지 한 달력에서 비교할 수 있습니다. 차단하거나 친구를 삭제하면 권한이 즉시 사라집니다.
- 휴가와 별개인 **나만 보는 개인 일정**을 달력에 기록할 수 있습니다. 개인 일정은 부대 통계·휴가 잔여량·초과 알림에 포함되지 않습니다.
- 휴가 등록으로 특정 날짜의 최대 출타 인원이 초과되면, 그 날짜에 휴가가 걸린 모든 부대원에게 **인앱 + Expo 푸시 알림**이 전송됩니다.
- 서비스 운영·보안을 위해 가입 시 동의를 받아 **접속 기록**(접속 시각·경로·플랫폼·앱 버전 등)과 이 앱 푸시의 **발송·수신·열람 로그**를 남기며, 사용자는 `GET /auth/activity`로 자신의 기록을 **직접 열람**할 수 있습니다(개인정보 열람권).

심사용 계정 자격 증명은 저장소에 기록하지 않습니다. 기존 심사 비밀번호는 노출된 것으로 간주해 회전하고, App Store Connect와 Play Console의 보안 입력란에만 전달하세요.

## 구조 (Turborepo + pnpm)

| 경로              | 내용                   | 스택                                                                                                                              |
| ----------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`        | 백엔드 API             | Hono + Cloudflare Workers, D1(Drizzle), **KV 캐시**, 접속/푸시 로깅, `@hono/zod-openapi` (문서 자동 생성 `/docs`), Hono Stack RPC |
| `apps/web`        | 웹 앱                  | Vite + React SPA, Jotai, TanStack Query, Cloudflare Workers 정적 에셋 배포, Playwright e2e                                        |
| `apps/native`     | iOS/Android 앱         | Expo SDK 57, expo-router(NativeTabs — iOS 26 Liquid Glass), expo-notifications, iPad 대응, Maestro e2e                            |
| `packages/shared` | 공유 도메인 로직       | 계급 자동진급 계산, 출타 인원 계산, zod 스키마, 날짜/달력 유틸, 공용 HTTP 유틸(`unwrap`/`ApiError`) + vitest 테스트               |
| `packages/client` | 웹·앱 공용 데이터 계층 | Hono RPC 클라이언트 타입, TanStack Query 훅, 캐시 키·무효화, 플랫폼 독립 폼 상태(`useLeaveForm`) + vitest 테스트                  |
| `apps/admin`      | 운영자 콘솔            | Vite + React SPA, 전용 Cloudflare Worker(쿠키 세션·CSRF·감사 로그), Playwright e2e                                                |

타입 안정성: `apps/api`가 `AppType`을 export → 웹/앱이 `hc<AppType>()`로 타입 안전 RPC 클라이언트 사용. 디자인은 `DESIGN.md`(Wise 스타일) 토큰을 웹·앱이 공유합니다.

- 무엇이 어디에 사는가·의존 방향: [docs/architecture.md](docs/architecture.md)
- 무엇을 고치면 무엇을 테스트하는가: [docs/testing.md](docs/testing.md)
- 유지보수 규칙: [docs/code-style.md](docs/code-style.md)

## 로컬 개발

```bash
pnpm install

# 1. API (D1/KV 로컬 에뮬레이션) — http://localhost:8787
cd apps/api
pnpm db:migrate:local     # 최초 1회: 로컬 D1에 마이그레이션 적용
pnpm dev

# 2. 웹 — http://localhost:5173 (API가 8787에 떠 있어야 함)
cd apps/web && pnpm dev

# 3. 앱 (Expo)
cd apps/native && pnpm start
# 실기기 Expo Go/개발 빌드에서 실행. API 주소는 Metro 호스트의 8787 포트를
# 자동 사용하며, EXPO_PUBLIC_API_URL로 재정의 가능.
```

### 브라우저로 UI 확인

프로젝트 로컬 `agent-browser`로 렌더링 결과, 접근성 트리, 콘솔 메시지와 페이지 오류를
확인할 수 있습니다. 최초 한 번 브라우저를 준비하고 사용자 웹을 실행합니다.

```bash
pnpm browser:install
pnpm dev:web
```

다른 터미널에서 작업 트리별 세션을 만들고 확인할 페이지를 엽니다.

```bash
LEAVE_BROWSER_SESSION="$(pnpm exec agent-browser session id --scope worktree --prefix leave)"
pnpm exec agent-browser --session "$LEAVE_BROWSER_SESSION" open http://localhost:5173
pnpm exec agent-browser --session "$LEAVE_BROWSER_SESSION" wait --load networkidle
pnpm exec agent-browser --session "$LEAVE_BROWSER_SESSION" snapshot -i
pnpm exec agent-browser --session "$LEAVE_BROWSER_SESSION" console
pnpm exec agent-browser --session "$LEAVE_BROWSER_SESSION" errors
pnpm browser:close
```

- 관리자 앱은 `pnpm dev:admin`과 `http://localhost:5174`를 사용합니다.
- API와 문서는 `http://localhost:8787`, `http://localhost:8787/docs`에서 확인합니다.
- Linux ARM64에는 Chrome for Testing 빌드가 없으므로 시스템 Chromium이 필요합니다.
  Debian/Ubuntu에서는 `sudo apt-get install -y chromium`으로 설치할 수 있습니다.
- 비밀번호 같은 자격 증명은 명령 인자나 스크린샷에 남기지 않습니다.

> 참고: 이 저장소는 `pnpm-workspace.yaml`에 `verifyDepsBeforeRun: false`를 두어
> `pnpm run`/`turbo` 실행마다 자동 `pnpm install`이 도는 것을 끕니다(스토어 버전 불일치 환경 대응).

### 테스트

```bash
pnpm quality                     # 서식 → lint → 바인딩 타입 → 타입 검사 → 테스트
pnpm test                        # 테스트만 (Turborepo 캐시)
pnpm test --filter @leave/shared # 도메인·유틸 단위 테스트 (vitest)
pnpm test --filter @leave/api    # API 통합 테스트 (격리 D1 + wrangler dev)
```

무엇을 고쳤을 때 무엇을 돌리고 무엇을 더 써야 하는지는 [docs/testing.md](docs/testing.md).

- **API 통합 테스트**(`apps/api/test/*.test.mjs`): 격리된 로컬 D1로 `wrangler dev`를 자동 기동해
  인증·부대·휴가·출타 인원·**접속 로그**·**푸시 이벤트**·**보관 기간 정리**를 Node 내장 러너로 검증(추가 의존성 없음).
- **웹 e2e**(Playwright): `pnpm --filter @leave/web test:e2e`
  (사전 1회: `pnpm add -D @playwright/test && npx playwright install chromium`). 설정은 `apps/web/playwright.config.ts`.
- **앱 e2e**(Maestro): `apps/native/.maestro/README.md` 참고.
- API 문서: http://localhost:8787/docs (OpenAPI 자동 생성)
- 전체 타입체크/빌드: `pnpm check-types` / `pnpm build`

## 배포 (Cloudflare)

세 워커는 각각 아래 커스텀 도메인으로 나갑니다. 도메인은 `wrangler.jsonc`의
`routes`(`custom_domain: true`)에 선언돼 있어, 배포할 때 wrangler가 DNS 레코드와
인증서를 자동으로 만듭니다. `moveto.kr` 존이 배포 계정에 있어야 합니다.

| 워커                    | 도메인                          |
| ----------------------- | ------------------------------- |
| `leave-web` (사용자 웹) | `https://leave.moveto.kr`       |
| `leave-admin` (관리자)  | `https://admin.leave.moveto.kr` |
| `leave-api` (API·문서)  | `https://api.leave.moveto.kr`   |

```bash
# 1. 리소스 생성 (최초 1회)
cd apps/api
npx wrangler d1 create leave-db          # 출력된 database_id를 wrangler.jsonc에 반영
npx wrangler kv namespace create CACHE   # 출력된 id를 wrangler.jsonc의 kv_namespaces에 반영

# 2. 배포 — 바뀐 앱만 올립니다. `run`이 반드시 필요합니다(아래 주의 참고).
pnpm --filter @leave/api   run deploy   # ⚠ 운영 D1 마이그레이션을 먼저 돌립니다
pnpm --filter @leave/web   run deploy   # API 주소는 apps/web/.env.production에서 주입
pnpm --filter @leave/admin run deploy
```

`run` 없이 `pnpm --filter @leave/web deploy`를 치면 `ERR_PNPM_INVALID_DEPLOY_TARGET`으로
죽습니다. `deploy`가 pnpm 내장 명령과 이름이 겹치기 때문이며, 오류 메시지는 스크립트와
무관해 보입니다.

`@leave/api`의 `deploy`는 `db:migrate:remote && wrangler deploy`라 **운영 D1에 마이그레이션이
먼저 돕니다.** 올리기 전에 `npx wrangler d1 migrations list leave-db --remote`로 미적용분을
확인하세요.

**무엇을 올릴지는 `apps/` diff만으로 정할 수 없습니다.** `packages/shared`는 api·web·admin·native
전부에, `packages/client`는 web·native에 들어갑니다. 이 전파를 놓쳐 관리자 앱이 stale로 남은
적이 있습니다. 판단 절차와 배포 후 검증 방법은 `deploy-web` skill에 정리돼 있습니다.

API의 `CORS_ORIGIN`은 `apps/api/wrangler.jsonc`에서 `https://leave.moveto.kr`로
좁혀 두었습니다(관리자 앱은 자기 워커에서 `/api/*`를 처리하므로 CORS 대상이 아니고,
네이티브 앱은 브라우저 CORS 대상이 아닙니다).

### 앱 스토어 배포 (EAS)

**OTA로 되면 OTA로 하고, fingerprint가 갈라졌을 때만 새 빌드를 냅니다.**
`runtimeVersion.policy`가 `"fingerprint"`라, 발행 전에 작업 트리의 fingerprint가 현재 스토어
빌드와 같은지 확인하면 OTA가 닿을지 미리 알 수 있습니다.

```bash
cd apps/native

# 1. 판단 — 두 플랫폼의 fingerprint를 현재 스토어 빌드의 Runtime Version과 비교
npx expo-updates fingerprint:generate --platform ios      # android도 따로
npx eas build:list --platform all --status finished --limit 8   # tail로 자르지 말 것

# 2-a. 일치 → OTA
npx eas workflow:run publish-update.yml

# 2-b. 불일치 → 새 빌드 + 제출
pnpm eas:build --platform all --profile production
pnpm eas:submit --profile production
```

**로컬 `pnpm eas:update:*`는 aarch64 개발 머신에서 동작하지 않습니다.** `hermes-compiler`가
x86-64 바이너리만 담고 있어 export가 `ELF: not found`로 죽습니다. 그래서 OTA 발행은
`.eas/workflows/publish-update.yml`로 EAS 서버에 맡깁니다. `eas build`는 서버가 직접
번들하므로 영향이 없습니다.

지금 기기에서 돌고 있는 빌드와 OTA는 **프로필 탭 맨 아래**에 표시됩니다.
전체 절차와 함정은 `deploy-app` skill에 정리돼 있습니다.

`eas` 를 직접 부르면 production 프로파일에서 "Detected that your app uses Expo Go for development" 경고가 뜹니다. 위 스크립트가 `EAS_BUILD_NO_EXPO_GO_WARNING=true` 를 붙여 이를 억제합니다(`eas.json` 의 `env` 로는 억제되지 않음 — 그 값은 빌드 서버로만 전달되고 경고는 로컬 CLI가 출력).

푸시 알림은 실기기 + EAS projectId가 있어야 동작합니다. 시뮬레이터/권한 거부 시 앱은 푸시 없이 정상 동작하며, 인앱 알림 목록은 항상 제공됩니다.

Expo Insights는 새 네이티브 빌드부터 앱 콜드 스타트 사용량을 자동 집계합니다. 네이티브 모듈·권한·Expo SDK가 바뀌면 OTA 대신 새 스토어 빌드가 필요합니다 — 그래서 네이티브 의존성은 버전을 고정해 둡니다(`apps/native/AGENTS.md`). 업데이트는 앱 실행 시 내려받아 **다음 재시작부터** 적용되므로, 기기에서 확인하려면 재시작이 두 번 필요합니다.

## 동작 규칙 요약

- 하루 허용 출타 인원 = `floor(부대원 수 × 분자/분모)`. 초과일 = 그 날짜의 (중복 제거된) 휴가자 수가 허용 인원을 넘는 날.
- 휴가 등록/수정 시 서버가 초과일을 계산해 응답(`exceededDates`)으로 돌려주고, 초과일에 휴가가 겹치는 부대원 전원에게 알림을 생성합니다.
- 친구 달력은 수락된 관계를 모든 요청에서 서버가 다시 확인하며 `shared`, `requested`, `approved`, `completed` 상태의 사용자 ID·표시명·기간·상태만 반환합니다. 제목·사유·재원·부대·개인 일정은 반환하지 않습니다.
- 개인 일정은 `personal_events`에 별도로 저장되고 소유자만 CRUD할 수 있어 휴가 계산 쿼리와 구조적으로 분리됩니다.
- 전역 예정일은 군별 표준 복무기간(육군 18개월·해군 20개월·공군 21개월)의 마지막 날, 즉 입대일에 해당하는 날의 전날로 계산합니다. 마지막 달에 해당일이 없으면 그 달의 말일을 사용합니다.
- 계급은 진급 최저복무기간(이병 2개월·일병 6개월·상병 6개월)을 채운 뒤 처음 도래하는 매월 1일에 진급하는 표준 일정으로 계산하되, 가입 시 등록한 계급이 더 높으면 하한으로 유지합니다(조기 진급 대응). 날짜는 모두 한국 시간 기준 `YYYY-MM-DD`로 처리합니다.

## 개인정보 · 접속 기록 (동의 기반)

- 가입 시 **개인정보 수집·이용 동의**를 필수로 받습니다(웹·앱 회원가입 마지막 단계, 서버 스키마에서도 강제). 동의 시각은 `users.consented_at`에 저장됩니다.
- **접속 기록**(`access_logs`): 모든 요청의 접속 시각·메서드·경로·상태·플랫폼(`X-Client-Platform`)·앱 버전(`X-Client-Version`)·IP/국가(Cloudflare 헤더)를 남깁니다. 응답을 막지 않도록 `waitUntil`로 비동기 저장하며, 요청 본문·비밀번호 등 민감정보는 담지 않습니다.
- **푸시 로그**(`push_logs`): 서버 발송(`send`) 결과와, 앱이 자가 보고한 수신(`receipt`)·열람(`open`)을 남깁니다. 수신/열람은 **이 앱이 보낸 알림**만 대상이며 기기의 다른 앱 알림은 수집하지 않습니다.
- **열람권**: `GET /auth/activity`로 본인의 접속·푸시 기록을 최근순 최대 50건씩 열람할 수 있습니다.
- **친구·개인 일정**: 친구 요청/관계와 개인 일정은 탈퇴 시 삭제됩니다. 개인 일정은 다른 사용자·친구·관리자 UI에 노출하지 않습니다.

## 성능 (Cloudflare KV)

- 부대 **달력**은 여러 D1 조회 + 출타 인원 계산이 필요한 읽기 위주 응답이라 KV(`CACHE`)로 캐싱합니다.
- 무효화는 **부대별 버전 토큰**으로 처리합니다 — 휴가 등록/수정/삭제, 부대 가입/탈퇴 시 버전을 새로 발급해 이전 캐시를 무효화하고, 남은 키는 짧은 TTL(60초)로 소멸합니다.
