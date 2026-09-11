---
name: deploy-app
description: Ship the Expo native app (apps/native) — decide between an OTA update and a full EAS build, then publish and verify it reached users. Use when asked to deploy, ship, release, or update the mobile app; to publish an OTA/expo-update; to run an EAS build or submit; or to check whether the last app deploy actually reached store users. Covers the fingerprint runtimeVersion policy that decides OTA vs rebuild, the EAS free-plan CI/CD minute limit that silently blocks the workflow path, the working-tree hazard when several agent sessions share the repo, and the verification steps that avoid false positives.
---

# 네이티브 앱 배포 (EAS)

**원칙: OTA로 되면 OTA로 한다. 새 빌드는 fingerprint가 갈라졌을 때만 한다.**
빌드는 스토어 심사를 거쳐야 사용자에게 닿고, OTA는 몇 분이면 닿는다.

`app.json`의 `runtimeVersion.policy`가 `"fingerprint"`다. OTA는 **runtimeVersion이 정확히
같은 빌드에만** 배달된다. 그래서 모든 판단이 fingerprint 비교 하나로 정리된다.

## 1. 판단: OTA인가 새 빌드인가

**발행 전에 확인한다. 올린 뒤에 확인하면 늦다.**

```bash
cd apps/native

# (1) 작업 트리의 fingerprint — 플랫폼마다 다르다. 둘 다 뽑는다.
for p in ios android; do
  echo -n "$p: "
  npx expo-updates fingerprint:generate --platform $p 2>/dev/null \
    | python3 -c "import sys,json;print(json.load(sys.stdin)['hash'])"
done

# (2) 현재 스토어에 나가 있는 빌드의 Runtime Version
npx eas build:list --platform all --status finished --limit 8 \
  | grep -E "^(Platform|Status|Runtime Version|Version|Build number|Version code|Commit|Started at)"
```

> ⚠️ **`eas build:list` 출력을 `| tail`로 자르지 마라.** 최신순으로 나오므로 tail은
> **가장 새 항목을 버린다.** 이걸로 옛 빌드를 최신으로 잘못 읽고 "OTA가 안 닿는다"고
> 오판한 적이 있다. `grep`으로 필드만 뽑아 **전체를** 본다.

> ⚠️ **비교 기준은 "직전 업데이트"가 아니라 "현재 스토어 빌드"다.** `eas update:list`의
> 직전 항목과 비교하면 그사이 새 네이티브 빌드가 올라갔을 때 fingerprint가 당연히 다르고,
> 그건 정상이다. 이걸로 오탐이 난 적이 있다.

- **두 플랫폼 다 일치 → OTA (§2)**
- **하나라도 불일치 → 새 빌드 (§3)**. 먼저 무엇이 갈라졌는지 본다:
  `npx eas fingerprint:compare --build-id <빌드ID>`

### fingerprint를 바꾸는 것 / 안 바꾸는 것

실제로 해싱되는 소스는 49개뿐이다(`fingerprint:generate` 출력의 `sources`로 확인 가능).

| 바꾼다 → 새 빌드 필요                           | 안 바꾼다 → OTA 가능                          |
| ----------------------------------------------- | --------------------------------------------- |
| autolink되는 네이티브 모듈의 **버전**           | `src/**` 전부 (JS·TSX)                        |
| `app.json`, `eas.json`, `.gitignore`            | `packages/*`의 소스와 `exports` 필드          |
| 아이콘·스플래시 이미지                          | `pnpm-lock.yaml`                              |
| config plugin (`expo-build-properties` 등)      | `package.json`의 `dependencies` **블록 자체** |
| **`apps/native/package.json`의 `scripts` 블록** |                                               |

> 🚫 **`apps/native/package.json`의 `scripts`를 건드리지 마라.**
> `@expo/fingerprint`가 `JSON.stringify(scripts)`를 그대로 해싱한다
> (`build/sourcer/Bare.js`의 `normalizePackageJsonScriptSources`). 스크립트 한 줄 추가가
> runtimeVersion을 바꿔 **기존 스토어 사용자 전원에게 OTA가 끊긴다.** 배포용 스크립트가
> 필요하면 루트 `package.json`이나 `scripts/`에 둔다.

