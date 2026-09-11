# 홈 화면 위젯

전역일 D-Day·남은 일과일·복무율·다음 휴가 D-Day·출타 여유·남은 휴가·진급 D-Day를
홈 화면과 잠금화면에서 바로 보여준다. 코드는 [`apps/native/src/widgets`](../apps/native/src/widgets)에
있고, iOS 등록은 `apps/native/app.json`의 `expo-widgets` 플러그인, Android 구현은
[`leave-android-widgets`](../apps/native/modules/leave-android-widgets)에 있다.

## 크기와 색

| 위젯                           | 크기                                      |
| ------------------------------ | ----------------------------------------- |
| iOS 리브 지표 (`LeaveMetric`)  | 홈 소·중·대형 + 잠금화면 원형·사각·인라인 |
| iOS 리브 요약 (`LeaveSummary`) | 홈 중·대형                                |
| Android 리브 지표 / 리브 요약  | 홈 화면, 가로·세로 크기 변경              |

iOS 크기를 하나 더하는 일은 **세 곳을 함께** 고치는 일이다 — `app.json`의
`supportedFamilies`(생성되는 Swift에 `.supportedFamilies([...])`로 그대로 박힌다),
레이아웃 함수의 `environment.widgetFamily` 분기, 그리고 목록을 통째로 비교하는
`apps/native/test/widget-metrics.test.ts`. 분기를 빠뜨리면 오류 없이 **작은 모양이
그대로 늘어난다.**

홈 화면 위젯은 라이트·다크 모두 **진한 브랜드 그린(`#163300`) 배경에 흰 값**을 쓴다.
라벨은 라임(`#9fe870`), 캡션은 연초록(`#c5edab`)이다. 스킴에 따라 뒤집지 않는 이유는
초록이 이제 표면이 아니라 정체성이기 때문이다 — 어느 홈 화면에 놓여도 같은 덩어리로
보이는 편이 눈에 띈다. 브랜드 primary인 라임을 배경으로 쓰지 않은 것은 대비 때문이다.
라임 위의 흰 글씨는 1.5:1이라 읽히지 않는다(`#163300` 위 흰색은 13.9:1).

**잠금화면(accessory) 세 종류에는 색을 칠하지 않는다.** 시스템이 vibrant로 렌더링하므로
여기서 칠하면 대비만 나빠진다. 레이아웃 함수의 `accessory` 가드가 색을 `undefined`로
떨어뜨린다.

## 위젯은 새로고침할 때 JS를 돌릴 수 없다

그래서 위젯이 그리는 것은 **앱이 미리 넣어 둔 값**뿐이다. 그대로 두면 "앱을 켜야
숫자가 맞는 위젯"이 되는데, 일곱 지표 중 다섯은 날짜만 알면 정해지는 값이다.

앱은 한 순간의 값이 아니라 **앞으로 14일치 타임라인**을 밀어 넣는다
(`buildWidgetTimeline`). 각 엔트리는 그 날짜 기준으로 계산해 두므로, 사용자가 앱을
한 번도 켜지 않아도 D-Day는 iOS는 매일 0시 타임라인을 사용한다. Android는 아래의 지연 가능한 네이티브 갱신을 사용한다.

| 지표             | 굴러가는가 | 근거                                                       |
| ---------------- | ---------- | ---------------------------------------------------------- |
| 전역일 D-Day     | ○          | 날짜 뺄셈                                                  |
| 남은 일과일      | ○          | 오늘 값에서 그 사이 보낸 일과일을 뺀다 (`dutyDaysBetween`) |
| 복무율           | ○          | `serviceProgressAt`                                        |
| 다음 휴가 D-Day  | ○          | `nextLeaveCountdown(leaves, 그날)`                         |
| 진급 D-Day       | ○          | `nextPromotionDate({ on: 그날 })`                          |
| 남은 총 휴가일수 | ✕          | 서버가 오늘 기준으로 센 값                                 |
| 출타 여유        | ✕          | 남이 휴가를 등록하면 바뀐다                                |

