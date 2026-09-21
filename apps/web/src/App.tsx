/**
 * 웹 앱의 라우트 트리와 인증 게이트.
 *
 * 로그인 상태(jotai의 isAuthedAtom)에 따라 두 갈래로 갈린다.
 *  - 로그인:   AppLayout 아래의 달력·휴가·알림·프로필 화면
 *  - 비로그인: 첫 화면은 홍보 랜딩, 공유 프로필은 공개 화면, 그 밖은 로그인
 *
 * `me`를 여기서 한 번만 받아 각 화면에 props로 내려준다. 화면마다 다시 받으면
 * 같은 사용자 정보가 화면 전환 중 잠깐씩 달라 보일 수 있다.
 *
 * ## 딥링크 목적지를 잃지 않는다
 *
 * `/u/{username}`은 공유되는 주소라 로그아웃 상태로 열리면 최소 공개 프로필을
 * 보여준다. 그 화면의 로그인 CTA가 원래 주소를 `?next=`에 실어 보내므로 로그인·
 * 가입이 끝나면 인증 프로필로 돌아온다. 온보딩과 이름 설정은 라우트를 바꾸지 않고
 * 그 위에 덮어 그려, 중간 단계를 지나도 목적지를 잃지 않는다.
 *
 * ## 앱 화면은 `lazy()`로, 공개 페이지는 정적으로 받는다
 *
 * 로그아웃 방문자가 보는 것(랜딩)과 로그인 사용자가 보는 것(달력·휴가·부대)은
 * 겹치지 않는데, 정적으로 import하면 한 덩어리라 서로의 코드를 다 받는다.
 * 랜딩만 보고 떠나는 사람이 부대 관리 화면까지 내려받을 이유가 없다.
 *
 * 예외가 셋이다.
 *  - 로그인 폼: 크기가 작고, 세션이 끊기면 어느 화면에서든 곧바로 튕겨 오는
 *    곳이라 한 번 더 왕복하면 그만큼 흰 화면이 길어진다.
 *  - 랜딩·가이드: 이 둘은 빌드 시 HTML로 미리 그려져 나가고, 브라우저는 그
 *    HTML에 곧바로 hydrate한다. `lazy()`로 두면 hydrate 시점에 청크가 아직
 *    없어 Suspense 대체 화면이 한 번 끼어들고, 미리 그려 둔 본문이 스피너로
 *    바뀌었다가 되돌아온다. 정적 import는 그 왕복을 없애 오히려 이 두 페이지의
 *    LCP를 줄인다(청크·CSS 왕복 2회 제거).
 */

import { lazy, Suspense, type ReactNode } from "react";
import { useAtomValue } from "jotai";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router";
import { useAuthBootstrap, useMe } from "@leave/client";
import { GuidePage } from "./pages/GuidePage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { RouteMetadata } from "./seo/RouteMetadata";
import { isAuthedAtom } from "./state/auth";
import { safeNext } from "./state/next-destination";

const VerifyEmailPage = lazy(() =>
  import("./pages/VerifyEmailPage").then((m) => ({
    default: m.VerifyEmailPage,
  })),
);

