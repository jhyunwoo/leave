# 리브(Leave) — 스토어 제출 자료 모음

App Store와 Google Play 제출에 필요한 **모든 홍보 문구·이미지·정책·설정 답변**을 담았습니다.

```
store/
├─ metadata/
│  ├─ appstore.ko.md / appstore.en.md      # App Store 이름·부제·설명·키워드·What's New 등
│  ├─ googleplay.ko.md / googleplay.en.md  # Play 이름·짧은설명·자세한설명 등
│  ├─ keywords-aso.md                      # ASO 키워드 조사·전략
│  └─ data-safety-and-ratings.md           # 데이터 안전/개인정보 라벨/콘텐츠 등급 답변
├─ legal/
│  ├─ privacy-policy.ko.md                 # 개인정보 처리방침(원문)
│  └─ privacy-policy.html                  # 배포용 웹 버전 → /privacy
├─ images/
│  ├─ appstore/
│  │  ├─ icon/icon-1024.png                # 1024×1024, RGB(알파 없음)
│  │  ├─ iphone-6.9/01~06.png              # 1320×2868 (6.9" 필수)
│  │  └─ ipad-13/01~02.png                 # 2064×2752 (13" — iPad 지원 앱 필수)
│  └─ googleplay/
│     ├─ icon/icon-512.png                 # 512×512
│     ├─ feature-graphic/feature-1024x500.png
│     └─ phone/01~06.png                   # 1080×2160
└─ generate/                               # 이미지 재생성 스크립트(Playwright)
```

모든 이미지는 실제 앱의 디자인 시스템(`apps/native/src/theme.ts`, `DESIGN.md`)을 반영해 렌더링했으며, PNG는 두 스토어 요건에 맞춰 **알파 채널 없이(RGB)** 저장했습니다.

---

## 이미지 규격 & 업로드 위치

### App Store Connect → 미리보기 및 스크린샷
| 자산 | 파일 | 크기 | 필수 |
|---|---|---|---|
| 앱 아이콘 | `appstore/icon/icon-1024.png` | 1024×1024 | ✔ (앱 정보) |
| iPhone 6.9" | `appstore/iphone-6.9/01~06.png` | 1320×2868 | ✔ (최소 1장, 최대 10장) |
| iPad 13" | `appstore/ipad-13/01~02.png` | 2064×2752 | ✔ (iPad 지원 시) |

> Apple은 6.9"와 13"만 올리면 작은 기기용으로 자동 축소해 줍니다.

### Google Play Console → 스토어 등록정보 > 그래픽
| 자산 | 파일 | 크기 | 필수 |
|---|---|---|---|
| 앱 아이콘 | `googleplay/icon/icon-512.png` | 512×512 | ✔ |
| 그래픽 이미지(피처) | `googleplay/feature-graphic/feature-1024x500.png` | 1024×500 | ✔ |
| 휴대전화 스크린샷 | `googleplay/phone/01~06.png` | 1080×2160 | ✔ (최소 2장, 최대 8장) |

---

## ⚠️ 제출 전 반드시 처리할 3가지

1. **계정 삭제 경로** — Apple·Google 모두 계정 생성 앱에 필수. 앱 내 "계정 삭제" 기능을 추가하거나, 데이터 삭제 요청 이메일(`jhyunwoo0228@gmail.com`)을 스토어 양식에 기입. (상세: `metadata/data-safety-and-ratings.md`)
2. **개인정보 처리방침 URL** — `legal/privacy-policy.html`을 `https://leave-web.moveto.workers.dev/privacy`에 게시. (아래 "배포" 참고)
3. **심사용 데모 계정** — 프로덕션 API에 실제 계정 하나 생성 후 부대 1개·휴가 몇 건 등록. 계정 정보를 App Review 노트 / Play 앱 액세스 권한에 기입.

---

## 제출 순서 요약

### App Store
1. App Store Connect에서 앱 생성(번들 ID `app.leave.mobile`).
2. `metadata/appstore.ko.md`·`appstore.en.md` 내용 입력(한국어 기본 + 영어 현지화).
3. 아이콘·스크린샷 업로드.
4. App Privacy(개인정보) 라벨·연령 등급 입력(`data-safety-and-ratings.md`).
5. 빌드 선택: `eas submit -p ios` 또는 App Store Connect에 IPA 업로드.
6. 심사 제출.

### Google Play
1. Play Console에서 앱 생성.
2. 스토어 등록정보에 `metadata/googleplay.*.md` 입력 + 그래픽 업로드.
3. 콘텐츠 등급 설문 + 데이터 안전 양식 작성(`data-safety-and-ratings.md`).
4. 프로덕션(또는 내부 테스트) 트랙에 AAB 업로드: `eas submit -p android` 또는 수동 업로드.
5. 검토 제출.

---

## 이미지 재생성 방법
문구/디자인을 바꾼 뒤 다시 만들려면:
```bash
cd store/generate && node render.mjs
```
- 화면 UI: `store/generate/screens.mjs`
- 문구/기기 크기/레이아웃: `store/generate/render.mjs`
- 한글 렌더링에는 Pretendard 폰트가 필요합니다(`~/.fonts`에 설치됨).
