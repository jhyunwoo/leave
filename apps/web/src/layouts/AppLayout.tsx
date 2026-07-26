import { NavLink, Outlet } from "react-router";
import type { Me } from "../api/queries";
import { useNotifications } from "../api/queries";
import { Avatar } from "../components/Avatar";
import { BrandLockup } from "../components/BrandLockup";

const navClassName = ({ isActive }: { isActive: boolean }) =>
  `app-nav-item${isActive ? " is-active" : ""}`;

export function AppLayout(props: { me: Me }) {
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;

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
            <Avatar
              name={props.me.user.name}
              imageKey={props.me.user.profileImageKey}
              size={36}
            />
          </NavLink>
        </div>
      </nav>

      <main className="container app-main">
        <Outlet />
      </main>
    </div>
  );
}
