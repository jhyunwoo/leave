# 리브(Leave) 스토어 제출 자료

이 디렉터리는 App Store Connect와 Google Play Console에 입력할 문구, 개인정보 신고 답변, 법적 문서 원본, 제출용 이미지의 저장소입니다. 현재 출시 상태와 외부 작업은 루트의 `RELEASE_READINESS.md`를 기준으로 판단합니다.

## 원본과 공개 URL

| 자료               | 저장소 원본                                                   | 공개 URL                                 |
| ------------------ | ------------------------------------------------------------- | ---------------------------------------- |
| 개인정보 처리방침  | `legal/privacy-policy.ko.md`, `legal/privacy-policy.html`     | `https://leave.moveto.kr/privacy`        |
| 이용약관           | `legal/terms-of-service.ko.md`, `legal/terms-of-service.html` | `https://leave.moveto.kr/terms`          |
| 지원·문의          | `legal/support.html`                                          | `https://leave.moveto.kr/support`        |
| 계정 삭제 안내     | `legal/delete-account.html`                                   | `https://leave.moveto.kr/delete-account` |
| Apple 메타데이터   | `metadata/appstore.ko.md`, `metadata/appstore.en.md`          | App Store Connect                        |
| Google 메타데이터  | `metadata/googleplay.ko.md`, `metadata/googleplay.en.md`      | Play Console                             |
| 개인정보 라벨 답변 | `metadata/data-safety-and-ratings.md`                         | 두 스토어 콘솔                           |

공개 HTML은 `apps/web/public/`에도 같은 내용으로 복사됩니다. 문서를 수정하면 두 위치의 의미와 시행일이 일치하는지 확인하세요.

## 심사용 계정 보안

- 심사용 이메일·비밀번호·초대코드는 저장소나 커밋, 이슈, 스크린샷에 기록하지 않습니다.
- 과거 저장소에 노출된 심사 비밀번호는 폐기·회전해야 합니다.
- 회전한 자격 증명은 App Store Connect의 App Review Information과 Play Console의 App access 보안 입력란에만 전달합니다.
- 심사 데이터에는 실제 부대명·실명·군번·계급·작전/훈련/병력 정보가 없어야 합니다.

## Android 비공개 테스트

`apps/native/eas.json`의 `closed` 제출 프로필은 Play의 비공개 테스트 트랙(`alpha`)을 대상으로 합니다.

```bash
cd apps/native
pnpm eas:build --platform android --profile closed
pnpm eas:submit --platform android --profile closed
```

2023-11-13 이후 생성된 개인 개발자 계정이라면 실제 테스터 12명이 14일 연속 참여한 뒤 프로덕션 액세스를 신청해야 합니다. 내부 테스트 트랙은 이 요건을 충족하지 않습니다.

## 이미지

휴대전화 슬라이드와 피처 그래픽은 **실제 기기에서 캡처한 앱 화면**을 브랜드 배경 위에 합성한 자료입니다. 원본 캡처는 `assets/screens/*.jpg`(922x1999, iPhone 세로)에 그대로 보관하고, 민감 정보 가림과 잘라내기는 원본을 수정하지 않고 `generate/shots.mjs`의 좌표 정의로만 적용합니다.

iPad 슬라이드는 **웹 앱의 데스크탑 뷰 실캡처**를 브라우저 창 목업에 넣어 합성합니다(`generate/ipad.mjs`). 원본 캡처는 `assets/web/*.png`에 보관합니다. 예전의 가상 데이터 합성 화면(`generate/screens.mjs`)은 제거했습니다.

### 규격과 업로드 슬롯

App Store Connect는 슬롯마다 받는 크기가 다릅니다. **6.9" 규격을 6.5" 슬롯에 올리면 거절**되므로 슬롯을 확인하고 올립니다.

| 디렉터리                      | 크기      | 올리는 곳                                     |
| ----------------------------- | --------- | --------------------------------------------- |
| `images/appstore/iphone-6.5/` | 1284×2778 | App Store Connect · iPhone 6.5" 디스플레이    |
| `images/appstore/iphone-6.9/` | 1320×2868 | App Store Connect · iPhone 6.9" 디스플레이    |
| `images/appstore/ipad-13/`    | 2064×2752 | App Store Connect · iPad 12.9"/13" 디스플레이 |
| `images/googleplay/phone/`    | 1080×2160 | Play Console · 휴대전화                       |

