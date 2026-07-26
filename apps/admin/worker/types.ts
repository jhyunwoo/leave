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
