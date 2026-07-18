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

- `launch.yaml` — 앱 기동 스모크(로그인 ↔ 가입 화면 이동).
- `signup.yaml` — 동의 기반 회원가입 happy path.

## 참고

선택자는 화면의 문구/placeholder에 기반한다. 더 안정적인 자동화를 위해 주요 입력/버튼에
`testID`를 부여하고 Maestro의 `id:` 선택자로 바꾸는 것을 권장한다. 2단계의 입대일/전역일은
네이티브 DatePicker라 기기·OS별 조작이 달라 환경에 맞게 조정이 필요하다.
