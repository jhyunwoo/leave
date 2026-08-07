/**
 * 관리자 화면의 공통 뼈대 — 좌측 내비게이션, 상단바, 전역 검색.
 *
 * 사용처: apps/admin/src/App.tsx 의 인증된 라우트 전부.
 * `AdminOnly`는 owner 전용 화면(관리자 계정·감사 로그)을 감싸는 권한 가드다.
 */

import {
  Bell,
  Building2,
  CalendarDays,
  ChevronDown,
  FileClock,
  Flag,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Monitor,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";
import { api, type AdminAccount } from "../api/client";

const navigation = [
  { to: "/", label: "개요", icon: LayoutDashboard },
  { to: "/users", label: "사용자", icon: Users },
  { to: "/units", label: "부대", icon: Building2 },
  { to: "/leaves", label: "휴가", icon: CalendarDays },
  { to: "/unit-invites", label: "초대코드", icon: KeyRound },
  { to: "/content-reports", label: "신고", icon: Flag },
  { to: "/notifications", label: "알림", icon: Bell },
  { to: "/access-logs", label: "접속 로그", icon: FileClock },
  { to: "/push-logs", label: "푸시 로그", icon: Send },
  { to: "/sessions", label: "세션", icon: Monitor },
] as const;

const pageTitles: Record<string, string> = {
  "/": "운영 개요",
  "/users": "사용자",
  "/units": "부대",
  "/leaves": "휴가",
  "/unit-invites": "초대코드",
  "/content-reports": "신고",
  "/notifications": "알림",
  "/access-logs": "접속 로그",
  "/push-logs": "푸시 로그",
  "/sessions": "세션",
  "/settings": "설정",
  "/change-password": "비밀번호 변경",
};

type Props = {
  admin: AdminAccount;
  onLoggedOut: () => void;
};

export function AppShell({ admin, onLoggedOut }: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [query, setQuery] = useState("");

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    const value = query.trim();
    if (!value) return;
    navigate(`/users?q=${encodeURIComponent(value)}`);
  };

  const logout = async () => {
    await api.post("/auth/logout").catch(() => undefined);
    onLoggedOut();
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileMenuOpen ? "is-open" : ""}`}>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">
            L
          </span>
          <span>리브 관리자</span>
          <button
            className="icon-button sidebar-close"
            type="button"
            aria-label="메뉴 닫기"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X size={22} />
          </button>
        </div>
        <nav className="side-nav" aria-label="관리자 주 메뉴">
          {navigation.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              onClick={() => setMobileMenuOpen(false)}
              className={({ isActive }) =>
                `side-nav-link ${isActive ? "is-active" : ""}`
              }
            >
              <Icon size={21} strokeWidth={1.8} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <NavLink
            to="/settings"
            onClick={() => setMobileMenuOpen(false)}
            className={({ isActive }) =>
              `side-nav-link ${isActive ? "is-active" : ""}`
            }
          >
            <Settings size={21} strokeWidth={1.8} />
            <span>설정</span>
          </NavLink>
        </div>
      </aside>

      {mobileMenuOpen ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setMobileMenuOpen(false)}
        />
      ) : null}

      <div className="workspace">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu-button"
              type="button"
              aria-label="메뉴 열기"
              onClick={() => setMobileMenuOpen(true)}
            >
              <Menu size={23} />
            </button>
            <span className="mobile-brand-mark" aria-hidden="true">
              L
            </span>
            <h1>{pageTitles[location.pathname] ?? "리브 관리자"}</h1>
          </div>
          <form className="global-search" onSubmit={submitSearch}>
            <Search size={19} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="사용자, 부대, ID 검색"
              aria-label="전체 검색"
            />
          </form>
          <div className="account-menu-wrap">
            <button
              className="account-trigger"
              type="button"
              aria-expanded={accountOpen}
              onClick={() => setAccountOpen((value) => !value)}
            >
              <span className="account-avatar" aria-hidden="true">
                {admin.name.slice(0, 1)}
              </span>
              <span className="account-copy">
                <strong>{admin.name}</strong>
                <small>
                  {admin.role === "owner" ? "시스템 owner" : "관리자"}
                </small>
              </span>
              <ChevronDown size={17} />
            </button>
            {accountOpen ? (
              <div className="account-popover">
                <div className="account-popover-head">
                  <strong>{admin.name}</strong>
                  <span>{admin.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAccountOpen(false);
                    navigate("/change-password");
                  }}
                >
                  <KeyRound size={17} /> 비밀번호 변경
                </button>
                <button type="button" onClick={() => void logout()}>
                  <LogOut size={17} /> 로그아웃
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <nav className="mobile-section-nav" aria-label="모바일 섹션 메뉴">
          <button
            className="mobile-section-menu"
            type="button"
            aria-label="메뉴 열기"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu size={22} />
          </button>
          {navigation.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) => (isActive ? "is-active" : "")}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function AdminOnly({
  admin,
  children,
}: {
  admin: AdminAccount;
  children: React.ReactNode;
}) {
  if (admin.role !== "owner") {
    return (
      <div className="empty-state">
        <ShieldCheck size={42} />
        <h2>owner 권한이 필요합니다</h2>
        <p>관리자 계정과 감사 설정은 owner만 변경할 수 있습니다.</p>
      </div>
    );
  }
  return children;
}
