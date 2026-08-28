# 네이티브 오류 관측

`apps/native`는 Sentry를 원격 오류·충돌 백엔드로 사용한다. Expo Insights는 기존의 앱 실행·업데이트 사용량 분석을 계속 맡고, Sentry에는 장애 진단에 필요한 저빈도 이벤트만 보낸다.

Expo SDK 57이 검증한 네이티브 모듈 버전은 `@sentry/react-native ~7.11.0`이다. 이 저장소는 fingerprint 런타임 정책 때문에 네이티브 의존성을 정확한 `7.11.0`으로 고정한다. Metro 설정은 Expo의 pnpm/모노레포 해석을 그대로 사용하고 Sentry Debug ID와 소스 맵 직렬화만 더한다.

## 오류 경로와 핸들러 소유권

초기화 순서는 다음과 같다.

```text
index.js
  -> observability/bootstrap (Sentry 초기화 시도)
  -> fatal-error.ts의 ErrorUtils 핸들러 설치
  -> Expo Router 모듈 평가
  -> RootErrorBoundary
       -> Router ErrorBoundary
```

Sentry의 `ReactNativeErrorHandlers` 통합은 `onerror: false`로 교체한다. 따라서 `ErrorUtils`의 소유자는 항상 기존 `fatal-error.ts` 하나뿐이며, Sentry가 나중에 덮어쓰지 않는다. Sentry 통합은 별도의 미처리 Promise 추적만 유지한다. 초기화·정제·전송 API는 모두 동기적인 fail-safe 경계로 감싸며, DSN이 없거나 SDK가 실패해도 앱 등록과 기존 오류 화면은 계속 동작한다.

- `RootErrorBoundary`: Router 위의 렌더 오류, 원본 `Error`와 React component stack을 보고하고 기존 복구 화면·SecureStore 기록을 유지한다.
- Expo Router `ErrorBoundary`: 라우트 트리 오류를 보고하되 `notify: false`로 Root 오버레이를 띄우지 않아 복구 UI가 두 개 생기지 않는다.
- 전역 `ErrorUtils`: 이벤트 핸들러·타이머·네이티브 콜백의 fatal/non-fatal JS 오류를 보고한 뒤 기존 fatal 복구 정책을 그대로 적용한다.
- 미처리 Promise: Sentry의 Promise 통합이 보고한다. `beforeSend`가 `unhandled_promise_rejection`으로 태깅한다.
- 중복 제거: 같은 오류 객체는 프로세스 생명 동안 한 번만, 원시 값은 10초 창에서 한 번만 원격 보고한다. 로컬 SecureStore 복구 기록은 이 정책과 독립적이다.
- 네이티브 충돌: Sentry Cocoa/Android SDK가 iOS·Android fatal crash를 디스크에 보관하고 다음 실행에 전송한다.

`error.source`는 `root_error_boundary`, `router_error_boundary`, `global_error_handler`, `handled_exception`, `network_failure`, `api_server_error`, `api_malformed_response`, `ota_update` 등으로 원인을 구분한다. Router가 아직 경로를 제공하지 못한 이벤트에는 `app.lifecycle_phase=startup`이 붙는다. Router가 마운트되면 실제 ID가 아닌 파일 기반 템플릿(예: `/leave/[leaveId]`)을 `app.route`로 사용한다.

## 수집 정책

원격 이슈로 보고하는 항목:

- JS fatal/non-fatal 예외, React 렌더 예외, 미처리 JS/Promise 오류
- 직접 `captureHandledError`로 지정한 예상 밖의 처리된 예외
- 온라인 상태에서의 transport 오류·timeout, HTTP 408·5xx
- 성공 응답의 JSON 디코딩 실패
- Expo Update check/download 및 emergency launch 실패
- iOS/Android native crash·native exception

HTTP 400/401/403/404/429 같은 정상적인 비즈니스 응답, 의도적인 abort/cancel, NetInfo가 확인한 오프라인 실패는 이슈로 만들지 않는다. HTTP 관측은 Hono 클라이언트의 단일 `fetch` 어댑터에서 수행하므로 TanStack Query에서 다시 보고하지 않는다. 요청 breadcrumb는 메서드, 템플릿 경로, 상태, 걸린 시간, 온라인 상태와 서버의 `x-request-id`/`x-correlation-id`/`cf-ray`만 포함한다. 동일 endpoint 오류는 30초 동안 rate-limit한다.

검색 가능한 기본 태그에는 다음이 포함된다.

- 앱 ID·버전·iOS build number/Android versionCode
- 플랫폼·React Native·Expo SDK 버전
- Expo runtime version, update ID/group/channel, embedded/OTA/emergency 여부
- 앱 foreground/background 상태, 네트워크 online/type
- 환경(`development`, `preview`, `closed-test`, `production`)과 route template

Sentry 네이티브 SDK가 생성하는 canonical `release`/`dist`를 덮어쓰지 않는다. 같은 마케팅 버전이라도 native build가 `dist`로 구분되고, OTA 코드는 Expo update/runtime 태그와 Debug ID로 구분된다.

## 환경 변수

