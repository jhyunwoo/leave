# 홈 화면 위젯

전역일 D-Day·남은 일과일·복무율·다음 휴가 D-Day·출타 여유·남은 휴가·진급 D-Day를
홈 화면과 잠금화면에서 바로 보여준다. 코드는 [`apps/native/src/widgets`](../apps/native/src/widgets)에
있고, 설정은 `apps/native/app.json`의 `expo-widgets` 플러그인 항목이다.

## 크기와 색

| 위젯                       | 크기                                      |
| -------------------------- | ----------------------------------------- |
| 리브 지표 (`LeaveMetric`)  | 홈 소·중·대형 + 잠금화면 원형·사각·인라인 |
| 리브 요약 (`LeaveSummary`) | 홈 중·대형                                |

크기를 하나 더하는 일은 **세 곳을 함께** 고치는 일이다 — `app.json`의
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
한 번도 켜지 않아도 D-Day는 매일 0시에 스스로 줄어든다.

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

## Android 위젯은 내렸다 — 패키지에 구현이 없다

`enableAndroid`는 `false`다. "검증이 덜 됐다"가 아니라 **`expo-widgets@57.0.16`에
안드로이드 구현이 없다.** 패키지를 열어 확인한 것:

- `android/.../WidgetsModule.kt`는 `Name("ExpoWidgets")` 한 줄이고 함수가 하나도 없다.
- JS쪽 `src/ExpoWidgets.ts`(안드로이드가 고르는 파일)는 통째로 no-op 스텁이다 —
  `updateTimeline`이 빈 함수라 **타임라인이 조용히 버려진다.** 예외도 나지 않는다.
- `ExpoWidgetsGlanceWidget.kt`는 `provideContent { Text(widgetName) }` 한 줄이다.
  플러그인이 만드는 provider도 이 클래스를 그대로 상속한다.

즉 켜 두면 사용자의 홈 화면에 **문자 "LeaveMetric"이 그려진다.** `.widget.tsx`의
레이아웃은 안드로이드에서 한 번도 평가되지 않는다.

다시 켜려면 Glance 컴포저블과 SharedPreferences 전달 경로를 직접 쓰는 config plugin이
필요하다 — 이 저장소의 위젯 코드를 고쳐서 될 일이 아니다. `enableAndroid === false`는
`apps/native/test/widget-metrics.test.ts`가 못 박고 있으니, 켜는 것은 반드시 의식적인
결정이 된다.

레이아웃 함수가 `environment.widgetFamily`로 크기를 가르는 것도 iOS 전용이다
(`ios/Widgets/Utils.swift`가 채워 준다). 안드로이드에는 환경 맵 자체가 없어 값이
`undefined`로 오므로, **크기 분기의 마지막 `return`은 언제나 fall-through 기본값으로
남겨 둔다.**

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