굴러가지 않는 둘은 마지막으로 받은 값을 그대로 들고 가되 `asOf`에 기준 시각을 남긴다.
모르는 것을 아는 척하지 않기 위해서다.

**남은 일과일의 뺄셈이 성립하는 이유**는 세는 규칙이 한 곳(`packages/shared/src/duty-days.ts`)에만
있기 때문이다. `remainingDutyDays`도 `dutyDaysBetween`을 지나고, 위젯도 같은 함수로
`[오늘, 그날)` 구간을 센다. 두 곳에 적혔다면 어느 날 답이 갈렸을 것이다.

## 지표를 고르는 길이 두 개인 이유

- **위젯 편집(iOS 17+)**: 위젯을 길게 눌러 고른다. 목록은 `app.json`의
  `configuration.parameters.metric` enum에서 오고, 고른 값은 `environment.configuration`으로
  들어온다. 위젯마다 다르게 둘 수 있어 가장 좋은 경로다.
- **인앱 "위젯 설정" 화면**: 기본 지표를 정하고 props의 `defaultMetric`으로 실려 간다.
  요약 위젯은 지표가 여럿이라 위젯 편집만으로는 고를 수 없어 구성이 항상 여기서 오고,
  지표 위젯도 iOS 16.4~16.x에서는 편집 자체가 없어(아래 참고) 이 값만 본다.

이 화면으로 가는 입구는 **프로필 탭 맨 아래**다. 한때 "내 정보 수정" 안에 있었는데,
위젯을 붙이는 일은 내 값을 고치는 일이 아니라 내 상태를 보는 또 하나의 길이고,
무엇보다 편집 화면 안에서는 아무도 찾지 못했다.

`defaultMetric`은 그밖에 **고른 지표에 보여줄 값이 없을 때**(그룹에 참여하지 않아
출타 여유가 없거나, 병장이라 진급이 없을 때)의 대비책으로도 쓰인다. 그 자리마저
비면 값이 있는 첫 지표로 떨어진다 — 빈 위젯보다는 다른 숫자가 낫다.

### iOS 16.4~16.x에는 지표 위젯이 아예 없다

프리빌드 산출물을 열어 확인한 사실이다. 지표 위젯은 `AppIntentConfiguration`을 쓰므로
생성된 Swift에 `@available(iOS 17.0, *)`가 붙고, 위젯 번들이 iOS 17 미만에서는 이
위젯을 내보내지 않는다. **잠금화면 위젯도 여기에 함께 딸려 있으므로 iOS 16에서는
잠금화면 위젯도 없다.** 요약 위젯은 `StaticConfiguration`이라 iOS 16.4(앱의
`deploymentTarget`)부터 그대로 나온다.

"iOS 16에서는 기본 지표로 떨어진다"가 아니라 "그 위젯이 목록에 없다"가 맞다.

`app.json`의 enum과 `metrics.ts`의 목록이 갈라지면, 편집에서 고른 값이 코드에 없는
key가 되어 위젯이 조용히 빈 화면을 그린다. `apps/native/test/widget-metrics.test.ts`가
두 표를 비교해 빌드에서 잡는다 — `apps/web`의 SEO 라우트 표와 같은 장치다.

## 레이아웃 함수는 바깥을 볼 수 없다

`'widget'` 지시어가 붙은 함수는 babel이 **함수 소스 문자열로 통째로 바꾸고**
(`babel-preset-expo`의 `widgets-plugin`), 그 문자열은 위젯 익스텐션 안의 **별도 JS 번들**에서
평가된다. 그 번들에 있는 전역은 `@expo/ui/swift-ui`의 컴포넌트·모디파이어와 React/JSX
스텁뿐이다.