EAS Dashboard의 네 환경 `development`, `preview`, `closed-test`, `production`에 알맞게 설정한다.

| 이름                                    | 분류                  | 용도                                                                |
| --------------------------------------- | --------------------- | ------------------------------------------------------------------- |
| `EXPO_PUBLIC_SENTRY_DSN`                | 공개 런타임 설정      | 기기에서 이벤트를 전송할 DSN. 앱 번들에 포함되어도 되는 ingest 주소 |
| `EXPO_PUBLIC_APP_ENV`                   | 공개 런타임 설정      | EAS 환경과 같은 환경 이름                                           |
| `SENTRY_AUTH_TOKEN`                     | **비밀 빌드 설정**    | Build/Update source map·symbol 업로드. 저장소·`.env`에 넣지 않는다  |
| `SENTRY_ORG`                            | 비공개 빌드 설정      | Sentry organization slug                                            |
| `SENTRY_PROJECT`                        | 비공개 빌드 설정      | Sentry project slug                                                 |
| `EXPO_PUBLIC_SENTRY_ENABLE_DEV`         | 선택 공개 개발 설정   | `true`일 때만 `__DEV__` 이벤트 전송                                 |
| `EXPO_PUBLIC_OBSERVABILITY_DIAGNOSTICS` | 선택 공개 테스트 설정 | 비프로덕션 진단 명령 노출. preview profile은 이미 `true`            |

정상 로컬 개발은 Sentry를 비활성화해 production noise를 만들지 않는다. 개발에서 실제 전송을 시험할 때만 DSN, `EXPO_PUBLIC_APP_ENV=development`, `EXPO_PUBLIC_SENTRY_ENABLE_DEV=true`, 진단 플래그를 제공한다. `SENTRY_AUTH_TOKEN`은 런타임 번들에 필요하지 않으며 `EXPO_PUBLIC_` 접두사를 절대로 붙이지 않는다. Self-hosted Sentry만 `SENTRY_URL`을 추가한다.

## 빌드, 심볼과 OTA

Expo config plugin이 CNG/prebuild 결과에 다음을 넣는다.

- iOS: React Native bundle source-map wrapper와 별도 dSYM/debug-file upload build phase
- Android: React Native bundle source-map task, Sentry Android Gradle Plugin, Proguard mapping과 native symbols upload

EAS Build 환경에 위 build 변수들이 있으면 preview/closed/production 빌드가 JS maps, iOS dSYM, Android mapping/native symbols를 업로드한다. `SENTRY_ALLOW_FAILURE`나 `SENTRY_DISABLE_AUTO_UPLOAD`을 설정하지 않는다. `@sentry/cli` install script는 pnpm `allowBuilds`에 명시되어 있다.

OTA는 반드시 저장소 루트의 다음 명령으로 낸다.

```bash
pnpm native:eas:update:closed
pnpm native:eas:update:preview
pnpm native:eas:update:production
```

wrapper는 선택한 EAS 환경에서 DSN/환경/업로드 자격 증명을 먼저 검사하고 `eas update --environment`를 실행한 뒤, 생성된 `dist`의 모든 bundle/map 짝과 Sentry Debug ID를 검증하고 `sentry-expo-upload-sourcemaps`를 실행한다. 업로드가 실패하면 update가 이미 publish됐다는 큰 오류와 non-zero exit를 남긴다. 이 경우 새 update를 계속 배포하지 말고 같은 `dist`와 환경으로 업로드를 재실행한다.

```bash
cd apps/native
pnpm exec eas env:exec --environment preview \
  'node ../../scripts/upload-sentry-update-artifacts.mjs dist'
```

Sentry 의존성·config plugin 추가는 Expo fingerprint를 바꾸므로 기존 바이너리에는 이 OTA를 보내지 않는다. 먼저 각 배포 채널의 새 native build를 설치해야 한다.

## 안전한 진단

진단 API는 production 환경에는 설치되지 않고, preview/development에서 진단 플래그가 켜졌을 때만 debugger console의 숨은 전역으로 제공된다.

```js
globalThis.__leaveObservabilityDiagnostics("handled_js");
globalThis.__leaveObservabilityDiagnostics("react_render");
globalThis.__leaveObservabilityDiagnostics("unhandled_js");
globalThis.__leaveObservabilityDiagnostics("unhandled_promise");
globalThis.__leaveObservabilityDiagnostics("network");
globalThis.__leaveObservabilityDiagnostics("native_crash");
```

마지막 명령은 앱 프로세스를 실제로 종료한다. preview 기기에서 저장하지 않은 작업이 없을 때만 실행한다. Expo Go가 아니라 Sentry native SDK를 포함한 development/preview build가 필요하다.

### Build source-map 검증

1. preview EAS build를 만들고 위 `handled_js` 또는 `react_render` 진단을 실행한다.
2. Sentry 이벤트가 원래 `src/lib/observability/diagnostics.ts` 또는 `observability-lifecycle.tsx` 파일과 정확한 TS/TSX 줄을 가리키는지 확인한다.
3. `release`, `dist`, `app.build`, `expo.runtime_version`, 환경이 build와 일치하는지 확인한다.
4. 이벤트의 user/request/breadcrumb/context를 열어 토큰·헤더·본문·이메일·도메인 데이터가 없는지 확인한다.

