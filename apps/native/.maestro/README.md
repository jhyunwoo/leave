# 네이티브 e2e (Maestro)

Expo 앱의 종단 간(e2e) 테스트를 [Maestro](https://maestro.mobile.dev)로 작성한다.

## 사전 준비

1. Maestro CLI 설치:
   ```bash
   curl -Ls "https://get.maestro.mobile.dev" | bash
   ```
2. 실행 중인 시뮬레이터/에뮬레이터 또는 연결된 기기.
3. 앱 설치 — 푸시 등 네이티브 기능이 필요하므로 **개발 빌드** 권장:
   ```bash
   # iOS 시뮬레이터
   pnpm --filter @leave/native ios
   # Android 에뮬레이터
   pnpm --filter @leave/native android
   ```
4. 로컬 API 기동(가입/로그인 검증용):
   ```bash
   pnpm --filter @leave/api db:migrate:local   # 최초 1회
   pnpm --filter @leave/api dev
   ```
   기기에서 접근 가능한 API 주소가 필요하면 `EXPO_PUBLIC_API_URL`로 지정한다.

## 실행

```bash
pnpm --filter @leave/native test:e2e
# 또는 개별 플로우
maestro test .maestro/launch.yaml
```

## 플로우

- `launch.yaml` — 가입 전 데모, 비공식 고지, 로그인 ↔ 가입 이동.
- `signup.yaml` — 최소수집 가입 → 비식별 그룹 생성 → 일정 시뮬레이션·저장 → 인앱 계정 삭제.
- `username-setup.yaml` — 가입 → 온보딩의 사용자 이름 단계(규칙 위반 안내 포함) → 완료.
- `friends-usernames.yaml` — @아이디 검색 → 프로필 → 요청/취소 → 프로필 딥링크
  (`leave://u/…`, warm·cold start).
- `friends-personal-events.yaml` — 친구 달력 비교와 개인 일정 편집.

`friends-usernames.yaml`은 `E2E_SEARCH_USERNAME`이 더 필요하다 — 로그인 계정과
**아직 친구가 아닌** 다른 사용자의 @아이디여야 한다(관계 상태에 따라 버튼이 달라진다).

## HTTPS 링크(Universal Link / App Link)

`leave://u/…`는 여기서 그대로 검증되지만, `https://leave.moveto.kr/u/…`는 서명된
앱과 실제로 배포된 `.well-known` 파일이 있어야 검증된다. 확인 방법:

```bash
# 애플이 실제로 읽는 파일 (리디렉션 없이 200 + JSON이어야 한다)
curl -sI https://leave.moveto.kr/.well-known/apple-app-site-association
# 구글 검증기
curl -s "https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://leave.moveto.kr&relation=delegate_permission/common.handle_all_urls"
# 안드로이드 기기에서 검증 상태 확인
adb shell pm get-app-links app.leave.mobile
```

`app.json`의 `associatedDomains`·`intentFilters`는 네이티브 설정이라 **OTA로 나가지
않는다.** 새 EAS 빌드가 필요하다(runtimeVersion fingerprint도 함께 바뀐다).

## 참고

핵심 입력과 파괴적 계정 삭제 버튼은 `testID`를 사용한다. 날짜 선택기는 기기별 UI가
달라 기본값(오늘)을 저장하는 경로로 고정했고, 별도 날짜 경계는 공유 로직 유닛테스트에서
윤년·연/월 경계·복귀일 포함 여부까지 검증한다.
