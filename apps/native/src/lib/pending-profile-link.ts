/**
 * 로그인 전에 도착한 프로필 딥링크를 기억했다가, 준비되면 그 자리로 보낸다.
 *
 * 사용처: apps/native/src/app/_layout.tsx.
 *
 * ## 왜 필요한가
 *
 * `/u/{username}`은 인증이 필요한 라우트라 `Stack.Protected` 안에 있다. 로그아웃
 * 상태에서 공유 링크를 열면 그 화면이 트리에 없으므로 라우터는 로그인으로 떨어뜨리고,
 * **원래 가려던 곳은 그대로 사라진다.** 앱을 깔자마자 친구 링크를 눌러 들어온
 * 사람이 로그인·온보딩을 다 마치고 나면 달력 앞에 서 있게 되는 것이다.
 *
 * 그래서 아직 갈 수 없는 동안 도착한 링크를 여기 담아 두고, 로그인과 온보딩과
 * 이름 설정이 모두 끝난 순간 한 번 꺼내 이동한다.
 *
 * 링크에서 이름을 뽑는 규칙 자체는 `@leave/shared`의 `profileUsernameFromUrl`에
 * 있다 — 주소를 만드는 쪽(`profileLink`)과 읽는 쪽이 갈라지면 안 되기 때문이다.
 * 여기 있는 것은 "언제 담고 언제 꺼내는가"라는 앱 수명주기 상태뿐이다.
 */

import { profileUsernameFromUrl } from "@leave/shared";

let pending: string | null = null;

/** 지금은 갈 수 없는 프로필 링크를 담아 둔다. 프로필 링크가 아니면 무시한다. */
export function capturePendingProfile(url: string): void {
  const username = profileUsernameFromUrl(url);
  if (username) pending = username;
}

/** 담아 둔 목적지를 꺼내고 비운다. 한 번만 소비된다. */
export function takePendingProfile(): string | null {
  const username = pending;
  pending = null;
  return username;
}

/** 로그아웃·계정 전환 때 남은 목적지를 버린다. */
export function clearPendingProfile(): void {
  pending = null;
}
