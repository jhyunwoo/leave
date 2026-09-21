/**
 * e2e 스펙들이 함께 쓰는 조각.
 *
 * 이메일 인증과 공개 이름 설정까지 테스트 계정을 준비한다. 웹 앱은 "온보딩은 마쳤는데 공개
 * 이름이 없는" 계정에 1회성 설정 화면을 띄우므로, API로 계정을 만들고 화면을 여는
 * 스펙은 전부 이름을 함께 정해야 한다. 그러지 않으면 어떤 테스트든 그 관문에서 멎는다.
 */

import type { APIRequestContext } from "@playwright/test";

/**
 * 사용자 이름에 쓸 수 있는 짧은 유니크 문자열.
 *
 * 허용 문자 밖의 것은 걷어낸다. 스펙의 꼬리표에는 하이픈이 섞여 들어오기 쉬운데
 * (`friend-0`), 이름에는 쓸 수 없는 문자라 그대로 넣으면 서버가 400으로 거절하고
 * 정작 보려던 화면 흐름은 시작도 못 한 채 테스트가 죽는다.
 */
export function handleSafe(tag: string): string {
  return `${tag}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    .toLowerCase()
    .replace(/[^a-z0-9._]/g, "");
}

/** 테스트 전용 메일함. 실제 수신자에게는 메일을 보내지 않는다. */
export async function testEmailCode(
  request: APIRequestContext,
  email: string,
): Promise<string> {
  const response = await request.get(
    `http://127.0.0.1:8790/?email=${encodeURIComponent(email)}`,
  );
  const messages = (await response.json()) as { text: string }[];
  const code = messages.at(-1)?.text.match(/\b[0-9]{6}\b/)?.[0];
  if (!code) throw new Error("테스트 인증 메일을 받지 못했습니다");
  return code;
}

/** 인증 이외의 e2e fixture도 실제 인증 API를 거쳐 준비한다. */
export async function verifyTestEmail(
  request: APIRequestContext,
  token: string,
) {
  const headers = { Authorization: `Bearer ${token}` };
  const status = await request.get("http://localhost:8787/auth/onboarding", {
    headers,
  });
  const { email } = (await status.json()) as { email: string };
  const sent = await request.post(
    "http://localhost:8787/auth/email-verification/send",
    { headers },
  );
  if (!sent.ok()) throw new Error(`테스트 메일 발송 실패: ${sent.status()}`);
  const code = await testEmailCode(request, email);
  const verified = await request.post(
    "http://localhost:8787/auth/email-verification/verify",
    { headers, data: { code } },
  );
  if (!verified.ok())
    throw new Error(`테스트 이메일 인증 실패: ${verified.status()}`);
}