그래서 레이아웃 함수 안에서는 모듈 상수도, 다른 파일의 헬퍼도 참조할 수 없다 —
문자열에는 이름만 남고 정의는 따라가지 않는다. 필요한 값은 전부 함수 안에 적는다.
`payload.ts`가 그릴 문자열까지 다 만들어 두는 것이 이 제약에 대한 답이다.
위젯이 하는 일은 "어느 지표를 고를지"와 "어디에 놓을지"뿐이다.

부수 효과 하나는 좋은 쪽이다 — 레이아웃이 런타임에 건너가므로 **위젯 모양과 데이터
변경은 OTA로 나간다.** 새 빌드가 필요한 것은 아래 경우뿐이다.

## 최초 설치는 OTA로 나가지 않는다

익스텐션 타깃, App Group 엔타이틀먼트, `app.json`의 위젯 목록은 전부 prebuild
산출물이라 `runtimeVersion` fingerprint를 바꾼다. 즉 **위젯이 처음 사용자에게 닿으려면
새 EAS 빌드와 스토어 배포가 필요하다.** 위젯 종류를 더하거나 지우는 것도 마찬가지다.
배경은 [`apps/native/AGENTS.md`](../apps/native/AGENTS.md), 절차는 `deploy-app` skill에 있다.

App Group은 `group.app.leave.mobile`이다. 이 값이 바뀌면 이미 배포된 위젯이 앱과 다른
상자를 보게 되므로 기본값(`group.<bundleId>`)에 기대지 않고 `app.json`에 못 박아 두었고,
테스트가 번들 id와의 관계를 확인한다.

## Android: 로컬 Expo Module + Jetpack Glance

`expo-widgets.enableAndroid`는 계속 **false**다. 설치된 `expo-widgets@57.0.16`의
Android 브리지는 no-op이고 Glance 구현은 위젯 이름만 그린다. SDK 57 문서를 읽는 것에
더해 설치된 `src/ExpoWidgets.ts`, `WidgetsModule.kt`, `ExpoWidgetsGlanceWidget.kt`를 확인했다.
iOS의 레이아웃 함수·App Group·설정 enum은 그대로 사용한다.

```text
@leave/shared / @leave/client
          ↓
buildWidgetTimeline()                         (복무·휴가 계산)
          ├── widget-publisher.ios.ts → expo-widgets → WidgetKit
          ↓
android-transport.ts                          (선택·문구·딥링크)
          ↓
widget-publisher.android.ts → LeaveAndroidWidgets Expo Module
          ↓
leave_android_widgets SharedPreferences       (작은 JSON 하나)
          ↓
KST/시각으로 엔트리 선택 → Glance → Android 런처
```

### 소유권과 CNG

`apps/native/modules/leave-android-widgets/expo-module.config.json`은 **Android만**
등록한다. 기본 `modules/` 탐색으로 Expo Autolinking이 찾는다. Kotlin 코드, 라이브러리
AndroidManifest, provider XML, 이미지, Gradle 의존성이 전부 이 디렉터리에 있다.
Android manifest/resource merger가 앱에 합치므로 **별도 config plugin이나 생성 파일 복사가
필요하지 않다**. 반복 prebuild마다 receiver를 삽입하는 코드도 없다.
`apps/native/android/`는 생성물이며 커밋하지 않는다. receiver가 합쳐진 결과는
`android/app/build/intermediates/merged_manifests/`에서 확인한다.

JS API는 `setWidgetTimeline(serializedJson)`, `clearWidgetData()`, `refreshWidgets()`뿐이다.
브리지는 Android publisher에서만 import하며, 모듈이 없는 Expo Go/이전 바이너리에서도
앱 시작을 막지 않는다. 위젯 오류는 `captureHandledError(..., { source: "home_widget" })`로
처리하고 인증이나 탐색 오류로 전파하지 않는다. 위젯에서 네트워크를 부르거나 JS 엔진을
띄우지 않는다.

### 저장 계약과 날짜

