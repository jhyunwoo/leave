# 공개 프로필·초대 링크와 딥링크

앱 밖에서 앱 안으로 이어지는 두 종류의 주소를 정리한다 — 사용자 이름(@아이디)으로
만들어지는 **프로필 링크**와, 그룹 관리자가 발급하는 **초대 링크**다. 규칙 자체는
[`packages/shared/src/username.ts`](../packages/shared/src/username.ts)와
[`packages/shared/src/invite-code.ts`](../packages/shared/src/invite-code.ts)
머리주석에, 저장 계층의 판단은 [`apps/api/migrations/0023_usernames.sql`](../apps/api/migrations/0023_usernames.sql)에 있다.

## 정본 주소는 하나다

```
https://leave.moveto.kr/u/{username}       프로필
https://leave.moveto.kr/invite/{code}      그룹 초대
```

공유 버튼은 언제나 이 HTTPS 주소를 먼저 클립보드에 복사한 뒤 시스템 공유 시트를
연다. `leave://u/{username}`도 열리지만
**공유하지 않는다** — 받는 사람이 앱을 깔았는지 보낸 사람이 알 수 없기 때문이다.
HTTPS 주소는 앱이 있으면 앱에서 열리고(Universal Link / App Link), 없으면 웹 화면이
열린다. 커스텀 스킴은 앱이 없는 기기에서 아무 데도 가지 않는다.

**나가는 것은 주소 하나뿐이다.** 공유 시트에 `@아이디`를 함께 싣지 않는다 — 받는
쪽에 `@hyunwoo https://leave.moveto.kr/u/hyunwoo`가 붙으면 그대로 주소창에 넣거나
다시 옮겨 붙일 수 없다. 누가 보냈는지는 대화창이 이미 말해 준다. 웹의
`navigator.share`도 같은 이유로 `title`을 주지 않는다(대상 앱이 본문 앞에 붙인다).

주소에 내부 사용자 id를 넣지 않는다. 옛 `/friends/{userId}` 경로는 호환을 위해
남아 있지만 정본으로 리디렉션만 하고, 새 링크를 만들지 않는다.

## 이름을 바꾸면 옛 주소는 닫힌다

`users.id`는 그대로이므로 친구 관계·휴가 소유권·세션은 영향을 받지 않는다.
바뀌는 것은 프로필 주소 하나뿐이다. 옛 이름을 예약해 두는 장치는 두지 않았다 —
아무도 쓸 수 없는 이름만 쌓이고, 그 이름으로 남을 사칭할 여지가 생긴다.

## 경로별 착지점

| 진입                                    | 웹                                    | 네이티브                                    |
| --------------------------------------- | ------------------------------------- | ------------------------------------------- |
| `https://leave.moveto.kr/u/{name}`      | `/u/:username` 라우트                 | Universal Link / App Link → `u/[username]`  |
| `leave://u/{name}`                      | —                                     | 커스텀 스킴 → `u/[username]`                |
| `https://leave.moveto.kr/invite/{코드}` | `/invite/:code` 라우트                | Universal Link / App Link → `invite/[code]` |
| `leave://invite/{코드}`                 | —                                     | 커스텀 스킴 → `invite/[code]`               |
| `https://leave.moveto.kr/invite#{코드}` | `/invite` (옛 링크 호환)              | —                                           |
| 로그아웃 상태                           | 별칭·@아이디 공개 화면 / 가입 뒤 복귀 | 로그인·온보딩·이름 설정을 마친 뒤 복귀      |

로그아웃 상태의 동작은 두 앱이 다르다.

- 웹: 인증 없이 별칭과 @아이디만 공개 API에서 받아 보여준다. 이메일·내부 사용자
  id·친구 관계·부대·복무·일정 정보는 응답에도 넣지 않는다. "로그인하고 친구 추가"를
  누른 경우에만 `?next=`에 현재 경로를 실어 보내고, 로그인·가입이 끝나면 그 자리로
  돌린다. `?next=`는 [`state/next-destination.ts`](../apps/web/src/state/next-destination.ts)에서
  **내부 경로로만** 해석한다(오픈 리다이렉트 방지).
- 네이티브: `/u/{username}`과 `/invite/{code}`가 `Stack.Protected` 안에 있어 인증
  전에는 트리에 없다. 그대로 두면 목적지가 사라지므로, 인증되지 않은 동안 도착한
  링크만 모듈에 담아 두었다가 인증·온보딩·이름 설정이 모두 끝난 순간 한 번 꺼내
  이동한다 ([`lib/pending-profile-link.ts`](../apps/native/src/lib/pending-profile-link.ts),
  [`lib/pending-invite-link.ts`](../apps/native/src/lib/pending-invite-link.ts)).
  이미 인증된 상태의 링크는 담지 않는다 — expo-router가 알아서 가고, 여기서 또
  이동시키면 같은 화면이 두 장 쌓인다. 초대가 프로필보다 먼저다 — 프로필은 언제든
  다시 열 수 있지만 초대는 만료된다.

익명 요청에는 조회자 관계가 없으므로 차단 여부를 판정하지 않는다. 차단·친구 관계와
일정 권한은 로그인한 뒤 기존 인증 프로필 API에서 그대로 적용한다. 로그아웃 화면에서
보이는 것은 누구에게나 공개하기로 한 별칭과 @아이디뿐이다.

