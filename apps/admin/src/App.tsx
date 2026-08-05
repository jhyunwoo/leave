import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { api, ApiError, type AdminAccount } from "./api/client";
import { AppShell } from "./components/AppShell";
import { LoadingScreen, ToastProvider } from "./components/ui";
import { ChangePasswordPage } from "./pages/ChangePasswordPage";
import { EntityPage } from "./pages/EntityPage";
import { LoginPage } from "./pages/LoginPage";
import { OverviewPage } from "./pages/OverviewPage";
import { SettingsPage } from "./pages/SettingsPage";

type MeResponse = { admin: AdminAccount };

function AuthenticatedApp({
  admin,
  onLoggedOut,
  onAdminChanged,
}: {
  admin: AdminAccount;
  onLoggedOut: () => void;
  onAdminChanged: (admin: AdminAccount) => void;
}) {
  if (admin.mustChangePassword) {
    return (
      <BrowserRouter>
        <ToastProvider>
          <main className="forced-password-page">
            <div className="auth-brand forced-brand">
              <span className="brand-mark" aria-hidden="true">
                L
              </span>
              <strong>리브 관리자</strong>
            </div>
            <ChangePasswordPage required onChanged={onAdminChanged} />
          </main>
        </ToastProvider>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<AppShell admin={admin} onLoggedOut={onLoggedOut} />}>
            <Route index element={<OverviewPage />} />
            <Route path="users" element={<EntityPage resource="users" />} />
            <Route path="units" element={<EntityPage resource="units" />} />
            <Route path="leaves" element={<EntityPage resource="leaves" />} />
            <Route
              path="unit-invites"
              element={<EntityPage resource="unit-invites" />}
            />
            <Route
              path="content-reports"
              element={<EntityPage resource="content-reports" />}
            />
            <Route
              path="notifications"
              element={<EntityPage resource="notifications" />}
            />
            <Route
              path="access-logs"
              element={<EntityPage resource="access-logs" />}
            />
            <Route
              path="push-logs"
              element={<EntityPage resource="push-logs" />}
            />
            <Route
              path="sessions"
              element={<EntityPage resource="sessions" />}
            />
            <Route path="settings" element={<SettingsPage admin={admin} />} />
            <Route
              path="change-password"
              element={
                <ChangePasswordPage
                  required={false}
                  onChanged={onAdminChanged}
                />
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ["admin-me"],
    queryFn: () => api.get<MeResponse>("/auth/me"),
    retry: false,
  });

  if (me.isPending) return <LoadingScreen label="관리자 세션 확인 중" />;

  const unauthorized =
    me.isError && me.error instanceof ApiError && me.error.status === 401;
  if (unauthorized || !me.data) {
    return (
      <LoginPage
        onSuccess={(admin) => {
          queryClient.setQueryData<MeResponse>(["admin-me"], { admin });
        }}
      />
    );
  }

  return (
    <AuthenticatedApp
      admin={me.data.admin}
      onLoggedOut={() => {
        queryClient.setQueryData(["admin-me"], undefined);
        void queryClient.invalidateQueries({ queryKey: ["admin-me"] });
      }}
      onAdminChanged={(admin) => {
        queryClient.setQueryData<MeResponse>(["admin-me"], { admin });
      }}
    />
  );
}
