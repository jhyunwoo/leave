/**
 * 브라우저에 떨어진 딥링크를 앱으로 한 번 넘겨 본다.
 *
 * ## 왜 필요한가
 *
 * `/u/{username}`과 `/invite/{code}`는 OS가 가로채도록 이미 선언돼 있다
 * (`public/.well-known/`의 apple-app-site-association·assetlinks.json,
 * `apps/native/app.json`의 associatedDomains·intentFilters). 그래서 Safari·Chrome에서
 * 링크를 누르면 앱이 깔린 기기에서는 웹이 아예 뜨지 않는다.
 *
 * 구멍은 **메신저의 인앱 브라우저**다. 카카오톡·인스타그램·라인·네이버의 웹뷰는
 * Universal Link / App Link를 가로채지 않는다. 그런데 이 링크들이 가장 많이 오가는
 * 자리가 바로 거기다. 그 자리에서 앱으로 넘어갈 수 있는 유일한 방법이 커스텀
 * 스킴으로 한 번 이동을 시도하는 것이다. 앱이 없으면 아무 일도 일어나지 않고,
 * 이 문서가 그대로 남아 웹 화면을 그린다.
 *
 * ## 모바일에서만 한다
 *
 * 데스크톱에는 넘어갈 앱이 없다. 그런데도 시도하면 브라우저가 "이 주소를 열 수
 * 없습니다" 대화상자를 띄우는 경우가 있어, 아무 이득 없이 방해만 된다.
 *
 * ## 문서당 한 번만 한다
 *
 * 두 번째 시도는 이미 실패한 시도의 반복이고, SPA 안에서 라우트를 오갈 때마다
 * 주소창을 건드리면 웹에서 친구 프로필을 눌렀을 뿐인 사람이 앱으로 튕긴다.
 * 그래서 호출하는 쪽도 라우트가 아니라 **문서 진입**에서 부른다(`main.tsx`).
 */

/** 이 문서에서 이미 앱을 찔러 봤는가. */
let attempted = false;

/**
 * 넘어갈 앱이 있을 수 있는 기기인가.
 *
 * iPadOS 13+는 데스크톱 Safari와 같은 UA를 보내므로 `Macintosh`로 위장한다.
 * 진짜 맥에는 터치 포인트가 없어 그 둘을 가른다.
 */
export function isMobileWeb(): boolean {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return true;
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
}

/**
 * 모바일이면 커스텀 스킴으로 한 번 이동을 시도한다. 시도했으면 `true`.
 *
 * `false`는 "앱이 없다"가 아니라 "시도하지 않았다"는 뜻이다 — 앱이 실제로 열렸는지는
 * 웹에서 알 수 없다(열렸다면 이 문서는 배경으로 내려갈 뿐 그대로 살아 있다).
 */
export function openAppIfMobile(deepLink: string): boolean {
  if (attempted || !isMobileWeb()) return false;
  attempted = true;
  window.location.href = deepLink;
  return true;
}
