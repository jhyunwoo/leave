import { useAtomValue } from "jotai";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useMe } from "./api/queries";
import { AppLayout } from "./layouts/AppLayout";
import { CalendarPage } from "./pages/CalendarPage";
import { LandingPage } from "./pages/LandingPage";
import { LeaveGrantsPage } from "./pages/LeaveGrantsPage";
import { LeavesPage } from "./pages/LeavesPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SignupPage } from "./pages/SignupPage";
import { UnitManagePage } from "./pages/UnitManagePage";
import { UnitsPage } from "./pages/UnitsPage";
import { isAuthedAtom } from "./state/auth";

function AuthedApp() {
  const me = useMe(true);

  if (me.isPending) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="spinner" aria-label="불러오는 중" />
      </div>
    );
  }
  if (me.isError || !me.data) {
    return <Navigate to="/login" replace />;
  }

  return (
    <Routes>
      <Route element={<AppLayout me={me.data} />}>
        <Route index element={<CalendarPage me={me.data} />} />
        <Route path="units" element={<UnitsPage me={me.data} />} />
        <Route path="units/manage" element={<UnitManagePage me={me.data} />} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route
          path="leaves/grants"
          element={<LeaveGrantsPage me={me.data} />}
        />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="profile" element={<ProfilePage me={me.data} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

/** 로그아웃 상태: 첫 화면은 홍보 랜딩, 그 외 경로는 로그인으로. */
function PublicApp() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  );
}

export function App() {
  const isAuthed = useAtomValue(isAuthedAtom);

  return (
    <BrowserRouter>
      <Routes>
        <Route
          path="/login"
          element={isAuthed ? <Navigate to="/" replace /> : <LoginPage />}
        />
        <Route
          path="/signup"
          element={isAuthed ? <Navigate to="/" replace /> : <SignupPage />}
        />
        <Route path="*" element={isAuthed ? <AuthedApp /> : <PublicApp />} />
      </Routes>
    </BrowserRouter>
  );
}