const AppLayout = lazy(() =>
  import("./layouts/AppLayout").then((m) => ({ default: m.AppLayout })),
);
const CalendarPage = lazy(() =>
  import("./pages/CalendarExperiencePage").then((m) => ({
    default: m.CalendarPage,
  })),
);
const FriendsPage = lazy(() =>
  import("./pages/FriendsPage").then((m) => ({ default: m.FriendsPage })),
);
const FriendDetailPage = lazy(() =>
  import("./pages/FriendDetailPage").then((m) => ({
    default: m.FriendDetailPage,
  })),
);
const UserProfilePage = lazy(() =>
  import("./pages/UserProfilePage").then((m) => ({
    default: m.UserProfilePage,
  })),
);
const PublicUserProfilePage = lazy(() =>
  import("./pages/PublicUserProfilePage").then((m) => ({
    default: m.PublicUserProfilePage,
  })),
);
const UsernameSetupPage = lazy(() =>
  import("./pages/UsernameSetupPage").then((m) => ({
    default: m.UsernameSetupPage,
  })),
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
const ServiceProgressDetailPage = lazy(() =>
  import("./pages/ServiceProgressDetailPage").then((m) => ({
    default: m.ServiceProgressDetailPage,
  })),
);
const SignupPage = lazy(() =>
  import("./pages/SignupPage").then((m) => ({ default: m.SignupPage })),
);
const InviteLandingPage = lazy(() =>
  import("./pages/OnboardingPage").then((m) => ({
    default: m.InviteLandingPage,
  })),
);
const InviteJoinPage = lazy(() =>
  import("./pages/InviteJoinPage").then((m) => ({
    default: m.InviteJoinPage,
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

/**
 * 화면 코드를 받아오는 동안 자리를 지키는 스피너.
 *
 * `role="status"`가 필요하다 — 역할 없는 <div>에는 aria-label을 붙일 수 없어
 * (ARIA에서 금지된 조합) 보조기술과 브라우저 에이전트가 이름을 무시한다.
 */
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
      <div className="spinner" role="status" aria-label="불러오는 중" />
    </div>
  );
}

function RouteSuspense(props: { children: ReactNode }) {
  return <Suspense fallback={<FullPageSpinner />}>{props.children}</Suspense>;
}

/**
 * 로그인으로 보내면서 지금 주소를 목적지로 실어 준다.
 *
 * `?next=`에 담는 값은 항상 이 사이트 안의 경로다. 아래 `safeNext`가 그것을
 * 다시 확인한다 — 그러지 않으면 `?next=https://evil.example`로 오픈 리다이렉트가 된다.
 */
function RedirectToLogin() {
  const location = useLocation();
  const next = `${location.pathname}${location.search}`;
  return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
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
      {/* 전체 화면 복무율은 공용 내비게이션 바깥에서 뷰포트를 모두 쓴다. */}
      <Route
        path="service-progress"
        element={<ServiceProgressDetailPage me={me.data} />}
      />
      <Route element={<AppLayout me={me.data} />}>
        <Route index element={<CalendarPage me={me.data} />} />
        <Route path="units" element={<UnitsPage me={me.data} />} />
        <Route path="units/manage" element={<UnitManagePage me={me.data} />} />
        <Route path="leaves" element={<LeavesPage />} />
        <Route path="friends" element={<FriendsPage me={me.data} />} />
        {/* 내부 id를 쓰던 옛 주소. 정본 `/u/{username}`으로 넘긴다. */}
        <Route path="friends/:userId" element={<FriendDetailPage />} />
        <Route path="u/:username" element={<UserProfilePage />} />
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

/**
 * 인증된 사용자를 세 갈래로 나눈다: 온보딩 → 이름 설정 → 앱.
 *
 * 앞의 두 갈래는 라우트를 갈아치우지 않고 그 자리에 덮어 그린다. 그래서
 * `/u/hyunwoo`로 들어온 사람이 온보딩과 이름 설정을 마치면, 주소가 그대로라
 * 곧바로 그 프로필이 열린다.
 */
function AuthedApp() {
  const onboarding = useAuthBootstrap();
  if (onboarding.isPending) return <FullPageSpinner />;
  if (!onboarding.data) return <Navigate to="/login" replace />;
  if (!onboarding.data.emailVerified)
    return <VerifyEmailPage email={onboarding.data.email} />;
  if (!onboarding.data.completed)
    return <OnboardingPage status={onboarding.data} />;
  // 0023 이전에 가입해 아직 공개 이름이 없는 계정 — 1회성 설정 화면.
  if (!onboarding.data.username) return <UsernameSetupPage />;
  return <CompletedApp />;
}

/** 로그아웃 상태: 첫 화면과 공유 프로필은 공개, 그 외 경로는 로그인으로. */
function PublicApp() {
  return (
    <Routes>
      <Route index element={<LandingPage />} />
      <Route path="u/:username" element={<PublicUserProfilePage />} />
      <Route path="*" element={<RedirectToLogin />} />
    </Routes>
  );
}

/** 이미 로그인한 사람이 /login·/signup에 오면 원래 가려던 곳으로 보낸다. */
function AuthedRedirect() {
  const location = useLocation();
  return <Navigate to={safeNext(location.search)} replace />;
}

/**
 * 라우터 없는 라우트 트리.
 *
 * 브라우저에서는 아래 `App`이 BrowserRouter로, 빌드 시 미리 그리는 쪽은
 * `entry-prerender.tsx`가 MemoryRouter로 감싼다. 두 라우터 모두 DOM을 만들지
 * 않으므로 같은 마크업이 나오고, 그래서 미리 그린 HTML에 그대로 hydrate된다.
 */
export function AppRoutes() {
  const isAuthed = useAtomValue(isAuthedAtom);

  return (
    <>
      {/* 문서 제목·canonical·robots를 라우트 하나에 맞춰 갱신한다. 화면마다
          document.title을 쓰지 않기 위한 유일한 자리. */}
      <RouteMetadata />
      {/* 화면 코드를 나눠 받으므로 라우트 전체를 Suspense로 감싼다. 로그인 뒤
          화면 사이 이동은 AppLayout 안쪽 Suspense가 받아, 내비게이션은 그대로
          두고 본문만 스피너로 바뀐다. */}
      <RouteSuspense>
        <Routes>
          {/* 공개 안내 문서. 로그인 여부와 무관하게 같은 주소에서 열려야
              하므로 인증 분기 바깥에 둔다(색인 대상 페이지다). */}
          <Route path="/guide" element={<GuidePage />} />
          {/* 초대 링크 두 형태 모두 인증 분기 바깥이다 — 로그아웃 상태로 열려야
              한다. `/invite/:code`가 지금 발급되는 형태이고, `/invite`(+#코드)는
              이미 뿌려진 옛 링크를 위해 남겨 둔다. */}
          <Route path="/invite" element={<InviteLandingPage />} />
          <Route path="/invite/:code" element={<InviteJoinPage />} />
          <Route
            path="/login"
            element={isAuthed ? <AuthedRedirect /> : <LoginPage />}
          />
          <Route
            path="/signup"
            element={isAuthed ? <AuthedRedirect /> : <SignupPage />}
          />
          <Route path="*" element={isAuthed ? <AuthedApp /> : <PublicApp />} />
        </Routes>
      </RouteSuspense>
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