> 📌 `apps/native/package.json`의 네이티브 의존성은 **`^` 없이 정확히 고정**돼 있다.
> `^`가 붙어 있으면 `pnpm update` 한 번에 조용히 fingerprint가 갈라진다.
> 고정 목록과 이유는 `apps/native/AGENTS.md`에 있다. 이 목록을 올렸으면 OTA가 아니라 새 빌드다.
> (버전 범위만 `^57.0.14` → `57.0.14`로 조이는 것 자체는 fingerprint에 영향이 없다 — 실측 확인함.)

## 2. OTA 발행

### 발행 직전에 `git status`부터 본다

```bash
git status --short   # 비어 있어야 한다
```

**`eas update`는 커밋이 아니라 워킹 트리를 번들한다.** 이 레포에서는 여러 에이전트 세션이
같은 트리를 동시에 쓰므로, 내 커밋이 깨끗해도 **남의 미커밋 변경이 내 OTA에 실려 나간다.**
실제로 그렇게 나간 적이 있다 — 발행 로그의 `Commit <sha>` 뒤에 붙는 **`*`가 그 신호**이고,
그때는 이미 늦다(되돌리려면 `eas update:republish`로 직전 그룹을 다시 포인트해야 한다).
`git status`가 안 비어 있으면 **누구 것인지 확인하기 전에는 발행하지 않는다.**

### 두 경로가 있고, 무료 플랜에서는 wrapper가 기본이다

```bash
pnpm native:eas:update:production          # ① 로컬 발행 (기본)
cd apps/native && npx eas workflow:run publish-update.yml   # ② EAS 서버 (CI/CD 분 소모)
```

**② 워크플로는 EAS 무료 플랜의 CI/CD 분을 쓴다. 한도(월 60분)가 차면 잡이 0.2초 만에
시작도 못 하고 실패한다:**

```
Failed to start job
Free plan CI/CD 60 minute limit reached. CI/CD minutes reset on <날짜>.
```

`workflow:runs`로만 보이는 실패라 `update:list`를 아무리 봐도 "왜 안 올라오지"가 된다.
**발행이 안 보이면 먼저 `npx eas workflow:runs`로 잡 상태를 본다.**

```bash
npx eas workflow:runs            # Status FAILURE면 아래로 원인 확인
npx eas workflow:view <run-id>   # Errors에 사유가 찍힌다
```

① wrapper는 로컬에서 번들하므로 CI/CD 분을 쓰지 않는다. `docs/native-observability.md`가
정본으로 지정한 경로이고, 워크플로와 같은 일을 한다(preflight → update → 소스맵 업로드).

> 예전 이 문서는 "호스트가 aarch64라 로컬 `eas update`가 `hermesc: ELF: not found`로 죽으니
> 워크플로가 유일한 경로"라고 적고 있었다. **지금 호스트는 x86_64이고 번들된
> `hermesc/linux64-bin`이 정상 실행된다** — 그 제약은 이 머신에 없다. 다른 머신으로 옮겼을 때만
> 다시 확인하면 된다(`uname -m`).

### wrapper가 CLI 문법에 묶여 있다

`eas-cli`는 이 레포 어디에도 고정돼 있지 않다(`package.json`·lockfile 모두 없음).
그래서 설치된 CLI가 바뀌면 wrapper가 조용히 깨진다. 실제로 겪은 것:

- `eas env:exec`는 환경을 **위치 인자**로 받는다(`eas env:exec production "<명령>"`).
  `--environment`로 주면 `Nonexistent flag`로 **preflight에서 즉사**한다.
  같은 값을 `eas update`는 **플래그**로 받는다 — 둘을 같은 모양으로 맞추고 싶어지지만 맞추면 깨진다.