v1 JSON에는 `version`, `updatedAt`, `expiresAt`, `entries`가 있다. 엔트리는
`validFrom`(epoch milliseconds), `date`(KST ISO 날짜), `asOf`, `updatedLabel`,
`state`, `message`, `url`, 선택된 `metric`, 순서대로 해석된 `summaryMetrics`를 담는다.
지표에는 이미 만들어진 label/value/caption/spoken/compact/gauge/url만 실린다.
없는 지표·옵션 키는 생략한다. 이메일, 토큰, 계정 ID, 전체 응답은 저장하지 않는다.
복무일수·진급·휴가 선택·fallback 순서·딥링크 표는 Kotlin에 복제하지 않는다.

- `SharedPreferences`의 `timeline` 키 하나를 IO dispatcher에서 `commit()`으로 교체한다.
  JS promise는 디스크 쓰기가 끝난 뒤 완료된다. 앱의 `allowBackup: false`도 유지한다.
- 최대 256 KiB, 엔트리 128개, 요약 지표 6개로 제한하고 schema·날짜·순서·값을 검사한다.
  손상되거나 모르는 schema는 앱을 열라는 안내로 내려간다.
- 현재 **Asia/Seoul 날짜**에 속하면서 `validFrom <= now`인 마지막 엔트리를 고른다.
  자정 사이 복귀 시각 엔트리도 보존한다. 휴대전화 시간대가 해외여도 날짜 의미는 같다.
- 마지막 날 다음 **KST 자정부터** ready 데이터는 만료한다. 오래된 D-Day를 계속
  현재 값인 것처럼 표시하지 않고 “앱을 열어 최신 정보를 확인하세요”를 보여준다.
  시간이 최초 엔트리보다 과거로 바뀌거나 해당 날짜가 없을 때도 같은 안내다.
- 최초 설치/저장 데이터 없음은 “로그인하고 확인하세요”, 미완료 계정은
  “복무정보를 입력하세요”다. 이 상태의 탭은 홈 딥링크로 들어가 기존 인증·온보딩
  라우팅을 따른다. signedOut/onboarding 메시지는 14일이 지나도 다른 상태로 바뀌지 않는다.
- 복무·날짜 값은 매일 앞으로 계산되지만 잔여 휴가·출타 여유는 마지막 앱 동기화의
  스냅샷이다. 공간이 있는 레이아웃에는 마지막 앱 업데이트 날짜를 표시한다.

**복귀 카운트다운 차이:** iOS의 bounded SwiftUI timer는 그대로다. Android에는 시시각각
낡는 “몇 시간 남음”을 고정해 두지 않고, TypeScript가 끝 시각을 “복귀 예정 / 21:00 /
6월 22일 · 한국시간”으로 표현한다. 일반 휴가 D-Day 및 복귀 시점의 다음 지표 전환은
동일한 타임라인에서 온다. Android의 표준 Chronometer는 0 뒤에 음수로 계속 셀 수 있어
배터리를 깨워 멈추는 구현을 추가하지 않았다.

그 문구를 만들 때 **`Intl`을 쓰지 않는다.** Hermes/Android의 Intl은 이 앱에서
`DateTimeFormat.format`만 검증돼 있고 `formatToParts`는 쓰이는 곳이 없다. 여기서 던지면
`buildAndroidWidgetTimeline`이 던지고 **네이티브 쓰기가 아예 나가지 않아** 위젯이 마지막
값에 머문 채 조용히 낡는다 — 앱에는 아무 증상이 없다(1.1.0의 `gauge: null` 사고와 같은
모양). 한국은 서머타임이 없으므로 `KST_OFFSET_MS`를 더한 산술이 정확하고 충분하다.

**복귀 전환 엔트리를 담을 때 창 끝은 루프 전에 붙잡는다.** `buildWidgetTimeline`이 같은
배열에 push하므로, 배열의 마지막 원소를 상한으로 읽으면 첫 복귀 엔트리를 넣는 순간
상한이 그 시각으로 내려앉아 그 뒤 휴가가 창 안에 있어도 전부 버려진다. 예정된 휴가가
둘 이상일 때만 드러나는 종류의 버그다.

