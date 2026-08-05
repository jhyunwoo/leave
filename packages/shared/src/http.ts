/**
 * 웹/앱 공용 HTTP 응답 처리 유틸.
 *
 * 두 클라이언트(apps/web, apps/native)에서 중복되던 ApiError·unwrap 로직을
 * 프레임워크 비종속 순수 TS로 이 패키지에 모아 재사용한다.
 */

/** 스탠드얼론(스토어·OTA) 클라이언트가 붙을 기본 API 주소. */
export const PRODUCTION_API_URL = "https://leave-api.moveto.workers.dev";

/**
 * 클라이언트가 붙을 API 주소를 정한다.
 *
 * envUrl은 번들 빌드 시점에 주입되는 값이라 비어 있을 수 있다. 특히 `eas update`는
 * eas.json 빌드 프로필의 env를 주입하지 않으므로, OTA 번들에서는 envUrl이 없다.
 * 이때 localhost로 떨어지면 기기가 자기 자신에게 요청해 아무것도 불러오지 못하므로,
 * 개발 서버(devHost)에 붙어 있지 않으면 언제나 프로덕션으로 보낸다.
 *
 * @param envUrl 빌드 시 주입된 API 주소 (EXPO_PUBLIC_API_URL 등)
 * @param devHost 개발 서버 호스트 — 붙어 있을 때만 그 PC의 8787로 보낸다
 */
export function resolveApiUrl(options: {
  envUrl?: string | null;
  devHost?: string | null;
}): string {
  const envUrl = options.envUrl?.trim();
  if (envUrl) return envUrl;
  const devHost = options.devHost?.trim();
  if (devHost) return `http://${devHost}:8787`;
  return PRODUCTION_API_URL;
}

/** 서버가 내려준 error 메시지와 상태 코드를 담는 오류. */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** fetch/hono 응답과 호환되는 최소 형태. */
export interface UnwrappableResponse {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}

/**
 * 응답을 열고, 실패 시 서버의 error 메시지로 ApiError를 던진다.
 * 성공 시 파싱된 JSON을 T로 반환한다.
 */
export async function unwrap<T>(res: UnwrappableResponse): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      data && typeof data === "object" && "error" in data
        ? String((data as { error: unknown }).error)
        : "요청을 처리하지 못했습니다";
    throw new ApiError(message, res.status);
  }
  return data as T;
}
