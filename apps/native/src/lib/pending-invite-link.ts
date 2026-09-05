/**
 * 로그인 전에 도착한 초대 딥링크를 기억했다가, 준비되면 그 자리로 보낸다.
 *
 * 사용처: apps/native/src/app/_layout.tsx.
 *
 * `pending-profile-link.ts`와 같은 문제를 같은 방식으로 푼다 — `/invite/{code}`도
 * `Stack.Protected` 안이라 로그아웃 상태에서 링크를 열면 목적지가 사라진다.
 * 초대는 그 사고가 특히 아픈 자리다: 앱을 깔자마자 초대 링크를 눌러 들어온
 * 사람이 가입을 마치고 나면 **아무 그룹에도 속하지 않은 채** 달력 앞에 선다.
 *
 * 둘을 한 모듈로 합치지 않은 이유는 목적지가 다르기 때문이다 — 담긴 값이
 * 사용자 이름인지 초대코드인지에 따라 가는 화면도, 꺼낼 시점도 다르다.
 *
 * 링크에서 코드를 뽑는 규칙 자체는 `@leave/shared`의 `inviteCodeFromUrl`에 있다.
 * 여기 있는 것은 "언제 담고 언제 꺼내는가"라는 앱 수명주기 상태뿐이다.
 */

import { inviteCodeFromUrl } from "@leave/shared";

let pending: string | null = null;

/** 지금은 갈 수 없는 초대 링크를 담아 둔다. 초대 링크가 아니면 무시한다. */
export function capturePendingInvite(url: string): void {
  const code = inviteCodeFromUrl(url);
  if (code) pending = code;
}

/**
 * 담아 둔 초대코드를 비우지 않고 읽는다.
 *
 * 온보딩의 그룹 단계가 입력칸을 미리 채울 때 쓴다. 여기서 소비해 버리면,
 * 사용자가 그 단계를 건너뛴 경우 초대가 조용히 사라진다 — 건너뛴 사람은
 * 온보딩이 끝난 뒤 초대 화면으로 안내받아야 한다.
 */
export function peekPendingInvite(): string | null {
  return pending;
}

/** 담아 둔 초대코드를 꺼내고 비운다. 한 번만 소비된다. */
export function takePendingInvite(): string | null {
  const code = pending;
  pending = null;
  return code;
}

/** 로그아웃·계정 전환 때 남은 초대를 버린다. */
export function clearPendingInvite(): void {
  pending = null;
}
