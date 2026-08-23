/**
 * 로그인 뒤 돌아갈 곳(`?next=`)의 해석.
 *
 * 사용처: App.tsx(로그인으로 보낼 때), LoginPage·SignupPage(끝난 뒤 되돌릴 때).
 *
 * 별도 모듈인 이유는 순환 import를 피하기 위해서다 — App.tsx가 LoginPage를 정적으로
 * 가져오므로, LoginPage가 다시 App.tsx를 가져오면 고리가 생긴다.
 */

/**
 * `?next=`를 **이 사이트 안의 경로로만** 해석한다.
 *
 * `//evil.example`처럼 스킴 없이 슬래시 두 개로 시작하는 값도 브라우저는 외부
 * 주소로 읽는다. 그래서 슬래시 하나로 시작하는 경로만 통과시킨다 — 이 검사가
 * 없으면 로그인 화면이 그대로 오픈 리다이렉트가 된다.
 */
export function safeNext(search: string): string {
  const raw = new URLSearchParams(search).get("next");
  if (!raw) return "/";
  if (!raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

/** 로그인·가입 화면 사이를 오갈 때 목적지를 잃지 않도록 붙이는 주소. */
export function withNext(path: string, next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
