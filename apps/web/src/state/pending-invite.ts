/**
 * 초대 링크로 들어온 코드를 가입이 끝날 때까지 들고 있는 자리.
 *
 * 사용처: `/invite/:code` 착지 화면(담기), 온보딩 그룹 단계(꺼내기·비우기),
 * 옛 `/invite#코드` 착지 화면(담기).
 *
 * sessionStorage인 이유는 가입 흐름이 여러 화면을 지나기 때문이다. 주소에 계속
 * 달고 다니면 코드가 방문 기록에 남고, 그 화면을 그대로 공유하면 초대까지 함께
 * 나간다. 탭을 닫으면 사라지는 저장소가 이 수명과 맞는다.
 *
 * 별도 모듈인 이유는 순환 import를 피하기 위해서다 — 착지 화면과 온보딩 화면이
 * 서로를 가져오지 않게 한다(`next-destination.ts`와 같은 판단).
 */

const PENDING_INVITE_KEY = "leave.pendingInvite";

/** 저장소가 막힌 브라우저(사생활 보호 모드 등)에서도 흐름을 멈추지 않는다. */
export function rememberPendingInvite(code: string): void {
  try {
    sessionStorage.setItem(PENDING_INVITE_KEY, code);
  } catch {
    // 코드를 못 들고 있어도 사용자가 손으로 입력할 수 있다.
  }
}

export function readPendingInvite(): string {
  try {
    return sessionStorage.getItem(PENDING_INVITE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function clearPendingInvite(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_KEY);
  } catch {
    // 지울 수 없으면 어차피 담기지도 않았다.
  }
}
