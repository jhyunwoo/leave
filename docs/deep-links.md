# 공개 프로필과 딥링크

사용자 이름(@아이디)과 그것으로 만들어지는 프로필 링크가 어디에 살고, 어떤 경로로
앱까지 이어지는지를 정리한다. 규칙 자체는 [`packages/shared/src/username.ts`](../packages/shared/src/username.ts)
머리주석에, 저장 계층의 판단은 [`apps/api/migrations/0023_usernames.sql`](../apps/api/migrations/0023_usernames.sql)에 있다.

## 정본 주소는 하나다

```
https://leave.moveto.kr/u/{username}
```

공유 버튼은 언제나 이 HTTPS 주소를 먼저 클립보드에 복사한 뒤 시스템 공유 시트를
연다. `leave://u/{username}`도 열리지만
**공유하지 않는다** — 받는 사람이 앱을 깔았는지 보낸 사람이 알 수 없기 때문이다.
HTTPS 주소는 앱이 있으면 앱에서 열리고(Universal Link / App Link), 없으면 웹 화면이
열린다. 커스텀 스킴은 앱이 없는 기기에서 아무 데도 가지 않는다.

주소에 내부 사용자 id를 넣지 않는다. 옛 `/friends/{userId}` 경로는 호환을 위해
남아 있지만 정본으로 리디렉션만 하고, 새 링크를 만들지 않는다.

## 이름을 바꾸면 옛 주소는 닫힌다

`users.id`는 그대로이므로 친구 관계·휴가 소유권·세션은 영향을 받지 않는다.
바뀌는 것은 프로필 주소 하나뿐이다. 옛 이름을 예약해 두는 장치는 두지 않았다 —
아무도 쓸 수 없는 이름만 쌓이고, 그 이름으로 남을 사칭할 여지가 생긴다.

## 경로별 착지점

| 진입                               | 웹                     | 네이티브                                   |
| ---------------------------------- | ---------------------- | ------------------------------------------ |
| `https://leave.moveto.kr/u/{name}` | `/u/:username` 라우트  | Universal Link / App Link → `u/[username]` |
| `leave://u/{name}`                 | —                      | 커스텀 스킴 → `u/[username]`               |
| 로그아웃 상태                      | 별칭·@아이디 공개 화면 | 로그인·온보딩·이름 설정을 마친 뒤 복귀     |

로그아웃 상태의 동작은 두 앱이 다르다.

- 웹: 인증 없이 별칭과 @아이디만 공개 API에서 받아 보여준다. 이메일·내부 사용자
  id·친구 관계·부대·복무·일정 정보는 응답에도 넣지 않는다. "로그인하고 친구 추가"를
  누른 경우에만 `?next=`에 현재 경로를 실어 보내고, 로그인·가입이 끝나면 그 자리로
  돌린다. `?next=`는 [`state/next-destination.ts`](../apps/web/src/state/next-destination.ts)에서
  **내부 경로로만** 해석한다(오픈 리다이렉트 방지).
- 네이티브: `/u/{username}`이 `Stack.Protected` 안에 있어 인증 전에는 트리에 없다.
  그대로 두면 목적지가 사라지므로, 인증되지 않은 동안 도착한 링크만 모듈에 담아
  두었다가 인증·온보딩·이름 설정이 모두 끝난 순간 한 번 꺼내 이동한다
  ([`lib/pending-profile-link.ts`](../apps/native/src/lib/pending-profile-link.ts)).
  이미 인증된 상태의 링크는 담지 않는다 — expo-router가 알아서 가고, 여기서 또
  이동시키면 같은 화면이 두 장 쌓인다.

익명 요청에는 조회자 관계가 없으므로 차단 여부를 판정하지 않는다. 차단·친구 관계와
일정 권한은 로그인한 뒤 기존 인증 프로필 API에서 그대로 적용한다. 로그아웃 화면에서
보이는 것은 누구에게나 공개하기로 한 별칭과 @아이디뿐이다.

## 연결 파일

두 파일 모두 웹 앱의 정적 자산으로 나간다(`apps/web/public/.well-known/`), 즉
`leave-web` 워커가 `leave.moveto.kr`에서 직접 서빙한다. 리디렉션이 없어야 한다는
애플의 요구를 그대로 만족하는 자리다. Content-Type은 `apps/web/public/_headers`가
`application/json`으로 못 박는다.

- `apple-app-site-association` — `appIDs: ["Y4FP7J24AX.app.leave.mobile"]`,
  `components`는 `/u/*`만. 팀 ID는 EAS에 등록된 배포 인증서에서 확인한 값이다.
- `assetlinks.json` — `package_name: app.leave.mobile`과 서명 인증서 SHA-256.

Android 앱의 intent filter도 `/u/` 접두어만 받는다. `/u`로 끝 슬래시 없이
두면 `/units` 같은 앱 내부 페이지까지 프로필 링크로 오인해 브라우저에서 가로챈다.

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
