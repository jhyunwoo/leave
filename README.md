# 리브 (Leave)

군 병사들이 부대별로 휴가를 계획·공유하고, 날짜별 **출타율**(부대 인원 대비 휴가 인원 비율)이 한도를 넘는 날을 미리 확인하는 서비스.

- 회원가입 시 군종(육/해/공)·입대일·전역예정일·계급을 등록하면 복무기간에 따라 **계급이 자동 진급**됩니다 (이병 2개월 → 일병 6개월 → 상병 6개월 → 병장).
- 부대를 검색해 가입하거나, 없으면 **최대 출타율**(예: 전체 인원의 1/3)과 함께 새로 만들 수 있습니다.
- 부대 달력에서 부대원들의 휴가를 함께 보고, **출타율 초과일은 빨간색**으로 표시됩니다.
- 휴가 등록으로 특정 날짜의 출타율이 초과되면, 그 날짜에 휴가가 걸린 모든 부대원에게 **인앱 + Expo 푸시 알림**이 전송됩니다.
- 서비스 운영·보안을 위해 가입 시 동의를 받아 **접속 기록**(접속 시각·경로·플랫폼·앱 버전 등)과 이 앱 푸시의 **발송·수신·열람 로그**를 남기며, 사용자는 `GET /auth/activity`로 자신의 기록을 **직접 열람**할 수 있습니다(개인정보 열람권).

review@leave.app / reviewpass123

## 구조 (Turborepo + pnpm)

| 경로 | 내용 | 스택 |
|---|---|---|
| `apps/api` | 백엔드 API | Hono + Cloudflare Workers, D1(Drizzle), R2, **KV 캐시**, 접속/푸시 로깅, `@hono/zod-openapi` (문서 자동 생성 `/docs`), Hono Stack RPC |
| `apps/web` | 웹 앱 | Vite + React SPA, Jotai, TanStack Query, Cloudflare Workers 정적 에셋 배포, Playwright e2e |
| `apps/native` | iOS/Android 앱 | Expo SDK 57, expo-router(NativeTabs — iOS 26 Liquid Glass), expo-notifications, iPad 대응, Maestro e2e |
| `packages/shared` | 공유 도메인 로직 | 계급 자동진급 계산, 출타율 계산, zod 스키마, 날짜/달력 유틸, 공용 HTTP 유틸(`unwrap`/`ApiError`) + vitest 테스트 |

타입 안정성: `apps/api`가 `AppType`을 export → 웹/앱이 `hc<AppType>()`로 타입 안전 RPC 클라이언트 사용. 디자인은 `DESIGN.md`(Wise 스타일) 토큰을 웹·앱이 공유합니다.

## 로컬 개발

