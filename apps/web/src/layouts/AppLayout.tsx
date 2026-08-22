/**
 * 로그인 상태의 공통 레이아웃 — 상단 내비게이션과 알림 배지.
 * 사용처: App.tsx의 인증된 라우트 전부.
 */

import { Suspense } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import type { Me } from "@leave/client";
import { useNotifications, useNotificationSummary } from "@leave/client";
import { Avatar } from "../components/Avatar";
import { BrandLockup } from "../components/BrandLockup";

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `app-nav-item${isActive ? " is-active" : ""}`;

export function AppLayout(props: { me: Me }) {
  const { pathname } = useLocation();
  const showingInbox = pathname === "/notifications";
  // A disabled observer still receives the inbox page's cache updates without
  // starting a second full-list request or polling timer.
  const inbox = useNotifications({ enabled: false });
  const summary = useNotificationSummary({ enabled: !showingInbox });
  const unread =
    (showingInbox ? inbox.data?.unreadCount : summary.data?.unreadCount) ?? 0;

  return (
    <div className="app-shell">
      <nav className="app-nav" aria-label="주 메뉴">
        <div className="container app-nav-inner">
          <NavLink to="/" className="app-wordmark" aria-label="리브 홈">
            <BrandLockup iconSize={30} />
          </NavLink>

          <div className="app-nav-links">
            <NavLink to="/" className={navClassName} end>
              달력
            </NavLink>
            <NavLink to="/leaves" className={navClassName}>
              내 휴가
            </NavLink>
            <NavLink to="/friends" className={navClassName}>
              친구
            </NavLink>
            <NavLink to="/notifications" className={navClassName}>
              알림
              {unread > 0 ? (
                <span
                  className="app-unread"
                  aria-label={`읽지 않은 알림 ${unread}개`}
                >
                  {unread > 99 ? "99+" : unread}
                </span>
              ) : null}
            </NavLink>
          </div>

          <NavLink
            to="/profile"
            aria-label="프로필"
            className="app-profile-link"
          >
            <Avatar name={props.me.user.name} size={36} />
          </NavLink>
        </div>
      </nav>

      {/* 화면마다 코드를 따로 받으므로(App.tsx의 lazy) 여기에 Suspense를 둔다.
          바깥 Suspense가 받으면 내비게이션까지 통째로 스피너로 바뀐다. */}
      <main className="container app-main">
        <Suspense
          fallback={
            <div style={{ padding: "var(--sp-3xl) 0", textAlign: "center" }}>
              <div className="spinner" aria-label="불러오는 중" />
            </div>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
