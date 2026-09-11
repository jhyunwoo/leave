/**
 * 앱을 켤 때 라우트 트리를 그릴 수 있는지 판단한다.
 *
 * 사용처: apps/native/src/app/_layout.tsx.
 *
 * `Stack.Protected`의 guard가 온보딩 상태에서 나오므로, 그 상태를 모르는 동안
 * 그리면 멀쩡한 계정이 온보딩 화면으로 한 번 튕긴다. 그래서 기다리는데,
 * **기다리는 동안 무엇을 보여주는지가 문제였다.**
 *
 * 예전에는 토큰을 되살린 직후 스플래시를 내리면서 아무것도 반환하지 않아 빈 캔버스가
 * 남았고, 오프라인에서는 그 상태가 끝나지 않았다 — `networkMode: "offlineFirst"`가
 * 첫 실패 뒤 재시도를 *일시정지*하므로 `isPending`이 영구히 참이다. 즉 통신이 끊긴
 * 곳에서 앱이 아예 열리지 않았고, 정작 그런 곳을 위해 저장해 둔 달력·내 휴가에
 * 닿을 수 없었다.
 *
 * 함수로 떼어 둔 이유는 이 판단을 테스트로 고정하기 위해서다 — 화면을 띄워 보고서야
 * 알 수 있는 종류의 버그였다.
 */

export type StartupGate = "loading" | "unreachable" | "ready";

export function resolveStartupGate(input: {
  /** SecureStore에서 토큰을 읽고 전역 상태에 반영까지 끝났는가. */
  sessionReady: boolean;
  /** 디스크 쿼리 캐시 복원 중인가. 끝나기 전에는 "없다"와 "아직 모른다"를 못 가른다. */
  isRestoring: boolean;
  authenticated: boolean;
  /** 온보딩 상태를 알고 있는가(서버 응답이든 디스크 캐시든). */
  hasOnboardingData: boolean;
  /** TanStack의 fetchStatus. 오프라인에서 재시도가 멈추면 `"paused"`다. */
  onboardingFetchStatus: "fetching" | "paused" | "idle";
  onboardingErrored: boolean;
}): StartupGate {
  if (!input.sessionReady || input.isRestoring) return "loading";
  // 비로그인은 온보딩 상태가 필요 없다 — 로그인 화면이 목적지다.
  if (!input.authenticated || input.hasOnboardingData) return "ready";
  // 더 기다려도 오지 않는다. 빈 화면 대신 재시도를 준다.
  if (input.onboardingFetchStatus === "paused" || input.onboardingErrored)
    return "unreachable";
  return "loading";
}
