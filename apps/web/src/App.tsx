/**
 * 웹 앱의 라우트 트리와 인증 게이트.
 *
 * 로그인 상태(jotai의 isAuthedAtom)에 따라 두 갈래로 갈린다.
 *  - 로그인:   AppLayout 아래의 달력·휴가·알림·프로필 화면
 *  - 비로그인: 첫 화면은 홍보 랜딩, 그 밖의 경로는 로그인으로 보낸다
 *
 * `me`를 여기서 한 번만 받아 각 화면에 props로 내려준다. 화면마다 다시 받으면
 * 같은 사용자 정보가 화면 전환 중 잠깐씩 달라 보일 수 있다.
 */

import { useAtomValue } from "jotai";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useMe } from "@leave/client";
import { AppLayout } from "./layouts/AppLayout";
import { CalendarPage } from "./pages/CalendarPage";
import { LandingPage } from "./pages/LandingPage";
import { LeaveDetailPage } from "./pages/LeaveDetailPage";
import { LeaveGrantsPage } from "./pages/LeaveGrantsPage";
import { LeavesPage } from "./pages/LeavesPage";
import { LoginPage } from "./pages/LoginPage";
import { NotificationSettingsPage } from "./pages/NotificationSettingsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { SignupPage } from "./pages/SignupPage";
import { UnitManagePage } from "./pages/UnitManagePage";
import { UnitsPage } from "./pages/UnitsPage";
import { isAuthedAtom } from "./state/auth";

function AuthedApp() {
  const me = useMe();

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
        {/* grants가 :leaveId보다 먼저 와야 보유 휴가가 휴가 id로 잡히지 않는다. */}
        <Route
          path="leaves/grants"
          element={<LeaveGrantsPage me={me.data} />}
        />
        <Route
          path="leaves/:leaveId"
          element={<LeaveDetailPage me={me.data} />}
        />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route
          path="notifications/settings"
          element={<NotificationSettingsPage />}
        />
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