두 스토어 모두 알파 채널을 허용하지 않습니다. `render.mjs`가 알파를 제거해 colorType 2(RGB)로 저장하므로, 다른 도구로 다시 저장하지 마세요.

휴대전화 스크린샷은 파일명 순서대로 업로드합니다.

1. `01-calendar` 함께 보는 휴가 달력
2. `02-balance` 재원별 남은 휴가
3. `03-accrual` 적립분·만기 자동 계산
4. `04-notify` 최대 출타 인원 초과 알림
5. `05-profile` 전역일·복무율·다음 진급
6. `06-more` 전체 기능 요약

iPad 슬라이드도 파일명 순서대로 업로드합니다.

1. `01-calendar` 데스크탑 공유 달력 — 혼잡 신호와 최대 출타 인원 초과
2. `02-leaves` 재원별 잔여 + 적립분 만기 요약
3. `03-landing` 랜딩 히어로와 브랜드 락업(다크 마감)

### iPad 캡처를 다시 찍는 방법

iPad 슬라이드의 원본은 로컬에서 실제로 동작하는 웹 앱을 찍은 것입니다. 화면이나 카피가 바뀌면 아래 순서로 다시 만듭니다.

```bash
# 1) 로컬 D1 준비
pnpm --filter @leave/api db:migrate:local

# 2) API와 웹 기동 (RATE_LIMITS 덮어쓰기가 없으면 계정 여러 개를 만들 때 429로 막힙니다)
pnpm --filter @leave/api exec wrangler dev --port 8787 \
  --var CORS_ORIGIN:http://localhost:5173 \
  --var 'RATE_LIMITS:{"signup":100000,"login":100000}'
pnpm --filter @leave/web dev

# 3) 가상 그룹·구성원·휴가 시딩 → generate/.seed-session.json 생성(커밋 금지)
cd store/generate && node seed-web.mjs

# 4) 데스크탑 뷰 캡처 → assets/web/*.png
node capture-web.mjs

# 5) 슬라이드 합성
node render.mjs
```

`seed-web.mjs`의 데이터는 전부 가상입니다. 그룹명은 `제7가상대대 데모`, 이름은 별칭체, 이메일은 `@leave.example`입니다. **실제 부대명·실명·군번·계급을 넣으면 안 됩니다.**

`ipad.mjs`의 `GRANTS_SUMMARY_BOX`는 `grants.png` 안의 요약 카드 좌표입니다. 캡처를 다시 찍어 레이아웃이 바뀌면 이 좌표도 다시 맞춰야 합니다.

### 캡처에서 반드시 가려야 하는 것

`shots.mjs`의 `redact`(흰 박스)와 `cropTop`/`cropBottom`(잘라내기)이 아래를 처리합니다. 캡처를 새로 교체하면 좌표를 다시 맞춰야 합니다.

| 화면          | 처리            | 대상                              |
| ------------- | --------------- | --------------------------------- |
| `04-notify`   | redact 2개      | 알림 본문의 실제 부대명           |
| `05-profile`  | redact 1개      | 프로필의 실제 이메일 주소         |
| `05-profile`  | cropBottom 1795 | 탭바 뒤로 비치는 실제 부대명 잔상 |
| `01-calendar` | cropBottom 1795 | 탭바 뒤로 비치는 스크롤 잔상      |

가림 좌표는 빨간 박스로 렌더해 눈으로 검증할 수 있습니다.

```bash
cd store/generate
REDACT_DEBUG=1 node render.mjs   # 가림 영역을 빨간색으로 표시
node render.mjs                  # 실제 제출본
```

생성 결과는 RGB PNG이며 App Store iPhone/iPad, Google Play 휴대전화/피처 그래픽 규격으로 저장됩니다. 공개 제출 직전 현재 빌드와 기능·레이아웃이 일치하는지 대조하고, 실명·군번·계급·실제 부대명·이메일이 남아 있지 않은지 확대해서 다시 확인해야 합니다.

## 제출 원칙

- 리브는 국방부·각 군·소속 부대와 무관한 개인 개발 서비스입니다.
- 혼잡도와 출타율은 사용자 입력과 그룹 관리자의 기준값으로 계산한 추정치이며 공식 기록·예약·승인이 아닙니다.
- 실제 휴가는 지휘관 승인과 소속 부대 지침을 우선합니다.
- 실제 수집 동작이 바뀌면 Privacy Manifest, App Privacy, Data Safety, 개인정보 처리방침을 같은 릴리스에서 함께 갱신합니다.