### 갱신과 배터리

앱 쓰기는 저장 직후 모든 활성 지표·요약 인스턴스에 Glance update를 요청한다.
활성 Glance composition은 약 45초 동안 재사용될 수 있으므로 SharedPreferences 변경도
Flow로 관찰한다. 단순히 `provideGlance` 시작 때 읽기만 하면 그 사이 새 데이터나
로그아웃이 화면에 반영되지 않을 수 있다. listener에서는 알림만 보내고 JSON 파싱은 IO에서 한다.

고유 WorkManager 주기 작업은 **한 시간마다**, 최초 실행은 다음 KST 정시에 맞춰 예약한다.
자정도 그 경계에 포함된다. 부팅·앱 교체·시간/시간대 변경 broadcast는 즉시 갱신 작업과
주기 재예약을 요청한다. provider의 `updatePeriodMillis`는 6시간으로, 런처 요청은 저장값을
다시 읽고 WorkManager 예약을 복구한다. 두 위젯을 여러 개 붙여도 주기 작업은 하나이며,
마지막 Leave 위젯을 지우면 취소한다. 네트워크 제약, exact alarm, 몇 분 단위 polling은 없다.

일반적인 비절전 상태의 목표 지연은 날짜/복귀 경계 뒤 약 한 시간 이내다. **보장된 최대
지연은 없다.** Doze, 앱 대기 버킷, 제조사 배터리 제한, 전원 꺼짐, 강제 중지는 작업을
더 늦출 수 있다. 지연된 작업이 실행되면 중간 날을 순서대로 재생하지 않고 현재 KST
엔트리로 바로 따라잡는다. 앱 재실행은 즉시 새 타임라인을 쓴다. 서버에서만 일어난
변경/다른 기기에서의 로그아웃은 앱이 다시 서버 상태를 받기 전까지 알 수 없다.

### 설정·로그아웃·접근성

Android 두 종류 모두 기존 **프로필 → 위젯 설정**을 쓴다. 지표 위젯은 defaultMetric과
기존 fallback 순서를, 요약은 값이 있는 summaryMetrics의 순서를 사용한다.
인스턴스별 configuration activity는 없다. 같은 종류의 모든 Android 위젯은 같은 설정을
따르며, iOS의 인스턴스별 metric 설정에는 영향이 없다.

인증 어댑터는 명시적 로그아웃·401 만료·회원 탈퇴·새 세션 시작 시 Android 데이터를
지운다. publication queue의 세대를 바꿔 이전 계정의 대기 쓰기를 무효화하고,
이미 진행 중인 쓰기 다음에 clear를 실행한다. 로그아웃 후 늦게 온 ready 쓰기도 막는다.
기기 취향인 위젯 설정 DB는 지우지 않는다. clear/update 실패는 기록하되 인증은 계속한다.

Glance `SizeMode.Exact`와 `LocalSize`로 런처가 준 실제 dp 크기를 읽는다. 지표는 작은
라벨·값 중심에서 중간 크기의 캡션, 넓고 높은 크기의 큰 값·게이지·업데이트 날짜로 바뀐다.
요약은 폭/높이/글자 배율에 맞춰 1~2열, 최대 3행으로 줄이고 선택 순서를 유지한다.
큰 접근성 글꼴의 작은 위젯은 앞 지표의 compact 문구를 우선한다. 시스템 폰트를 쓰고,
긴 값은 Android Paint로 폭을 측정한다. Android 12+의 시스템 배경 모서리와 런처 외부
여백을 존중하며 내부 여백은 별도로 둔다. light/dark 모두 브랜드 색을 유지한다.

