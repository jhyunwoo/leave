/**
 * 방문자의 기기에 맞는 앱 스토어.
 *
 * 랜딩의 다운로드 버튼이 쓴다. 판정은 두 번 일어난다.
 *  1) 미리 그린 랜딩의 `<head>` 인라인 스크립트(`FIRST_PAINT_SCRIPT`)가 첫 페인트
 *     전에 `<html data-platform>`을 남긴다. CSS가 그 표시로 버튼을 고르므로
 *     휴대폰에서 로그인 버튼이 잠깐 보였다가 배지로 바뀌는 일이 없다.
 *  2) 앱 안에서 다른 주소로 들어왔다가 랜딩으로 넘어오면 그 스크립트가 돈 적이
 *     없다. 그때는 `LandingPage`가 이 함수로 같은 표시를 남긴다.
 *
 * 둘은 같은 답을 내야 한다 — `test/platform.test.ts`가 인라인 스크립트를 직접
 * 돌려 이 함수와 비교한다.
 *
 * iPadOS 13부터 Safari는 데스크톱 맥으로 자신을 소개한다. 터치 지점이 둘 이상인
 * "맥"은 아이패드로 본다.
 */

export type StorePlatform = "ios" | "android";

export function storePlatform(
  userAgent: string,
  maxTouchPoints: number,
): StorePlatform | null {
  if (/Android/i.test(userAgent)) return "android";
  if (/iPhone|iPad|iPod/.test(userAgent)) return "ios";
  if (/Macintosh/.test(userAgent) && maxTouchPoints > 1) return "ios";
  return null;
}

export const APP_STORE_URL =
  "https://apps.apple.com/kr/app/%EB%A6%AC%EB%B8%8C-%EB%B6%80%EB%8C%80-%ED%9C%B4%EA%B0%80-%EC%BA%98%EB%A6%B0%EB%8D%94/id6792287152";
export const PLAY_STORE_URL =
  "https://play.google.com/store/apps/details?id=app.leave.mobile";