## 연결 파일

두 파일 모두 웹 앱의 정적 자산으로 나간다(`apps/web/public/.well-known/`), 즉
`leave-web` 워커가 `leave.moveto.kr`에서 직접 서빙한다. 리디렉션이 없어야 한다는
애플의 요구를 그대로 만족하는 자리다. Content-Type은 `apps/web/public/_headers`가
`application/json`으로 못 박는다.

- `apple-app-site-association` — `appIDs: ["Y4FP7J24AX.app.leave.mobile"]`,
  `components`는 `/u/*`와 `/invite/*`. 팀 ID는 EAS에 등록된 배포 인증서에서 확인한 값이다.
  iOS의 `associatedDomains`는 도메인 단위(`applinks:leave.moveto.kr`)라 경로를 늘릴 때
  앱 설정은 건드리지 않는다. 다만 이미 깔린 앱이 새 `components`를 언제 집어갈지는
  보장되지 않으므로(설치·업데이트 시점에 애플 CDN에서 받아 둔다), 경로를 늘렸으면
  안드로이드와 함께 새 빌드로 확실히 맞추는 편이 낫다.
- `assetlinks.json` — `package_name: app.leave.mobile`과 서명 인증서 SHA-256.
  호스트 단위 선언이라 경로를 늘려도 바뀌지 않는다.

Android 앱의 intent filter는 `/u/`와 `/invite/` 접두어만 받는다. 끝 슬래시가 중요하다 —
`/u`로 두면 `/units` 같은 앱 내부 페이지까지 프로필 링크로 오인해 브라우저에서 가로챈다.

## 메신저 인앱 브라우저에서는 OS가 가로채지 않는다

프로필·초대 링크는 카카오톡·문자로 오간다. **메신저의 인앱 브라우저는 Universal
Link / App Link를 가로채지 않으므로**, 그 자리에서는 OS 딥링크만으로 앱이 열리지
않는다. 그래서 웹이 커스텀 스킴으로 한 번 이동을 시도한다. 앱이 없으면 그 시도는
아무 일도 하지 않고 웹 화면이 그대로 남는다.

판단은 [`lib/app-handoff.ts`](../apps/web/src/lib/app-handoff.ts) 한 곳에 있다 —
**모바일에서만, 문서당 한 번만** 시도한다. 데스크톱에는 넘어갈 앱이 없고, 그런데도
시도하면 브라우저가 "이 주소를 열 수 없습니다" 대화상자를 띄운다.

- 초대: [`pages/InviteJoinPage.tsx`](../apps/web/src/pages/InviteJoinPage.tsx)가
  마운트 직후 시도하고, 1.2초 뒤에도 페이지가 살아 있으면 웹 참여 화면을 그린다.
  시도하지 않은 경우(데스크톱)에는 기다리지 않고 곧바로 웹 흐름으로 간다.
- 프로필: [`main.tsx`](../apps/web/src/main.tsx)가 **문서 진입 때** 시도한다.
  라우트 컴포넌트가 아닌 이유는 `/u/:username`이 웹 안에서도 링크로 오가는
  주소이기 때문이다(친구 목록, "내 공개 프로필 보기"). 라우트 쪽에 두면 웹에서
  친구를 누를 때마다 앱으로 튕긴다. 진입점은 문서 로드 때 한 번만 돌므로 직접
  진입에서만 동작하고, 로그인 여부와도 무관하다.

자동 시도는 사용자 제스처가 없는 외부 스킴 이동이라 브라우저가 막을 수 있다.
그래서 공개 프로필 화면([`pages/PublicUserProfilePage.tsx`](../apps/web/src/pages/PublicUserProfilePage.tsx))에는
모바일에서만 보이는 "앱에서 열기" 링크를 하나 둔다 — 클릭은 제스처라 막히지 않는다.

### 안드로이드 서명 인증서에 대한 주의

지금 들어 있는 지문은 **EAS가 들고 있는 업로드 키**의 것이다. Play 앱 서명이
켜져 있으면 스토어에서 내려받은 앱은 구글이 다시 서명하므로, 그 인증서의 SHA-256을
`sha256_cert_fingerprints`에 **추가**해야 스토어 빌드에서 App Link가 검증된다.
값은 Play Console → 설정 → 앱 무결성 → 앱 서명 키 인증서에 있다(배포 전 확인 필요).
내부 배포(APK, preview 채널)는 업로드 키로 서명되므로 지금 값만으로 검증된다.

### 네이티브 설정은 OTA로 나가지 않는다

`app.json`의 `associatedDomains`·`intentFilters`는 prebuild 결과를 바꾸므로
`eas update`로는 기존 사용자에게 닿지 않는다. runtimeVersion fingerprint도 함께
바뀌므로 **새 EAS 빌드**가 필요하다. 자세한 배경은
[`apps/native/AGENTS.md`](../apps/native/AGENTS.md) 참고.

## 예약된 이름

`/users/{username}`과 같은 층위에 `/users/search`·`/users/availability`가 있고
`/users/me/*`가 그 아래에 있다. 이 낱말들을 열어 두면 그 이름을 가진 사람의
프로필이 영영 조회되지 않으므로 `RESERVED_USERNAMES`로 막는다. `admin`·`support`는
경로 문제가 아니라 운영자 사칭을 막으려고 함께 막는다.
