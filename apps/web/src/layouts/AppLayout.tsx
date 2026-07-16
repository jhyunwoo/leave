import { NavLink, Outlet } from "react-router";
import type { Me } from "../api/queries";
import { useNotifications } from "../api/queries";
import { Avatar } from "../components/Avatar";

const linkStyle = ({ isActive }: { isActive: boolean }) =>
  ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "8px 16px",
    borderRadius: "var(--r-pill)",
    fontSize: 14,
    fontWeight: 600,
    textDecoration: "none",
    color: "var(--ink)",
    background: isActive ? "var(--canvas-soft)" : "transparent",
    transition: "background-color 0.15s ease",
  }) as const;

export function AppLayout(props: { me: Me }) {
  const notifications = useNotifications();
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav
        style={{
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "var(--canvas)",
          borderBottom: "1px solid rgba(14,15,12,0.06)",
        }}
        aria-label="주 메뉴"
      >
        <div
          className="container"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-lg)",
            height: 64,
          }}
        >
          <NavLink
            to="/"
            style={{
              textDecoration: "none",
              color: "var(--ink)",
              fontWeight: 900,
              fontSize: 22,
              letterSpacing: "-0.02em",
              display: "flex",
              alignItems: "center",
              marginRight: "var(--sp-md)",
            }}
            aria-label="리브 홈"
          >
            리브
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                background: "var(--primary)",
                marginLeft: 4,
              }}
            />
          </NavLink>

          <div style={{ display: "flex", gap: "var(--sp-xs)", flex: 1 }}>
            <NavLink to="/" style={linkStyle} end>
              달력
            </NavLink>
            <NavLink to="/leaves" style={linkStyle}>
              내 휴가
            </NavLink>
            <NavLink to="/notifications" style={linkStyle}>
              알림
              {unread > 0 && (
                <span
                  style={{
                    minWidth: 18,
                    height: 18,
                    borderRadius: "var(--r-pill)",
                    background: "var(--negative)",
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0 5px",
                  }}
                  aria-label={`읽지 않은 알림 ${unread}개`}
                >
                  {unread}
                </span>
              )}
            </NavLink>
          </div>

          <NavLink
            to="/profile"
            aria-label="프로필"
            style={{ display: "flex", borderRadius: "50%" }}
          >
            <Avatar
              name={props.me.user.name}
              imageKey={props.me.user.profileImageKey}
              size={36}
            />
          </NavLink>
        </div>
      </nav>

      <main className="container" style={{ flex: 1 }}>
        <Outlet />
      </main>
    </div>
  );
}