위젯 전체가 하나의 명확한 탭 영역이다. 지표는 해당 지표의 기존 딥링크, 요약은 홈으로
간다. `getLaunchIntentForPackage`가 준 명시적 앱 component에 직렬화된 URI를 실어 다른
앱으로 전달하지 않는다. 스크린리더 설명은 보이는 지표들의 `spoken`을 한 번씩 합친다.
렌더 실패는 앱을 열 수 있는 작은 recovery RemoteViews로 내려간다.

### 위젯 선택기 미리보기

두 provider는 한국어 label/description과 실제 브랜드 색의 정적 PNG previewImage를
갖는다. 예제 값은 가상 데이터다. Android 15+에서는 안정판 Glance의 `providePreview`와
`setWidgetPreviews`를 사용하며, **사용자 저장소를 읽지 않고** 같은 가상 데이터로 그린다.
성공한 디자인 버전은 저장하여 앱 쓰기마다 미리보기를 만들지 않는다. 시스템 rate limit이나
오류가 있으면 정적 PNG가 계속 제공되고 다음 앱 쓰기에 재시도한다. 디자인 변경 시
`WidgetPreviews`의 버전과 PNG도 같이 갱신한다.

### 의존성 호환성 및 배포

확인한 앱 버전은 Expo **57.0.19**, React Native **0.86.2**, `@expo/ui` **57.0.15**,
`expo-modules-core` **57.0.15**, `expo-widgets` **57.0.16**이다. clean prebuild와 Gradle이
보고한 환경은 compile/target SDK **36**, min SDK **24**, Kotlin **2.1.20**,
AGP **8.12.0**, Gradle **9.3.1**, NDK **27.1.12297006**이다.

| 직접 추가한 Android 의존성         | 고정 버전  | 선택 근거                                                                    |
| ---------------------------------- | ---------- | ---------------------------------------------------------------------------- |
| `androidx.glance:glance`           | `1.2.0`    | 안정판; 정확한 크기·generated preview API 사용                               |
| `androidx.glance:glance-appwidget` | `1.2.0`    | 설치된 expo-widgets의 `1.2.0-rc01`보다 높은 안정판으로 정상 Gradle 버전 해석 |
| `androidx.work:work-runtime-ktx`   | `2.11.2`   | 안정판; 재부팅을 견디는 고유 주기 작업, min SDK 23으로 앱의 24 이내          |
| `junit:junit` (test only)          | `4.13.2`   | 저장소의 기존 Android 테스트 버전과 동일                                     |
| `org.json:json` (test only)        | `20240303` | Android framework JSON 파서를 JVM 테스트에서 실행                            |

Glance 1.2.0 Maven POM은 Kotlin 2.0.21, Compose runtime 1.7.8을 사용한다.
앱의 Kotlin 2.1.20 및 기존 `@expo/ui` Compose 1.10.6보다 낮다. Compose compiler plugin은
모듈이 별도 버전을 들고 있지 않고 **호스트 kotlinVersion**을 그대로 따른다. 기존
`@expo/ui`의 Material3 alpha 의존성은 이 기능에서 추가/업그레이드하지 않는다.

Android Kotlin·리소스·manifest·Gradle·모듈 등록 변경은 **새 EAS/store 빌드가 필요하다**.
TypeScript 의미/문구 변경도 설치된 v1 계약과 호환되어야 한다. 새로운 필수 필드나 의미를
기존 v1에 끼워 넣지 말고 schema/runtime을 함께 올린다. iOS layout의 OTA 특성은 그대로다.
`runtimeVersion.policy = "fingerprint"`를 바꾸지 않는다.

### 로컬 재현과 검증

```bash
pnpm --filter @leave/native check-types
pnpm --filter @leave/native lint
pnpm --filter @leave/native test

cd apps/native
pnpm exec expo prebuild --clean --platform android --no-install
pnpm exec expo-modules-autolinking resolve --platform android --json
# JDK 17과 Android SDK가 설정된 환경
cd android
./gradlew :leave-android-widgets:testDebugUnitTest :app:assembleDebug
./gradlew :app:dependencyInsight --dependency glance-appwidget --configuration debugRuntimeClasspath
cd ..
pnpm exec expo run:android
# prebuild가 android/ios scripts를 바꾸었는지 보고 그 두 줄만 원래대로 복구한다.
git diff -- package.json
cd ../..
pnpm quality
```

