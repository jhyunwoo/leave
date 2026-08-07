/**
 * 관리자 워커 공용 타입.
 *
 * `AdminAppEnv`의 Variables는 미들웨어가 채운다 — 인증을 통과한 라우트라면
 * `c.get("admin")`이 항상 있다고 믿어도 된다.
 */

import type { AdminAccountRow } from "@leave/api/db";

export type AdminAppEnv = {
  Bindings: Env;
  Variables: {
    admin: AdminAccountRow;
    adminSessionId: string;
  };
};

export type AdminRole = "owner" | "admin";

export type ListMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};
