/**
 * 관리자 운영 현황(대시보드).
 *
 * 오늘의 요청 수·오류율·활성 세션과 최근 접속 로그, 각 인프라(D1·R2·KV·푸시)
 * 상태를 한 화면에 모은다. 1분마다 자동으로 다시 받는다.
 */

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Database,
  HardDrive,
  Send,
  Server,
  UserPlus,
  Users,
  Zap,
} from "lucide-react";
import { useNavigate } from "react-router";
import { formatDateTime } from "../lib/format";
import { api } from "../api/client";
import {
  DataTable,
  ErrorState,
  LoadingScreen,
  StatusBadge,
  type Column,
} from "../components/ui";

type AccessRow = {
  id: string;
  userId: string | null;
  userName: string | null;
  userEmail: string | null;
  method: string;
  path: string;
  status: number;
  platform: string | null;
  durationMs: number | null;
  createdAt: string;
};

type Overview = {
  summary: {
    totalUsers: number;
    activeSessions: number;
    todayRequests: number;
    errorRate: number;
  };
  recentAccessLogs: AccessRow[];
  system: {
    apiWorker: "ok";
    d1: "ok";
    r2: "ok";
    kv: "ok";
    push: "ok";
    checkedAt: string;
  };
};

export function OverviewPage() {
  const navigate = useNavigate();
  const overview = useQuery({
    queryKey: ["overview"],
    queryFn: () => api.get<Overview>("/overview"),
    refetchInterval: 60_000,
  });

  if (overview.isPending) return <LoadingScreen />;
  if (overview.isError || !overview.data) {
    return (
      <ErrorState
        message={overview.error?.message ?? "운영 현황을 불러오지 못했습니다"}
        onRetry={() => void overview.refetch()}
      />
    );
  }

  const { summary, recentAccessLogs, system } = overview.data;
  const columns: Column<AccessRow>[] = [
    {
      key: "time",
      label: "시각",
      render: (row) => formatDateTime(row.createdAt),
    },
    {
      key: "user",
      label: "사용자",
      render: (row) => (
        <span className="person-cell">
          <strong>{row.userName ?? "비로그인"}</strong>
          <small>{row.userEmail ?? row.userId ?? "익명 요청"}</small>
        </span>
      ),
    },
    {
      key: "path",
      label: "경로",
      className: "mono-cell",
      render: (row) => row.path,
    },
    {
      key: "status",
      label: "상태",
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "platform",
      label: "플랫폼",
      render: (row) => row.platform ?? "—",
    },
    {
      key: "duration",
      label: "응답 시간",
      render: (row) =>
        row.durationMs == null ? (
          "—"
        ) : (
          <span className={row.durationMs >= 500 ? "text-negative" : ""}>
            {row.durationMs}ms
          </span>
        ),
    },
  ];

  return (
    <div className="overview-page">
      <section className="summary-strip" aria-label="운영 요약">
        <SummaryItem
          icon={<Users />}
          label="전체 사용자"
          value={summary.totalUsers.toLocaleString()}
        />
        <SummaryItem
          icon={<UserPlus />}
          label="활성 세션"
          value={summary.activeSessions.toLocaleString()}
        />
        <SummaryItem
          icon={<CalendarDays />}
          label="오늘 요청"
          value={summary.todayRequests.toLocaleString()}
        />
        <SummaryItem
          icon={<AlertTriangle />}
          label="오류 응답률"
          value={`${summary.errorRate.toFixed(2)}%`}
        />
      </section>

      <div className="overview-grid">
        <section className="overview-table-panel">
          <div className="panel-heading">
            <h2>최근 접속 로그</h2>
            <div className="panel-filters">
              <select aria-label="기간" defaultValue="today">
                <option value="today">오늘</option>
              </select>
              <select
                aria-label="플랫폼"
                defaultValue=""
                onChange={(event) => {
                  if (event.target.value) {
                    void navigate(
                      `/access-logs?platform=${encodeURIComponent(event.target.value)}`,
                    );
                  }
                }}
              >
                <option value="">전체 플랫폼</option>
                <option value="web">Web</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
              <button
                className="button compact secondary"
                type="button"
                onClick={() => void navigate("/access-logs")}
              >
                전체 로그 보기
              </button>
            </div>
          </div>
          <DataTable
            columns={columns}
            items={recentAccessLogs}
            onRowClick={() => void navigate("/access-logs")}
          />
        </section>

        <aside className="utility-rail">
          <section className="utility-panel">
            <h2>빠른 작업</h2>
            <button
              type="button"
              onClick={() => void navigate("/users?create=1")}
            >
              <UserPlus size={23} />
              사용자 추가
            </button>
            <button
              type="button"
              onClick={() => void navigate("/units?create=1")}
            >
              <Building2 size={23} />
              부대 추가
            </button>
            <button
              type="button"
              onClick={() => void navigate("/notifications?create=1")}
            >
              <Send size={23} />
              알림 발송
            </button>
          </section>

          <section className="utility-panel system-panel">
            <h2>시스템 상태</h2>
            <SystemRow
              icon={<Server />}
              label="API Worker"
              status={system.apiWorker}
            />
            <SystemRow
              icon={<Database />}
              label="D1 데이터베이스"
              status={system.d1}
            />
            <SystemRow
              icon={<HardDrive />}
              label="R2 이미지 저장소"
              status={system.r2}
            />
            <SystemRow icon={<Zap />} label="KV 캐시" status={system.kv} />
            <SystemRow
              icon={<Send />}
              label="푸시 서비스"
              status={system.push}
            />
            <div className="system-checked">
              <span>마지막 점검</span>
              <time dateTime={system.checkedAt}>
                {formatDateTime(system.checkedAt)}
              </time>
            </div>
          </section>
        </aside>
      </div>

      <button
        className="mobile-quick-action"
        type="button"
        onClick={() => void navigate("/notifications?create=1")}
      >
        <UserPlus size={24} />
        <span>빠른 작업</span>
      </button>
    </div>
  );
}

function SummaryItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="summary-item">
      <span className="summary-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function SystemRow({
  icon,
  label,
  status,
}: {
  icon: React.ReactNode;
  label: string;
  status: string;
}) {
  return (
    <div className="system-row">
      <span>
        {icon}
        {label}
      </span>
      <strong>
        <i aria-hidden="true" />
        {status === "ok" ? "정상" : status}
      </strong>
    </div>
  );
}
