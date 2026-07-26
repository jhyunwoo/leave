import { FileClock, Monitor, ShieldCheck } from "lucide-react";
import { useState } from "react";
import type { AdminAccount } from "../api/client";
import { AdminOnly } from "../components/AppShell";
import { EntityPage } from "./EntityPage";

type Tab = "admins" | "admin-sessions" | "audit-logs";

export function SettingsPage({ admin }: { admin: AdminAccount }) {
  const [tab, setTab] = useState<Tab>("admins");
  return (
    <AdminOnly admin={admin}>
      <div className="settings-page">
        <div className="settings-tabs" role="tablist" aria-label="관리자 설정">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "admins"}
            className={tab === "admins" ? "is-active" : ""}
            onClick={() => setTab("admins")}
          >
            <ShieldCheck size={18} /> 관리자 계정
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "admin-sessions"}
            className={tab === "admin-sessions" ? "is-active" : ""}
            onClick={() => setTab("admin-sessions")}
          >
            <Monitor size={18} /> 관리자 세션
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "audit-logs"}
            className={tab === "audit-logs" ? "is-active" : ""}
            onClick={() => setTab("audit-logs")}
          >
            <FileClock size={18} /> 감사 로그
          </button>
        </div>
        <EntityPage resource={tab} />
      </div>
    </AdminOnly>
  );
}