TypeScript 테스트는 직렬화·선택·fallback·개인정보 placeholder·KST·딥링크·로그아웃
쓰기 경쟁을 검사한다. Kotlin JVM 테스트는 동일 JSON fixture를 읽고 schema 손상,
KST 자정, 복귀 시각, 만료, 시계 역행, 빠진 날짜를 검사한다. `widget-android-integration`
테스트는 라이브러리 manifest/metadata/resources/dependencies를 확인한다. 별도 plugin이
없으므로 idempotence는 두 번의 clean prebuild/autolink/merged manifest 비교로 확인한다.

개발 빌드에서 로그인·온보딩 후 홈 화면의 위젯 선택기에 **리브 지표**, **리브 요약**이
나오는지 확인한다. 두 종류 추가 → 다양한 폭/높이로 resize → 설정 변경 → 데이터 변경 →
딥링크 → 로그아웃/온보딩 → 프로세스 종료/최근 앱 제거 → 런처 재시작 순서로 확인한다.
휴대전화 시간대를 미국으로 바꾸어 KST 경계가 유지되는지, 날짜를 다음 날과 타임라인
만료 뒤로 옮겼을 때 올바른 값/안내가 나오는지 확인한다. 개발 데이터로만 시계를 바꾸며,
검증 뒤 자동 시간을 복구한다. font/display scale과 Pixel/Samsung 런처는 각각 실제로
검증한 조합만 기록한다. `force-stop`은 일반 프로세스 종료와 다르며 Android가 예약
작업을 막을 수 있다.

참고한 공식 문서:
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[Widgets SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/),
[로컬 Expo Module](https://docs.expo.dev/modules/get-started/),
[custom native code](https://docs.expo.dev/workflow/customizing/),
[CNG](https://docs.expo.dev/workflow/continuous-native-generation/),
[mods](https://docs.expo.dev/config-plugins/mods/),
[autolinking](https://docs.expo.dev/modules/autolinking/),
[Glance 릴리스](https://developer.android.com/jetpack/androidx/releases/glance),
[크기와 레이아웃](https://developer.android.com/develop/ui/compose/glance/build-ui),
[상태와 갱신](https://developer.android.com/develop/ui/compose/glance/glance-app-widget),
[위젯 갱신 비용](https://developer.android.com/develop/ui/views/appwidgets/advanced),
[액션](https://developer.android.com/develop/ui/compose/glance/user-interaction),
[Android 12+ 개선](https://developer.android.com/develop/ui/views/appwidgets/enhance),
[generated preview](https://developer.android.com/develop/ui/compose/glance/generated-previews),
[WorkManager 릴리스](https://developer.android.com/jetpack/androidx/releases/work).

## 개인정보 매니페스트

프리빌드가 만드는 위젯 익스텐션에는 `PrivacyInfo.xcprivacy`가 **들어가지 않는다**
(`ios/app/PrivacyInfo.xcprivacy`만 생긴다). 익스텐션이 쓰는 required-reason API는 App Group
UserDefaults 하나뿐이고, 그 사유(`CA92.1`)는 앱 쪽 `privacyManifests`가 이미 선언하고 있다.
스토어 심사에서 지적을 받으면 익스텐션 타깃에도 같은 값의 매니페스트를 넣는 config
plugin이 필요하다.

## 웹에는 위젯이 없다

`widget-sync.tsx`(웹)는 아무것도 하지 않고, `.native.tsx`가 기기에서 선택된다.
그래서 **위젯은 Expo web 타깃으로 검증할 수 없다** — 실기기나 시뮬레이터가 필요하다.
설정 화면은 웹에서도 열리고 localStorage에 저장되므로 화면 자체는 브라우저로 확인할 수 있다.
