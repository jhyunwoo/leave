/**
 * 웹/앱 공용 HTTP 응답 처리 유틸.
 *
 * 두 클라이언트(apps/web, apps/native)에서 중복되던 ApiError·unwrap 로직을
 * 프레임워크 비종속 순수 TS로 이 패키지에 모아 재사용한다.
 */

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

/** API_URL과 이미지 key로 이미지 URL을 만든다 (key 없으면 null). */
export function buildImageUrl(
  apiUrl: string,
  key: string | null | undefined,
): string | null {
  return key ? `${apiUrl}/images/${key}` : null;
}
