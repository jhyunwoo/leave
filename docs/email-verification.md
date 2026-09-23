# 이메일 인증

신규 가입자는 이메일 인증을 마친 뒤 온보딩과 서비스를 이용한다. 가입 직후 발급된
세션은 인증 화면을 이어가기 위한 것으로, 서버가 서비스 API 접근을 차단한다.
기존 가입자는 `0034_email_verification.sql` 실행 시 인증 완료로 간주한다.
새 계정에는 `email_verified_at` 기본값을 두지 않아 자동 인증되지 않는다.

## 사용자 흐름

1. 이메일·비밀번호로 가입하거나, 미인증 계정으로 다시 로그인한다.
2. 웹과 네이티브 앱의 이메일 인증 화면에서 **인증 코드 보내기**를 누른다.
3. 메일의 **이메일 인증하기** 버튼을 누르거나 숫자 6자리를 입력한다. 성공하면 온보딩 또는
   기존 목적지로 이어진다. 버튼은 다른 탭·기기에서 열려도 되며, 인증 화면이 5초마다 상태를
   다시 받아 스스로 넘어간다.
4. 메일이 없다면 스팸함을 확인하고 재발송한다. 주소를 잘못 입력했다면 미인증 계정을
   삭제한 뒤 올바른 주소로 다시 가입할 수 있다.

코드는 10분 동안 유효하고 5회까지 입력할 수 있다. 재발송 간격은 60초, 계정당 발송은
시간당 5회로 제한한다. 재발송은 이전 코드를 무효화한다. 인증 코드 원문은 응답이나
DB에 저장하지 않고 Resend 메일 본문으로만 보낸다. DB에는 계정·발송 ID를 포함한 HMAC을
저장하고 인증 성공 시 지운다. 만료된 레코드는 기존 일일 정리 작업에서 삭제한다.
메일 발송 실패 시 인증 상태는 바뀌지 않으며, 60초 뒤 다시 발송할 수 있다.

## 메일 버튼 링크

버튼은 `GET {API_ORIGIN}/auth/verify-email?u=<사용자>&c=<챌린지>&s=<서명>`을 연다. 서명은
`EMAIL_CODE_SECRET`으로 만든 HMAC이고 코드와 같은 챌린지에 묶여 있어, 재발송하거나 만료되면
함께 무효가 된다.

- GET은 인증하지 않는다. 메일 보안 스캐너가 링크를 미리 열어 보기 때문이다. GET이 돌려주는
  확인 페이지가 스크립트로 곧바로 같은 주소에 POST를 보내고, 그 POST가 인증한다. 스크립트까지
  실행하는 스캐너는 막지 못한다. 그 경우에도 받은편지함을 가진 쪽의 시스템이 연 것이다.
- 이미 인증된 계정의 링크를 다시 POST하면 성공 화면을 보인다(두 번 누름·스캐너 선행).
- 응답에 `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`를
  붙인다. 접속 기록에는 경로만 남아 서명이 저장되지 않는다.
- IP당 10분에 30회로 제한한다.

## 설정과 적용

- `RESEND_API_KEY`: API Worker의 비밀 설정. 로컬에서는 Git에서 제외된
  `apps/api/.dev.vars`에 저장한다. 웹·앱 번들에 넣지 않는다.
- `EMAIL_CODE_SECRET`: 인증 코드 HMAC 키. API Worker의 비밀 설정이며 Resend 키와 따로 둔다.
  로컬에서는 `apps/api/.dev.vars`에 `openssl rand -hex 32` 값을 넣는다.
- `EMAIL_FROM`: `apps/api/wrangler.jsonc`에 설정한 `리브 <noreply@moveto.kr>`.
  Resend에서 발신 도메인이 인증되어 있어야 한다.
- `API_ORIGIN`: 메일 링크가 가리킬 API 주소. `wrangler.jsonc` vars에 운영 값이 있고, 로컬
  `pnpm dev`와 테스트는 `--var`로 로컬 주소를 넣는다. wrangler dev는 요청 주소를 운영 커스텀
  도메인으로 바꿔 보내므로 요청에서 얻지 않는다.
- `RESEND_API_URL`: 생략하면 `https://api.resend.com`. 로컬 자동화 테스트의 메일
  서버를 연결할 때만 덮어쓰며 운영 환경에서는 설정하지 않는다.

운영 배포 전 API Worker에 `pnpm --filter @leave/api exec wrangler secret put RESEND_API_KEY`와
`... secret put EMAIL_CODE_SECRET`으로 두 값을 등록한다. 값은 명령 인수에 적지 않고 프롬프트에
입력한다. `RESEND_API_KEY`는 대기 중인 코드에 영향 없이 교체할 수 있다. `EMAIL_CODE_SECRET`을
교체하면 아직 사용하지 않은 인증 코드가 무효화되어 새 코드를 받아야 한다.

메일은 텍스트와 HTML을 함께 보낸다. HTML은 `apps/api/src/lib/verification-email.ts`에 있고,
메일 클라이언트 호환을 위해 표 레이아웃과 인라인 스타일만 쓴다. 색은 웹 디자인 토큰 값을 옮겨 쓴다.

네이티브 앱의 인증 화면이 포함된 버전을 먼저 배포하고, API 마이그레이션과 웹을 함께
적용한다. 이전 네이티브 버전으로 신규 가입하면 인증 화면을 표시할 수 없으므로 업데이트가
필요하다. 기존 계정과 세션은 마이그레이션 후 계속 사용할 수 있다.

## 검증

`pnpm quality`는 API의 실제 D1/HTTP 인증 테스트와 공유 클라이언트 캐시 갱신 테스트를
포함한다. 외부 Resend만 로컬 메일 서버로 대체해 실제 사용자에게 메일을 보내지 않는다.
`TEST_FILES=email-verification.test.mjs pnpm --filter @leave/api test`로 인증만 실행할 수 있다.

웹 흐름은 로컬 D1에 마이그레이션을 적용한 뒤
`pnpm --filter @leave/web test:e2e auth.spec.ts`로 실행한다. Playwright가 테스트 전용
메일 서버와 더미 키를 사용하는 API를 시작한다. 다른 개발 서버를 실수로 재사용하지
않도록 기본적으로 포트 충돌 시 중단한다. 직접 시작한 **테스트용** 서버를 재사용할 때만
`LEAVE_E2E_REUSE_SERVERS=1`을 지정한다.