### OTA source-map 검증

1. 진단 메시지를 식별 가능하게 바꾼 controlled preview update를 `pnpm native:eas:update:preview`로 게시한다.
2. preview 기기에서 update를 적용하고 해당 진단을 실행한다.
3. Sentry에서 원본 TS/TSX 줄, `expo.update_id`, `expo.update_group_id`, `expo.update_channel=preview`가 EAS Update 상세와 일치하는지 확인한다.

### Native crash 검증

1. iOS와 Android preview build에서 각각 `native_crash`를 실행한다.
2. 앱을 다시 실행해 저장된 crash envelope 전송 시간을 준다.
3. Sentry에서 플랫폼·release/dist·app build를 확인한다.
4. iOS native frame에 dSYM missing 경고가 없고 함수/파일이 보이는지, Android frame에 mapping/native-symbol missing 경고가 없고 난독화가 해제됐는지 확인한다.
5. build number와 runtime fingerprint로 EAS Build 상세와 대조한다.

실기기·EAS/Sentry 계정이 필요한 이 세 확인은 로컬 단위 테스트나 `expo export`만으로 대체할 수 없다.

## 개인정보

`sendDefaultPii: false`를 명시하고 `beforeSend`/`beforeBreadcrumb`에서 이중 정제한다. Authorization, Cookie, bearer/JWT, access/refresh token, password/PIN/OTP/verification code, API key, secret/session/credential 필드와 이메일을 제거한다. request/response body는 수집하지 않으며 request URL은 query/hash를 제거한다. 자동 console breadcrumb와 navigation/deep-link URL은 버리고 안전한 route/API template breadcrumb만 직접 만든다. 사용자 context는 이미 로드된 내부 ID 하나만 사용하며 logout·인증 만료 때 user와 session context를 함께 지운다. 추가 사용자 조회는 하지 않는다.

화면 캡처, view hierarchy, session replay, app-hang 추적, 성능 tracing은 꺼져 있다. 특히 군 관련 일정 내용 때문에 replay는 sample 0이 아니라 integration 자체를 포함하지 않는다. SDK가 붙이는 기기/OS 진단에는 광고 ID나 임의 device identifier를 추가하지 않는다.

Sentry 프로젝트의 **Security & Privacy → Prevent Storing of IP Addresses**도 켠다. SDK 설정만으로 Sentry ingress가 보는 네트워크 IP의 서버 측 보관 정책까지 정할 수 없기 때문이다. 프로젝트 retention을 정한 뒤 공개 개인정보 처리방침의 보유기간과 일치시킨다. 변경된 방침은 공고 후 시행일 전에 사용자에게 공개하고 App Store Privacy/Google Play Data Safety 답변에서 crash diagnostics를 반영한다.

## 경보와 대시보드 연결

Sentry 프로젝트의 Alerts에서 `environment=production` 조건으로 다음 규칙을 만든다.

1. Issue alert: 새 fatal/native crash 또는 latest release에서 처음 나타난 regression은 즉시 email/Slack/PagerDuty로 알림.
2. Issue alert: 기존 issue event 수가 5분/1시간 기준선을 급증하면 알림.
3. Metric alert: crash-free sessions가 운영 기준 아래로 내려가면 알림.
4. Release health alert: latest release/update의 crash-free rate가 직전 release보다 유의하게 하락하면 알림.

수신 채널과 on-call 대상은 계정 권한이 필요한 운영 설정이므로 코드에 넣지 않는다. Expo Dashboard의 project **Integrations → Sentry**에서 같은 organization/project를 연결하면 EAS Update 상세에서 관련 Sentry issue로 이동할 수 있다.

## 문제 해결

- **이벤트가 없음**: 빌드에 DSN이 주입됐는지, local dev 비활성 정책에 걸리지 않았는지, Sentry inbound filter/quota와 기기 네트워크를 확인한다.
- **환경이 production으로 잘못 표시됨**: 해당 EAS environment의 `EXPO_PUBLIC_APP_ENV`와 build profile의 `environment`를 맞춘다. OTA는 반드시 wrapper를 쓴다.
- **JS frame이 minified**: 이벤트 Debug ID와 build/update upload 로그를 비교한다. OTA라면 남아 있는 `dist`를 artifact upload 명령으로 다시 올린다.
- **iOS missing dSYM**: EAS build log의 `Upload Debug Symbols to Sentry` phase와 token 권한을 확인한다.
- **Android missing mapping/symbol**: build log의 Sentry Gradle tasks, release variant, `SENTRY_AUTH_TOKEN`과 generated `sentry.properties` fallback을 확인한다.
- **중복 issue**: 두 이벤트의 `error.source`와 exception identity를 비교한다. 동일 객체는 앱 deduper가 막으므로 서로 새로 만들어진 wrapper Error인지 확인한다.
- **OTA가 다른 코드로 보임**: `expo.update_id`, group, channel, runtime fingerprint를 EAS Update와 맞추고 해당 `dist`의 maps가 업로드됐는지 확인한다.
