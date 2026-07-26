export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type AdminAccount = {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin";
  mustChangePassword: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type ListResponse<T extends Record<string, unknown>> = {
  items: T[];
  meta: ListMeta;
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const isFormData = init.body instanceof FormData;
  if (init.body && !isFormData) headers.set("Content-Type", "application/json");
  if (init.method && !["GET", "HEAD"].includes(init.method)) {
    headers.set("X-Admin-Request", "1");
  }
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
    ...init,
    headers,
  });
  let body: unknown = null;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => null);
  }
  if (!response.ok) {
    const errorBody =
      body && typeof body === "object"
        ? (body as { error?: string; code?: string })
        : null;
    throw new ApiError(
      errorBody?.error ?? `요청에 실패했습니다 (${response.status})`,
      response.status,
      errorBody?.code,
    );
  }
  return body as T;
}

export const api = {
  get<T>(path: string) {
    return request<T>(path);
  },
  post<T>(path: string, body?: unknown) {
    return request<T>(path, {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  },
  patch<T>(path: string, body: unknown) {
    return request<T>(path, {
      method: "PATCH",
      body: JSON.stringify(body),
    });
  },
  putForm<T>(path: string, form: FormData) {
    return request<T>(path, { method: "PUT", body: form });
  },
  delete<T>(path: string) {
    return request<T>(path, { method: "DELETE" });
  },
};

export async function downloadCsv(path: string): Promise<void> {
  const response = await fetch(`/api${path}`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new ApiError("CSV 파일을 내려받지 못했습니다", response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download =
    response.headers
      .get("content-disposition")
      ?.match(/filename="([^"]+)"/)?.[1] ?? "leave-export.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