- 비대화형 셸에서 `eas update`는 `--message` 없이는 시작하지 않는다. `--auto`는 메시지를
  만들어 주지만 **EAS 브랜치까지 git 브랜치 이름으로 잡아** 채널에 묶인 브랜치를 벗어난다.

둘 다 `scripts/eas-update-native.mjs`가 이미 처리한다. **`eas update`를 맨손으로 부르지 말고
wrapper를 쓴다.** CLI를 올렸다가 `Nonexistent flag`가 나오면 여기부터 의심한다.

### 메모리 — 한 번에 한 플랫폼씩, 포그라운드로

이 머신은 5.8GB다. **두 플랫폼을 한 번에 번들하면 Metro가 죽는다.** 백그라운드로 돌리면
에이전트 하니스의 메모리 감시가 회수해 `[killed]`만 남고 이유가 안 보인다. 실제로 세 번 죽었다.

```bash
cd apps/native && rm -rf dist
npx eas update --channel production --environment production --platform ios     --message "<커밋 제목>"
npx eas env:exec production "node ../../scripts/upload-sentry-update-artifacts.mjs dist"
rm -rf dist
npx eas update --channel production --environment production --platform android --message "<커밋 제목>"
npx eas env:exec production "node ../../scripts/upload-sentry-update-artifacts.mjs dist"
```

**소스맵 업로드는 플랫폼마다 `dist`가 덮이기 전에** 돌린다. fingerprint 정책이라 어차피
플랫폼별 별도 그룹이므로 나눠 발행해도 결과는 같다.

실패한 export는 `apps/native/dist/`와 **이름이 깨진 0바이트 파일**을 남긴다. 남아 있으면 다음
`workflow:run`이 압축 단계에서 `ENOENT ... lstat '…/<깨진이름>'`로 죽는다. 지우고 다시 돌린다:

```bash
rm -rf apps/native/dist
```

`eas build`는 EAS 서버가 직접 번들하므로 이 문제와 무관하다.

### 소스맵

워크플로 잡은 `environment: production`으로 EAS 환경변수를 받고
`upload_sentry_sourcemaps: true`로 Sentry 소스맵을 함께 올린다. **업로드가 실패하면 잡도 실패한다.**
이 값이 없으면 업로드 실패를 경고만 남기고 잡이 성공으로 끝나 고아 소스맵이 생긴다.
wrapper도 같은 순서로 올리고, 업로드가 실패하면 "발행은 됐지만 심볼이 없다"고 알리며 멈춘다.

발행 전에 환경변수가 있는지 먼저 본다:

```bash
npx eas env:list --environment production   # DSN·SENTRY_ORG·SENTRY_PROJECT·SENTRY_AUTH_TOKEN
```

없으면 OTA는 나가도 스택 트레이스가 안 풀린다.

### 발행 후 확인

```bash
npx eas update:list --branch production --limit 4
```

**ios 그룹과 android 그룹이 둘 다** 떴는지, 각 Runtime Version이 §1에서 뽑은 해시와 같은지 본다.
fingerprint 정책이라 플랫폼마다 runtime이 달라 **별도 그룹으로 발행된다.**

> ⚠️ `eas branch:list`의 요약은 **한 플랫폼만 보여준다.** 이것만 보고 "iOS가 빠졌다"고 판단하면 틀린다.
> 반드시 `update:list --branch`로 본다.

사용자에게 닿는 시점: `reloadAsync()` 배선이 없어서 **다음 실행에 내려받고 그다음 실행에 적용된다
(재시작 2번).** "지금 바로 보인다"고 말하지 않는다.

## 3. 새 빌드 + 제출

```bash
cd apps/native
pnpm eas:build --platform all --profile production
pnpm eas:submit --profile production
```

