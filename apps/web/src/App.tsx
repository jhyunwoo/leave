/**
 * 웹 앱의 라우트 트리와 인증 게이트.
 *
 * 로그인 상태(jotai의 isAuthedAtom)에 따라 두 갈래로 갈린다.
 *  - 로그인:   AppLayout 아래의 달력·휴가·알림·프로필 화면
 *  - 비로그인: 첫 화면은 홍보 랜딩, 그 밖의 경로는 로그인으로 보낸다
 *
 * `me`를 여기서 한 번만 받아 각 화면에 props로 내려준다. 화면마다 다시 받으면
 * 같은 사용자 정보가 화면 전환 중 잠깐씩 달라 보일 수 있다.
 *
 * ## 화면은 전부 `lazy()`로 받는다
 *
 * 로그아웃 방문자가 보는 것(랜딩)과 로그인 사용자가 보는 것(달력·휴가·부대)은
 * 겹치지 않는데, 정적으로 import하면 한 덩어리라 서로의 코드를 다 받는다.
 * 랜딩만 보고 떠나는 사람이 부대 관리 화면까지 내려받을 이유가 없다.
 * 로그인 폼만은 정적으로 둔다 — 크기가 작고, 세션이 끊기면 어느 화면에서든
 * 곧바로 튕겨 오는 곳이라 한 번 더 왕복하면 그만큼 흰 화면이 길어진다.
 */

import { lazy, Suspense, type ReactNode } from "react";
import { useAtomValue } from "jotai";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { useMe, useOnboardingStatus } from "@leave/client";
import { LoginPage } from "./pages/LoginPage";
import { isAuthedAtom } from "./state/auth";

const AppLayout = lazy(() =>
  import("./layouts/AppLayout").then((m) => ({ default: m.AppLayout })),
);
const CalendarPage = lazy(() =>
  import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })),
);
const LandingPage = lazy(() =>
  import("./pages/LandingPage").then((m) => ({ default: m.LandingPage })),
);
const LeaveDetailPage = lazy(() =>
  import("./pages/LeaveDetailPage").then((m) => ({
    default: m.LeaveDetailPage,
  })),
);
const LeaveGrantsPage = lazy(() =>
  import("./pages/LeaveGrantsPage").then((m) => ({
    default: m.LeaveGrantsPage,
  })),
);
const LeavesPage = lazy(() =>
  import("./pages/LeavesPage").then((m) => ({ default: m.LeavesPage })),
);
const NotificationSettingsPage = lazy(() =>
  import("./pages/NotificationSettingsPage").then((m) => ({
    default: m.NotificationSettingsPage,
  })),
);
const NotificationsPage = lazy(() =>
  import("./pages/NotificationsPage").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const ProfilePage = lazy(() =>
  import("./pages/ProfilePage").then((m) => ({ default: m.ProfilePage })),
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const InviteLandingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({
    default: m.InviteLandingPage,
  })),
);
const OnboardingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({ default: m.OnboardingPage })),
);
const UnitManagePage = lazy(() =>
  import("./pages/UnitManagePage").then((m) => ({ default: m.UnitManagePage })),
);
const UnitsPage = lazy(() =>
  import("./pages/UnitsPage").then((m) => ({ default: m.UnitsPage })),
);

/** 화면 코드를 받아오는 동안 자리를 지키는 스피너. */
function FullPageSpinner() {
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

function RouteSuspense(props: { children: ReactNode }) {
  return <Suspense fallback={<FullPageSpinner />}>{props.children}</Suspense>;
}

function CompletedApp() {
  const me = useMe();

  if (me.isPending) {
    return <FullPageSpinner />;
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

function AuthedApp() {
  const onboarding = useOnboardingStatus();
  if (onboarding.isPending) return <FullPageSpinner />;
  if (!onboarding.data) return <Navigate to="/login" replace />;
  if (!onboarding.data.completed)
    return <OnboardingPage status={onboarding.data} />;
  return <CompletedApp />;
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
      {/* 화면 코드를 나눠 받으므로 라우트 전체를 Suspense로 감싼다. 로그인 뒤
          화면 사이 이동은 AppLayout 안쪽 Suspense가 받아, 내비게이션은 그대로
          두고 본문만 스피너로 바뀐다. */}
      <RouteSuspense>
        <Routes>
          <Route path="/invite" element={<InviteLandingPage />} />
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
      </RouteSuspense>
    </BrowserRouter>
  );
}