```bash
pnpm install

# 1. API (D1/R2 로컬 에뮬레이션) — http://localhost:8787
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

> 참고: 이 저장소는 `pnpm-workspace.yaml`에 `verifyDepsBeforeRun: false`를 두어
> `pnpm run`/`turbo` 실행마다 자동 `pnpm install`이 도는 것을 끕니다(스토어 버전 불일치 환경 대응).

### 테스트

```bash
pnpm test                        # 전체 테스트 (Turborepo 캐시)
pnpm test --filter @leave/shared # 도메인·유틸 단위 테스트 (vitest, 44개)
pnpm test --filter @leave/api    # API 통합 테스트 (TDD, 19개)
```

- **API 통합 테스트**(`apps/api/test/*.test.mjs`): 격리된 로컬 D1로 `wrangler dev`를 자동 기동해
  인증·부대·휴가·출타율·**접속 로그**·**푸시 이벤트**·**달력 캐시 무효화**를 Node 내장 러너로 검증(추가 의존성 없음).
- **웹 e2e**(Playwright): `pnpm --filter @leave/web test:e2e`
  (사전 1회: `pnpm add -D @playwright/test && npx playwright install chromium`). 설정은 `apps/web/playwright.config.ts`.
- **앱 e2e**(Maestro): `apps/native/.maestro/README.md` 참고.
- API 문서: http://localhost:8787/docs (OpenAPI 자동 생성)
- 레거시 통합 스크립트: API 기동 후 `bash apps/api/scripts/integration.sh`
- 전체 타입체크/빌드: `pnpm check-types` / `pnpm build`

## 배포 (Cloudflare)

```bash
# 1. 리소스 생성
cd apps/api
npx wrangler d1 create leave-db          # 출력된 database_id를 wrangler.jsonc에 반영
npx wrangler r2 bucket create leave-images
npx wrangler kv namespace create CACHE   # 출력된 id를 wrangler.jsonc의 kv_namespaces에 반영

# 2. API 배포 + 원격 마이그레이션
pnpm db:migrate:remote
pnpm deploy

# 3. 웹 배포 (배포된 API 주소를 빌드에 주입)
cd apps/web
VITE_API_URL=https://leave-api.<계정>.workers.dev pnpm deploy
# 배포 후 apps/api/wrangler.jsonc의 CORS_ORIGIN을 웹 주소로 좁히는 것을 권장
```

### 앱 스토어 배포 (EAS)

```bash
cd apps/native
npx eas init                          # projectId 발급 (푸시 토큰 발급에 필요)
pnpm eas:build --platform all         # = EAS_BUILD_NO_EXPO_GO_WARNING=true eas build
pnpm eas:update:preview --message "변경 내용"
pnpm eas:update:production --message "변경 내용"
```

`eas` 를 직접 부르면 production 프로파일에서 "Detected that your app uses Expo Go for development" 경고가 뜹니다. 위 스크립트가 `EAS_BUILD_NO_EXPO_GO_WARNING=true` 를 붙여 이를 억제합니다(`eas.json` 의 `env` 로는 억제되지 않음 — 그 값은 빌드 서버로만 전달되고 경고는 로컬 CLI가 출력).

푸시 알림은 실기기 + EAS projectId가 있어야 동작합니다. 시뮬레이터/권한 거부 시 앱은 푸시 없이 정상 동작하며, 인앱 알림 목록은 항상 제공됩니다.

Expo Insights는 새 네이티브 빌드부터 앱 콜드 스타트 사용량을 자동 집계합니다. OTA 업데이트는 먼저 `preview` 채널에서 검증한 뒤 같은 커밋을 `production` 채널에 발행합니다. 네이티브 모듈·권한·Expo SDK가 바뀌면 OTA 대신 새 스토어 빌드가 필요하며, 업데이트는 앱 실행 시 내려받아 다음 재시작부터 적용됩니다.

## 동작 규칙 요약

- 하루 허용 출타 인원 = `floor(부대원 수 × 분자/분모)`. 초과일 = 그 날짜의 (중복 제거된) 휴가자 수가 허용 인원을 넘는 날.
- 휴가 등록/수정 시 서버가 초과일을 계산해 응답(`exceededDates`)으로 돌려주고, 초과일에 휴가가 겹치는 부대원 전원에게 알림을 생성합니다.
- 전역 예정일은 군별 표준 복무기간(육군 18개월·해군 20개월·공군 21개월)의 마지막 날, 즉 입대일에 해당하는 날의 전날로 계산합니다. 마지막 달에 해당일이 없으면 그 달의 말일을 사용합니다.
- 계급은 진급 최저복무기간(이병 2개월·일병 6개월·상병 6개월)을 채운 뒤 처음 도래하는 매월 1일에 진급하는 표준 일정으로 계산하되, 가입 시 등록한 계급이 더 높으면 하한으로 유지합니다(조기 진급 대응). 날짜는 모두 한국 시간 기준 `YYYY-MM-DD`로 처리합니다.

## 개인정보 · 접속 기록 (동의 기반)

- 가입 시 **개인정보 수집·이용 동의**를 필수로 받습니다(웹·앱 회원가입 마지막 단계, 서버 스키마에서도 강제). 동의 시각은 `users.consented_at`에 저장됩니다.
- **접속 기록**(`access_logs`): 모든 요청의 접속 시각·메서드·경로·상태·플랫폼(`X-Client-Platform`)·앱 버전(`X-Client-Version`)·IP/국가(Cloudflare 헤더)를 남깁니다. 응답을 막지 않도록 `waitUntil`로 비동기 저장하며, 요청 본문·비밀번호 등 민감정보는 담지 않습니다.
- **푸시 로그**(`push_logs`): 서버 발송(`send`) 결과와, 앱이 자가 보고한 수신(`receipt`)·열람(`open`)을 남깁니다. 수신/열람은 **이 앱이 보낸 알림**만 대상이며 기기의 다른 앱 알림은 수집하지 않습니다.
- **열람권**: `GET /auth/activity`로 본인의 접속·푸시 기록을 최근순 최대 50건씩 열람할 수 있습니다.

## 성능 (Cloudflare KV)

- 부대 **달력**은 여러 D1 조회 + 출타율 계산이 필요한 읽기 위주 응답이라 KV(`CACHE`)로 캐싱합니다.
- 무효화는 **부대별 버전 토큰**으로 처리합니다 — 휴가 등록/수정/삭제, 부대 가입/탈퇴 시 버전을 새로 발급해 이전 캐시를 무효화하고, 남은 키는 짧은 TTL(60초)로 소멸합니다.
