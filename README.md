# 리브 (Leave)

군 병사들이 부대별로 휴가를 계획·공유하고, 날짜별 **출타율**(부대 인원 대비 휴가 인원 비율)이 한도를 넘는 날을 미리 확인하는 서비스.

- 회원가입 시 군종(육/해/공)·입대일·전역예정일·계급을 등록하면 복무기간에 따라 **계급이 자동 진급**됩니다 (이병 2개월 → 일병 6개월 → 상병 6개월 → 병장).
- 부대를 검색해 가입하거나, 없으면 **최대 출타율**(예: 전체 인원의 1/3)과 함께 새로 만들 수 있습니다.
- 부대 달력에서 부대원들의 휴가를 함께 보고, **출타율 초과일은 빨간색**으로 표시됩니다.
- 휴가 등록으로 특정 날짜의 출타율이 초과되면, 그 날짜에 휴가가 걸린 모든 부대원에게 **인앱 + Expo 푸시 알림**이 전송됩니다.

## 구조 (Turborepo + pnpm)

| 경로 | 내용 | 스택 |
|---|---|---|
| `apps/api` | 백엔드 API | Hono + Cloudflare Workers, D1(Drizzle), R2, `@hono/zod-openapi` (문서 자동 생성 `/docs`), Hono Stack RPC |
| `apps/web` | 웹 앱 | Vite + React SPA, Jotai, TanStack Query, Cloudflare Workers 정적 에셋 배포 |
| `apps/native` | iOS/Android 앱 | Expo SDK 57, expo-router(NativeTabs — iOS 26 Liquid Glass), expo-notifications, iPad 대응 |
| `packages/shared` | 공유 도메인 로직 | 계급 자동진급 계산, 출타율 계산, zod 스키마, 날짜/달력 유틸 + vitest 테스트 |

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

- API 문서: http://localhost:8787/docs (OpenAPI 자동 생성)
- 도메인 로직 테스트: `pnpm test` (packages/shared vitest)
- API 통합 시나리오: API 기동 후 `bash apps/api/scripts/integration.sh`
  (가입 → 부대 생성(1/3) → 휴가 겹침 → 초과일/알림 검증)
- 전체 타입체크/빌드: `pnpm check-types` / `pnpm build`

## 배포 (Cloudflare)

```bash
# 1. 리소스 생성
cd apps/api
npx wrangler d1 create leave-db      # 출력된 database_id를 wrangler.jsonc에 반영
npx wrangler r2 bucket create leave-images

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
npx eas build --platform all
```

푸시 알림은 실기기 + EAS projectId가 있어야 동작합니다. 시뮬레이터/권한 거부 시 앱은 푸시 없이 정상 동작하며, 인앱 알림 목록은 항상 제공됩니다.

## 동작 규칙 요약

- 하루 허용 출타 인원 = `floor(부대원 수 × 분자/분모)`. 초과일 = 그 날짜의 (중복 제거된) 휴가자 수가 허용 인원을 넘는 날.
- 휴가 등록/수정 시 서버가 초과일을 계산해 응답(`exceededDates`)으로 돌려주고, 초과일에 휴가가 겹치는 부대원 전원에게 알림을 생성합니다.
- 계급은 입대일 기준 표준 일정으로 계산하되, 가입 시 등록한 계급이 더 높으면 하한으로 유지합니다(조기 진급 대응). 날짜는 모두 한국 시간 기준 `YYYY-MM-DD`로 처리합니다.
