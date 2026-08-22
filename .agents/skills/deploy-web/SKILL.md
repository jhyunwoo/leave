---
name: deploy-web
description: Deploy the Cloudflare Workers apps in this repo (leave-api, leave-web, leave-admin) and verify the deploy actually landed. Use when asked to deploy, ship, or release the web app, admin app, or API; when asked whether the deployed site is up to date; or after changing anything under apps/api, apps/web, apps/admin, packages/shared, or packages/client. Covers which apps a change actually requires deploying, the pnpm `run` collision, the production-D1 migration hazard, and how to confirm the live bundle matches what you built.
---

# 웹·API·관리자 배포 (Cloudflare Workers)

워커 3개가 각각 커스텀 도메인으로 나간다. **staging이 없다 — 배포는 전부 프로덕션 직행이다.**

| 워커          | 도메인                          | 특징                                                     |
| ------------- | ------------------------------- | -------------------------------------------------------- |
| `leave-api`   | `https://api.leave.moveto.kr`   | ⚠️ 배포가 **운영 D1 마이그레이션**을 먼저 돌린다         |
| `leave-web`   | `https://leave.moveto.kr`       | 정적 자산 전용 워커(`main` 없음), SPA 폴백               |
| `leave-admin` | `https://admin.leave.moveto.kr` | api와 **같은 D1·KV를 공유**, `/api/*`는 자기 워커가 처리 |

## 1. 무엇을 올릴지 정한다

**`git diff --name-only <기준>..HEAD | grep ^apps/` 만 보면 틀린다.** workspace 패키지가
앱으로 전파되기 때문이다. 실제로 이 함정 때문에 `apps/admin`이 조용히 stale이었다
(`apps/admin/**`엔 diff가 없는데 `@leave/shared`가 바뀐 상태였다).

전파 규칙:

```
packages/shared  →  api · web · admin · native
packages/client  →  web · native
apps/<x>         →  그 앱
```

```bash
# 마지막 배포 기준 커밋부터 무엇이 바뀌었는지
git diff --name-only <기준커밋>..HEAD \
  | awk -F/ '$1=="apps"||$1=="packages"{print $1"/"$2}' | sort -u
```

`packages/shared`가 나오면 **admin도 후보에 넣는다.** 확신이 안 서면 세 개를 다 올린다 —
워커 배포는 싸고, stale 배포를 못 알아채는 비용이 훨씬 크다.

## 2. 게이트

```bash
pnpm quality   # format:check → lint → types:check → check-types → test
```

CI가 없다. 이게 사실상 유일한 게이트다.

`wrangler.jsonc`를 고쳤으면 바인딩 타입부터 다시 만든다 (`types:check`가 드리프트에서 깨진다):

```bash
pnpm --filter @leave/api types
pnpm --filter @leave/admin types
```

## 3. 올린다

**`run`을 반드시 붙인다.**

```bash
pnpm --filter @leave/api   run deploy
pnpm --filter @leave/web   run deploy
pnpm --filter @leave/admin run deploy
```

`run` 없이 `pnpm --filter @leave/web deploy`를 치면
`ERR_PNPM_INVALID_DEPLOY_TARGET: This command requires one parameter`로 죽는다.
`deploy`가 pnpm 내장 명령(배포용 폴더 생성)과 이름이 겹쳐서다. **오류 메시지가 스크립트와
무관해 보여서 배포 설정이 깨진 줄 알고 헤매기 쉽다.**

루트에 배포를 묶는 스크립트는 없다. 앱마다 따로 친다.

### api를 올리기 전에

`@leave/api`의 `deploy`는 `pnpm db:migrate:remote && wrangler deploy`다.
**운영 D1에 마이그레이션이 먼저 돈다.** 이유 없이 api를 올리면 그것만으로 운영 스키마를 건드리는 셈이다.

```bash
npx wrangler d1 migrations list leave-db --remote   # 미적용분을 먼저 눈으로 본다
```

admin은 마이그레이션을 돌리지 않지만 같은 `leave-db`·같은 KV를 본다. 스키마를 바꿨으면
api를 먼저 올리고 admin을 올린다.

## 4. 진짜 올라갔는지 확인한다

배포 명령이 성공했다는 것과 사용자가 새 코드를 받는다는 것은 다르다. **반드시 확인한다.**

```bash
# web — 라이브 진입점 해시가 방금 빌드한 것과 같은가
curl -s https://leave.moveto.kr | grep -oE 'assets/index-[^."]+\.js'
ls apps/web/dist/assets/index-*.js
```

지연 로드 청크에만 있는 기능이면 진입점 해시로는 안 보인다. 청크까지 받아서 찾는다:

```bash
curl -s https://leave.moveto.kr/assets/index-<해시>.js -o /tmp/main.js
grep -ohE '[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.js' /tmp/main.js | sort -u \
  | while read f; do curl -s "https://leave.moveto.kr/assets/$f" -o "/tmp/c_$f"; done
grep -l "찾는문자열" /tmp/c_*.js
```

```bash
# api — 이번에 추가한 경로가 스키마에 있는가
curl -s https://api.leave.moveto.kr/openapi.json \
  | python3 -c "import sys,json; print(sorted(json.load(sys.stdin)['paths']))"

# admin
curl -s -o /dev/null -w "%{http_code}\n" https://admin.leave.moveto.kr/
```

배포 후 웹 요청의 `X-Client-Version`은 빌드 시점 커밋 해시다(`apps/web/vite.config.ts`가
`git rev-parse --short HEAD`를 주입한다). 접속 기록에서 어느 배포인지 이걸로 가른다.

## 함정

- **`store/legal/*`이나 `apps/web/public/*`만 고쳤어도 web 배포가 필요하다.** 정적 페이지
  (`privacy`·`terms`·`support`·`delete-account`)는 스토어 심사가 로그인 없이 200으로 열리는지 본다.
- **`.env.production`은 `VITE_API_URL` 하나뿐이고 빌드 시에만 주입된다.** 이 파일을 고치면
  turbo 캐시가 무효화되도록 `turbo.json`의 `build.inputs`에 `.env*`가 들어 있다.
- `apps/api`엔 `build` 스크립트가 없어서 turbo의 `deploy → dependsOn: ["build"]`는 api에선 무의미하다.
- 인증은 wrangler OAuth로 이미 되어 있다. 재로그인이 필요하면 사용자에게 `! npx wrangler login`을 부탁한다.

네이티브 앱 배포는 이 skill이 아니라 **`deploy-app`** 을 쓴다.