- `pnpm eas:build`가 `EAS_BUILD_NO_EXPO_GO_WARNING=true`를 붙인다. `eas`를 직접 부르면
  production 프로파일에서 Expo Go 경고가 뜬다(`eas.json`의 `env`로는 안 눌린다 — 그 값은
  빌드 서버로만 가고 경고는 로컬 CLI가 낸다).
- 빌드번호는 `eas.json`의 `appVersionSource: "remote"` + `autoIncrement`로 EAS가 매긴다.
  `app.json`에 `ios.buildNumber`·`android.versionCode`가 없는 건 의도된 것이니 넣지 마라.
- 제출 대상: iOS는 App Store Connect(`ascAppId: 6792287152`), Android는 Play **`internal`** 트랙.
- 빌드 로그에서 **Sentry 심볼 업로드가 실제로 돌았는지** 본다: iOS는 `Upload Debug Symbols to
Sentry` 페이즈, Android는 Sentry Gradle 태스크(mapping/native symbols). 여기서 실패하면 이벤트는
  올라와도 스택이 안 풀린다. 자격 증명은 EAS 환경변수에서 온다(위 §2의 `eas env:list`).

빌드가 끝나면 새 Runtime Version이 §1의 fingerprint와 같은지 확인한다. 다르면 빌드 사이에
트리가 바뀐 것이다.

**보고할 때**: 빌드·제출은 배포가 아니다. 스토어 심사를 통과해야 사용자에게 닿는다.
**"배포 완료"가 아니라 "빌드·제출 완료, 심사 대기"로 적는다.**

## 4. 기기에서 확인

프로필 탭 맨 아래에 지금 실행 중인 빌드와 OTA가 찍힌다
(`apps/native/src/components/build-info.tsx`):

```
앱 1.0.0 (25) · 런타임 3cc84ac
OTA 6cb16632 · 08-22 12:41 (production)
```

`런타임`이 §1에서 뽑은 해시와 같고 `OTA`가 방금 발행한 것이면 실제로 닿은 것이다.
`OTA 없음 (내장)`이면 아직 내장 번들로 실행 중이다(재시작 한 번 더 필요하거나 개발 빌드다).

## 함정

- **의존성 업그레이드 커밋("update packages" 류)이 네이티브 모듈을 건드리면 그 이후 OTA는
  기존 스토어 사용자에게 한 명도 안 닿는다.** 새 빌드가 있어야 닿는다. 실제로 그 상태였던 적이 있다.
- 옛 빌드에 남아 있는 사용자는 스토어 업데이트를 받아야 이 OTA의 대상이 된다.
- `apps/native`엔 단위 테스트가 없다. 게이트는 `check-types` + `lint`이고, 중요한 흐름은
  Maestro(`.maestro/`)다. `docs/testing.md` 참조.
- `expo-router`의 `typedRoutes` 생성물(`.expo/types/router.d.ts`)은 gitignore라 낡을 수 있다.
  라우트를 추가한 뒤 `check-types`가 엉뚱한 경로 오류를 내면 `npx expo start`를 잠깐 띄워 재생성한다.
- 인증은 EAS `jhyunwoo` 계정으로 되어 있다.
- **`closed-test`는 EAS 커스텀 환경이라 현재 플랜에서 변수를 못 넣는다**(Production/Enterprise 전용).
  `closed` 프로파일과 `pnpm native:eas:update:closed`는 Sentry 변수 preflight에서 막힌다.
- **`eas-cli`가 레포에 고정돼 있지 않다.** 설치된 버전이 바뀌면 wrapper의 CLI 문법이 조용히
  깨진다(§2). 재현되면 고정하는 것을 검토한다.
- **여러 에이전트 세션이 한 트리를 공유한다.** 발행은 커밋이 아니라 트리를 번들하므로
  `git status`를 발행 직전에 본다(§2). 커밋 해시 뒤의 `*`가 더티 트리 신호다.

Cloudflare 워커(web·api·admin) 배포는 **`deploy-web`** 을 쓴다. `packages/shared`나
`packages/client`를 고쳤으면 **양쪽 다** 배포 대상이다.
