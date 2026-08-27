/**
 * 로그인 뒤 돌아갈 곳(`?next=`)의 해석.
 *
 * 사용처: App.tsx(로그인으로 보낼 때), LoginPage·SignupPage(끝난 뒤 되돌릴 때).
 *
 * 별도 모듈인 이유는 순환 import를 피하기 위해서다 — App.tsx가 LoginPage를 정적으로
 * 가져오므로, LoginPage가 다시 App.tsx를 가져오면 고리가 생긴다.
 */

/**
 * 목적지를 풀어 볼 기준 오리진.
 *
 * 실제 오리진일 필요가 없다 — 알고 싶은 것은 "이 값이 기준 밖으로 나가는가"뿐이고,
 * 고정값을 쓰면 브라우저 없이도 같은 판정을 그대로 시험할 수 있다.
 */
const SAME_ORIGIN_BASE = "https://leave.invalid";

/**
 * `?next=`를 **이 사이트 안의 경로로만** 해석한다.
 *
 * 앞글자만 보는 검사로는 부족하다. `//evil.example`은 막히지만 `/\evil.example`은
 * 그대로 통과하는데, URL 파서는 슬래시 뒤의 역슬래시를 슬래시와 똑같이 읽어
 * 두 값을 같은 외부 주소로 만든다. 문자 규칙을 손으로 흉내 내는 대신 파서에게
 * 직접 물어보고, 기준 오리진 안으로 풀리는 값만 통과시킨다.
 *
 * 돌려주는 값은 파서가 정규화한 경로다 — `/a/../b`가 `/b`로 접혀, 통과한 문자열과
 * 실제로 이동할 곳이 어긋나지 않는다.
 */
export function safeNext(search: string): string {
  const raw = new URLSearchParams(search).get("next");
  if (!raw?.startsWith("/")) return "/";
  try {
    const url = new URL(raw, SAME_ORIGIN_BASE);
    if (url.origin !== SAME_ORIGIN_BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** 로그인·가입 화면 사이를 오갈 때 목적지를 잃지 않도록 붙이는 주소. */
export function withNext(path: string, next: string): string {
  return next === "/" ? path : `${path}?next=${encodeURIComponent(next)}`;
}
