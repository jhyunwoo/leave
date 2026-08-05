# 리브(Leave) 스토어 제출 자료

이 디렉터리는 App Store Connect와 Google Play Console에 입력할 문구, 개인정보 신고 답변, 법적 문서 원본, 제출용 이미지의 저장소입니다. 현재 출시 상태와 외부 작업은 루트의 `RELEASE_READINESS.md`를 기준으로 판단합니다.

## 원본과 공개 URL

| 자료 | 저장소 원본 | 공개 URL |
|---|---|---|
| 개인정보 처리방침 | `legal/privacy-policy.ko.md`, `legal/privacy-policy.html` | `https://leave-web.moveto.workers.dev/privacy` |
| 이용약관 | `legal/terms-of-service.ko.md`, `legal/terms-of-service.html` | `https://leave-web.moveto.workers.dev/terms` |
| 지원·문의 | `legal/support.html` | `https://leave-web.moveto.workers.dev/support` |
| 계정 삭제 안내 | `legal/delete-account.html` | `https://leave-web.moveto.workers.dev/delete-account` |
| Apple 메타데이터 | `metadata/appstore.ko.md`, `metadata/appstore.en.md` | App Store Connect |
| Google 메타데이터 | `metadata/googleplay.ko.md`, `metadata/googleplay.en.md` | Play Console |
| 개인정보 라벨 답변 | `metadata/data-safety-and-ratings.md` | 두 스토어 콘솔 |

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

`images/`의 이미지는 제출 규격 확인용으로 생성한 합성 자료입니다. 공개 제출 전 같은 빌드의 실제 기기 화면으로 교체하고, 민감한 군 식별 정보가 없는지 다시 확인해야 합니다.

이미지 문구를 바꾼 뒤 재생성:

```bash
cd store/generate
node render.mjs
```

생성 결과는 RGB PNG이며 App Store iPhone/iPad, Google Play 휴대전화/피처 그래픽 규격으로 저장됩니다.

## 제출 원칙

- 리브는 국방부·각 군·소속 부대와 무관한 개인 개발 서비스입니다.
- 혼잡도와 출타율은 사용자 입력과 그룹 관리자의 기준값으로 계산한 추정치이며 공식 기록·예약·승인이 아닙니다.
- 실제 휴가는 지휘관 승인과 소속 부대 지침을 우선합니다.
- 실제 수집 동작이 바뀌면 Privacy Manifest, App Privacy, Data Safety, 개인정보 처리방침을 같은 릴리스에서 함께 갱신합니다.
