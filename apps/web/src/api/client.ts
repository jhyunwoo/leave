import type { AppType } from "@leave/api";
import { hc } from "hono/client";

export const API_URL: string =
  import.meta.env.VITE_API_URL ?? "http://localhost:8787";

const TOKEN_KEY = "leave.token";

let authToken: string | null = localStorage.getItem(TOKEN_KEY);

export function getAuthToken(): string | null {
  return authToken;
}

export function setAuthToken(token: string | null): void {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export const api = hc<AppType>(API_URL, {
  headers: (): Record<string, string> =>
    authToken ? { Authorization: `Bearer ${authToken}` } : {},
});

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

/** 응답을 열고, 실패 시 서버의 error 메시지로 ApiError를 던진다. */
export async function unwrap<T>(res: {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}): Promise<T> {
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

export function imageUrl(key: string | null | undefined): string | null {
  return key ? `${API_URL}/images/${key}` : null;
}
