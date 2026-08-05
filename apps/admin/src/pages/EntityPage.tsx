import {
  BALANCE_LABELS,
  fmtRangeTiny,
  REPORT_REASON_LABELS,
  segmentBalanceKey,
  type LeaveSegment,
} from "@leave/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ImagePlus,
  KeyRound,
  LoaderCircle,
  Pencil,
  ShieldOff,
  Trash2,
} from "lucide-react";
import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useSearchParams } from "react-router";
import { api, ApiError, downloadCsv, type ListResponse } from "../api/client";
import { RecordForm, type EditableResource } from "../components/RecordForm";
import {
  ConfirmDialog,
  DataTable,
  Drawer,
  ErrorState,
  LoadingScreen,
  PageHeader,
  Pagination,
  RecordDetails,
  StatusBadge,
  TableToolbar,
  type Column,
  useToast,
} from "../components/ui";

export type EntityResource =
  | EditableResource
  | "unit-invites"
  | "content-reports"
  | "access-logs"
  | "push-logs"
  | "sessions"
  | "admin-sessions"
  | "audit-logs";

type Entity = Record<string, unknown> & { id: string };

type ResourceConfig = {
  title: string;
  description: string;
  createLabel?: string;
  editable?: boolean;
  deletable?: boolean;
  exportPath?: string;
  columns: Column<Entity>[];
  emptyLabel?: string;
};

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

function formatTime(value: unknown): string {
  if (typeof value !== "string" || !value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateTime.format(date);
}

function text(value: unknown): string {
  return value === null || value === undefined || value === ""
    ? "—"
    : String(value);
}

const REPORT_STATUS_LABELS: Record<string, string> = {
  open: "미처리",
  reviewing: "확인 중",
  resolved: "처리 완료",
};

/** 초대코드는 폐기·만료·소진 중 어느 이유로 못 쓰는지가 운영에서 중요하다. */
function inviteStatusLabel(item: Entity): string {
  if (item.revokedAt) return "폐기";
  if (typeof item.expiresAt === "string" && item.expiresAt <= new Date().toISOString()) {
    return "만료";
  }
  const used = Number(item.usedCount ?? 0);
  const max = Number(item.maxUses ?? 0);
  if (max > 0 && used >= max) return "소진";
  return "유효";
}

function person(item: Entity): ReactNode {
  return (
    <span className="person-cell">
      <strong>{text(item.userName ?? item.name)}</strong>
      <small>{text(item.userEmail ?? item.email ?? item.userId)}</small>
    </span>
  );
}

const configs: Record<EntityResource, ResourceConfig> = {
  users: {
    title: "사용자",
    description: "전체 사용자 계정과 소속, 복무 정보, 동의 상태를 관리합니다.",
    createLabel: "사용자 추가",
    editable: true,
    deletable: true,
    columns: [
      { key: "name", label: "사용자", render: person },
      { key: "branch", label: "군 종류", render: (item) => text(item.branch) },
      { key: "unit", label: "부대", render: (item) => text(item.unitName) },
      {
        key: "service",
        label: "복무 기간",
        render: (item) =>
          `${text(item.enlistedAt)} – ${text(item.dischargeAt)}`,
      },
      {
        key: "consent",
        label: "수집 동의",
        render: (item) => (
          <StatusBadge value={item.consentedAt ? "동의" : "미동의"} />
        ),
      },
      {
        key: "created",
        label: "가입일",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
  units: {
    title: "부대",
    description: "모든 부대와 관리자, 인원 및 최대 출타 기준을 관리합니다.",
    createLabel: "부대 추가",
    editable: true,
    deletable: true,
    columns: [
      {
        key: "name",
        label: "부대",
        render: (item) => (
          <span className="person-cell">
            <strong>{text(item.name)}</strong>
            <small>{text(item.id)}</small>
          </span>
        ),
      },
      {
        key: "members",
        label: "가입 인원",
        render: (item) => text(item.memberCount),
      },
      {
        key: "admin",
        label: "관리자 ID",
        render: (item) => text(item.adminId),
      },
      {
        key: "maxLeaveCount",
        label: "하루 최대 출타",
        render: (item) => `${text(item.maxLeaveCount)}명`,
      },
      {
        key: "created",
        label: "생성일",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
  leaves: {
    title: "휴가",
    description:
      "전체 사용자의 휴가 일정을 조회하고 대신 생성·수정할 수 있습니다.",
    createLabel: "휴가 추가",
    editable: true,
    deletable: true,
    columns: [
      { key: "user", label: "사용자", render: person },
      {
        key: "title",
        label: "휴가",
        render: (item) => (
          <span className="person-cell">
            <strong>{text(item.title)}</strong>
            <small>{text(item.reason)}</small>
          </span>
        ),
      },
      { key: "unit", label: "부대", render: (item) => text(item.unitName) },
      {
        key: "period",
        label: "기간",
        render: (item) => `${text(item.startDate)} – ${text(item.endDate)}`,
      },
      {
        key: "segments",
        label: "구간",
        render: (item) => {
          const segments = Array.isArray(item.segments)
            ? (item.segments as LeaveSegment[])
            : [];
          if (!segments.length) return "—";
          return (
            <span className="person-cell">
              {segments.map((segment) => (
                <small key={`${segment.category}-${segment.startDate}`}>
                  {BALANCE_LABELS[segmentBalanceKey(segment)]}{" "}
                  {fmtRangeTiny(segment.startDate, segment.endDate)}
                </small>
              ))}
            </span>
          );
        },
      },
      {
        key: "created",
        label: "등록일",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
  "unit-invites": {
    title: "초대코드",
    description:
      "발급된 그룹 초대코드의 유효 상태를 확인하고 폐기합니다. 코드 원문은 저장하지 않아 조회할 수 없습니다.",
    deletable: true,
    columns: [
      { key: "unit", label: "그룹", render: (item) => text(item.unitName) },
      { key: "unitId", label: "그룹 ID", render: (item) => text(item.unitId) },
      {
        key: "uses",
        label: "사용",
        render: (item) => `${item.usedCount ?? 0} / ${item.maxUses ?? 0}`,
      },
      {
        key: "expires",
        label: "만료",
        render: (item) => formatTime(item.expiresAt),
      },
      {
        key: "status",
        label: "상태",
        render: (item) => (
          <StatusBadge value={inviteStatusLabel(item)} />
        ),
      },
      {
        key: "created",
        label: "발급일",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
  "content-reports": {
    title: "신고",
    description:
      "그룹 이름·설명과 참여자 별칭 신고를 처리합니다. 미처리 건이 위로 옵니다. 접수 후 24시간 안에 조치해야 합니다.",
    columns: [
      {
        key: "status",
        label: "상태",
        render: (item) => (
          <StatusBadge value={REPORT_STATUS_LABELS[String(item.status)] ?? "—"} />
        ),
      },
      {
        key: "target",
        label: "대상",
        render: (item) => (
          <span className="person-cell">
            <strong>{item.targetType === "unit" ? "그룹" : "참여자"}</strong>
            <small>{text(item.targetId)}</small>
          </span>
        ),
      },
      {
        key: "reason",
        label: "사유",
        render: (item) =>
          REPORT_REASON_LABELS[
            String(item.reason) as keyof typeof REPORT_REASON_LABELS
          ] ?? text(item.reason),
      },
      { key: "detail", label: "내용", render: (item) => text(item.detail) },
      {
        key: "created",
        label: "접수",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
  notifications: {
    title: "알림",
    description: "인앱 알림을 관리하고 확인 후 Expo 푸시를 발송합니다.",
    createLabel: "알림 발송",
    editable: true,
    deletable: true,
    columns: [
      { key: "user", label: "사용자", render: person },
      {
        key: "title",
        label: "알림",
        render: (item) => (
          <span className="person-cell">
            <strong>{text(item.title)}</strong>
            <small>{text(item.body)}</small>
          </span>
        ),
      },
      {
        key: "read",
        label: "열람",
        render: (item) => <StatusBadge value={item.read ? "읽음" : "미열람"} />,
      },
      {
        key: "created",
        label: "생성일",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
  "access-logs": {
    title: "접속 로그",
    description:
      "접속 시각·경로·상태·앱 플랫폼/버전만 남깁니다. IP·국가·User-Agent는 저장하지 않습니다.",
    exportPath: "/access-logs/export",
    columns: [
      {
        key: "time",
        label: "시각",
        render: (item) => formatTime(item.createdAt),
      },
      { key: "user", label: "사용자", render: person },
      {
        key: "path",
        label: "경로",
        className: "mono-cell",
        render: (item) => text(item.path),
      },
      {
        key: "status",
        label: "상태",
        render: (item) => <StatusBadge value={item.status as string} />,
      },
      {
        key: "platform",
        label: "플랫폼",
        render: (item) => text(item.platform),
      },
      {
        key: "appVersion",
        label: "앱 버전",
        render: (item) => text(item.appVersion),
      },
      {
        key: "duration",
        label: "응답 시간",
        render: (item) => (
          <span
            className={Number(item.durationMs) >= 500 ? "text-negative" : ""}
          >
            {item.durationMs == null ? "—" : `${item.durationMs}ms`}
          </span>
        ),
      },
    ],
  },
  "push-logs": {
    title: "푸시 로그",
    description:
      "푸시 발송·수신·열람 이벤트와 결과만 남깁니다. 메시지 원문과 데이터는 저장하지 않습니다.",
    exportPath: "/push-logs/export",
    columns: [
      {
        key: "time",
        label: "시각",
        render: (item) => formatTime(item.createdAt),
      },
      { key: "user", label: "사용자", render: person },
      {
        key: "direction",
        label: "방향",
        render: (item) => <StatusBadge value={item.direction as string} />,
      },
      {
        key: "notificationId",
        label: "알림 ID",
        className: "mono-cell",
        render: (item) => text(item.notificationId),
      },
      {
        key: "status",
        label: "결과",
        render: (item) => <StatusBadge value={item.status as string} />,
      },
    ],
  },
  sessions: {
    title: "사용자 세션",
    description: "활성 사용자 세션을 조회하고 즉시 강제 만료할 수 있습니다.",
    columns: [
      { key: "user", label: "사용자", render: person },
      {
        key: "id",
        label: "세션 ID",
        className: "mono-cell",
        render: (item) => text(item.id),
      },
      {
        key: "created",
        label: "생성일",
        render: (item) => formatTime(item.createdAt),
      },
      {
        key: "expires",
        label: "만료일",
        render: (item) => formatTime(item.expiresAt),
      },
      {
        key: "state",
        label: "상태",
        render: (item) => (
          <StatusBadge
            value={
              new Date(String(item.expiresAt)) > new Date() ? "활성" : "만료"
            }
          />
        ),
      },
    ],
  },
  "admin-sessions": {
    title: "관리자 세션",
    description: "관리자 로그인 세션과 접속 환경을 확인하고 강제 만료합니다.",
    columns: [
      {
        key: "admin",
        label: "관리자",
        render: (item) => (
          <span className="person-cell">
            <strong>{text(item.adminName)}</strong>
            <small>{text(item.adminEmail)}</small>
          </span>
        ),
      },
      { key: "ip", label: "IP", render: (item) => text(item.ip) },
      {
        key: "userAgent",
        label: "사용 환경",
        render: (item) => text(item.userAgent),
      },
      {
        key: "lastSeen",
        label: "최근 활동",
        render: (item) => formatTime(item.lastSeenAt),
      },
      {
        key: "expires",
        label: "만료일",
        render: (item) => formatTime(item.expiresAt),
      },
    ],
  },
  "audit-logs": {
    title: "관리자 감사 로그",
    description:
      "관리자가 수행한 모든 데이터 변경 이력을 읽기 전용으로 확인합니다.",
    exportPath: "/audit-logs/export",
    columns: [
      {
        key: "time",
        label: "시각",
        render: (item) => formatTime(item.createdAt),
      },
      {
        key: "admin",
        label: "관리자",
        render: (item) => text(item.adminEmail),
      },
      {
        key: "action",
        label: "작업",
        render: (item) => <StatusBadge value={item.action as string} />,
      },
      { key: "entity", label: "대상", render: (item) => text(item.entityType) },
      {
        key: "entityId",
        label: "대상 ID",
        className: "mono-cell",
        render: (item) => text(item.entityId),
      },
      { key: "ip", label: "IP", render: (item) => text(item.ip) },
    ],
  },
  admins: {
    title: "관리자 계정",
    description: "관리자 계정과 역할, 활성 상태를 owner 권한으로 관리합니다.",
    createLabel: "관리자 추가",
    editable: true,
    columns: [
      {
        key: "admin",
        label: "관리자",
        render: (item) => (
          <span className="person-cell">
            <strong>{text(item.name)}</strong>
            <small>{text(item.email)}</small>
          </span>
        ),
      },
      {
        key: "role",
        label: "역할",
        render: (item) => <StatusBadge value={item.role as string} />,
      },
      {
        key: "active",
        label: "상태",
        render: (item) => <StatusBadge value={Boolean(item.active)} />,
      },
      {
        key: "password",
        label: "비밀번호",
        render: (item) => (
          <StatusBadge value={item.mustChangePassword ? "변경 필요" : "정상"} />
        ),
      },
      {
        key: "created",
        label: "생성일",
        render: (item) => formatTime(item.createdAt),
      },
    ],
  },
};

export function EntityPage({ resource }: { resource: EntityResource }) {
  const config = configs[resource];
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Entity | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");
  const [platform, setPlatform] = useState(searchParams.get("platform") ?? "");
  const [status, setStatus] = useState("");

  useEffect(() => setPage(1), [deferredQuery, platform, status]);
  useEffect(() => {
    if (searchParams.get("create") === "1" && config.createLabel) {
      setEditorMode("create");
      const next = new URLSearchParams(searchParams);
      next.delete("create");
      setSearchParams(next, { replace: true });
    }
  }, [config.createLabel, searchParams, setSearchParams]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: resource === "access-logs" ? "50" : "25",
    });
    if (deferredQuery.trim()) params.set("q", deferredQuery.trim());
    if (platform) params.set("platform", platform);
    if (status) params.set("status", status);
    return params.toString();
  }, [deferredQuery, page, platform, resource, status]);

  const list = useQuery({
    queryKey: ["entities", resource, queryString],
    queryFn: async () => {
      if (resource === "admins" || resource === "admin-sessions") {
        const result = await api.get<{ items: Entity[] }>(`/${resource}`);
        return {
          items: result.items,
          meta: {
            page: 1,
            pageSize: result.items.length || 1,
            total: result.items.length,
            totalPages: 1,
          },
        } satisfies ListResponse<Entity>;
      }
      return api.get<ListResponse<Entity>>(`/${resource}?${queryString}`);
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["entities", resource] });

  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      if (editorMode === "create") {
        return api.post<{ item: Entity; temporaryPassword?: string }>(
          `/${resource}`,
          body,
        );
      }
      if (!selected) throw new Error("선택된 레코드가 없습니다");
      return api.patch<{ item: Entity }>(`/${resource}/${selected.id}`, body);
    },
    onSuccess: (result) => {
      setFormError("");
      setEditorMode(null);
      setSelected(result.item);
      if ("temporaryPassword" in result && result.temporaryPassword) {
        setTemporaryPassword(String(result.temporaryPassword));
      }
      void invalidate();
      toast.success(
        editorMode === "create"
          ? "데이터를 생성했습니다"
          : "변경사항을 저장했습니다",
      );
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError ? error.message : "저장하지 못했습니다",
      );
    },
  });

  const remove = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("선택된 레코드가 없습니다");
      return api.delete(`/${resource}/${selected.id}`);
    },
    onSuccess: () => {
      setDeleteOpen(false);
      setSelected(null);
      void invalidate();
      toast.success("데이터를 삭제했습니다");
    },
    onError: (error) => {
      toast.error(
        error instanceof ApiError ? error.message : "삭제하지 못했습니다",
      );
    },
  });

  const action = useMutation({
    mutationFn: async (
      name: "revoke" | "reset-password" | "reviewing" | "resolved",
    ) => {
      if (resource === "content-reports") {
        if (!selected) throw new Error("선택된 레코드가 없습니다");
        return api.patch(`/content-reports/${selected.id}`, { status: name });
      }
      if (!selected) throw new Error("선택된 레코드가 없습니다");
      if (resource === "unit-invites" && name === "revoke") {
        return api.post(`/${resource}/${selected.id}/revoke`);
      }
      if (resource === "sessions" && name === "revoke") {
        return api.delete(`/${resource}/${selected.id}`);
      }
      if (resource === "admin-sessions" && name === "revoke") {
        return api.delete(`/${resource}/${selected.id}`);
      }
      if (resource === "admins" && name === "reset-password") {
        return api.post<{ temporaryPassword: string }>(
          `/admins/${selected.id}/reset-password`,
        );
      }
      throw new Error("지원하지 않는 작업입니다");
    },
    onSuccess: (result, name) => {
      if (
        name === "reset-password" &&
        result &&
        typeof result === "object" &&
        "temporaryPassword" in result
      ) {
        setTemporaryPassword(String(result.temporaryPassword));
      } else {
        setSelected(null);
      }
      void invalidate();
      if (name === "reviewing" || name === "resolved") {
        toast.success(
          name === "reviewing" ? "확인 중으로 바꿨습니다" : "처리 완료했습니다",
        );
        return;
      }
      toast.success(
        name === "revoke"
          ? resource === "unit-invites"
            ? "초대코드를 폐기했습니다"
            : "세션을 만료시켰습니다"
          : "임시 비밀번호를 발급했습니다",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "작업에 실패했습니다",
      ),
  });

  const openCreate = () => {
    setSelected(null);
    setFormError("");
    setEditorMode("create");
  };

  if (list.isPending) return <LoadingScreen />;
  if (list.isError || !list.data) {
    return (
      <ErrorState
        message={list.error?.message ?? "목록을 불러오지 못했습니다"}
        onRetry={() => void list.refetch()}
      />
    );
  }

  const itemLabel = selected
    ? text(selected.name ?? selected.title ?? selected.email ?? selected.id)
    : "";

  return (
    <div className="entity-page">
      <PageHeader
        title={config.title}
        description={config.description}
        actionLabel={config.createLabel}
        onAction={config.createLabel ? openCreate : undefined}
      />
      <section className="data-panel">
        <TableToolbar
          query={query}
          onQueryChange={setQuery}
          onExport={
            config.exportPath
              ? () => {
                  void downloadCsv(config.exportPath!).catch((error) =>
                    toast.error(
                      error instanceof Error ? error.message : "내보내기 실패",
                    ),
                  );
                }
              : undefined
          }
        >
          {resource === "access-logs" ? (
            <>
              <select
                aria-label="플랫폼 필터"
                value={platform}
                onChange={(event) => setPlatform(event.target.value)}
              >
                <option value="">전체 플랫폼</option>
                <option value="web">Web</option>
                <option value="ios">iOS</option>
                <option value="android">Android</option>
              </select>
              <select
                aria-label="상태 코드 필터"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">전체 상태</option>
                <option value="200">200</option>
                <option value="400">400</option>
                <option value="401">401</option>
                <option value="403">403</option>
                <option value="404">404</option>
                <option value="500">500</option>
              </select>
            </>
          ) : null}
        </TableToolbar>
        <DataTable
          columns={config.columns}
          items={list.data.items}
          emptyLabel={config.emptyLabel}
          onRowClick={setSelected}
        />
        <Pagination meta={list.data.meta} onPageChange={setPage} />
      </section>

      <Drawer
        title={
          editorMode
            ? editorMode === "create"
              ? `${config.title} 생성`
              : `${config.title} 편집`
            : `${config.title} 상세`
        }
        open={Boolean(selected || editorMode)}
        onClose={() => {
          setSelected(null);
          setEditorMode(null);
          setFormError("");
        }}
        footer={
          !editorMode && selected ? (
            <div className="drawer-action-row">
              {config.editable ? (
                <button
                  className="button secondary"
                  type="button"
                  onClick={() => setEditorMode("edit")}
                >
                  <Pencil size={17} /> 편집
                </button>
              ) : null}
              {resource === "content-reports" ? (
                <>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={action.isPending || selected.status === "reviewing"}
                    onClick={() => action.mutate("reviewing")}
                  >
                    확인 중
                  </button>
                  <button
                    className="button primary"
                    type="button"
                    disabled={action.isPending || selected.status === "resolved"}
                    onClick={() => action.mutate("resolved")}
                  >
                    처리 완료
                  </button>
                </>
              ) : null}
              {resource === "unit-invites" && !selected.revokedAt ? (
                <button
                  className="button danger"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("revoke")}
                >
                  <ShieldOff size={17} /> 초대코드 폐기
                </button>
              ) : null}
              {resource === "sessions" || resource === "admin-sessions" ? (
                <button
                  className="button danger"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("revoke")}
                >
                  <ShieldOff size={17} /> 세션 강제 만료
                </button>
              ) : null}
              {resource === "admins" ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("reset-password")}
                >
                  <KeyRound size={17} /> 임시 비밀번호 발급
                </button>
              ) : null}
              {config.deletable ? (
                <button
                  className="button danger"
                  type="button"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2 size={17} /> 삭제
                </button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {editorMode &&
        resource in configs &&
        [
          "users",
          "units",
          "leaves",
          "notifications",
          "admins",
        ].includes(resource) ? (
          <RecordForm
            resource={resource as EditableResource}
            mode={editorMode}
            initial={selected ?? undefined}
            pending={save.isPending}
            error={formError}
            onCancel={() => setEditorMode(null)}
            onSubmit={(body) => save.mutate(body)}
          />
        ) : selected ? (
          <>
            <RecordDetails item={selected} />
            {resource === "users" || resource === "units" ? (
              <ImageManager
                resource={resource}
                id={selected.id}
                onChanged={() => void invalidate()}
              />
            ) : null}
          </>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={deleteOpen}
        title={`${config.title} 삭제`}
        description="삭제하면 관련 운영 데이터에 영향을 줄 수 있으며 되돌릴 수 없습니다."
        confirmLabel="영구 삭제"
        confirmationText={itemLabel}
        pending={remove.isPending}
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => remove.mutate()}
      />

      <Drawer
        title="임시 비밀번호"
        open={Boolean(temporaryPassword)}
        onClose={() => setTemporaryPassword("")}
      >
        <div className="secret-panel">
          <KeyRound size={28} />
          <h3>한 번만 표시되는 임시 비밀번호입니다</h3>
          <code>{temporaryPassword}</code>
          <p>
            안전하게 전달한 뒤 이 창을 닫으세요. 첫 로그인에서 변경이
            강제됩니다.
          </p>
        </div>
      </Drawer>
    </div>
  );
}

function ImageManager({
  resource,
  id,
  onChanged,
}: {
  resource: "users" | "units";
  id: string;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const upload = async (file: File) => {
    setPending(true);
    const form = new FormData();
    form.set("image", file);
    try {
      await api.putForm(`/${resource}/${id}/image`, form);
      toast.success("이미지를 변경했습니다");
      onChanged();
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "이미지를 변경하지 못했습니다",
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="image-manager">
      <h3>대표 이미지</h3>
      <p>JPEG, PNG, WebP, GIF, AVIF · 최대 5MB</p>
      <div>
        <label className="button secondary">
          {pending ? (
            <LoaderCircle className="spin" size={17} />
          ) : (
            <ImagePlus size={17} />
          )}
          이미지 교체
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            hidden
            disabled={pending}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
        </label>
        <button
          className="button danger"
          type="button"
          disabled={pending}
          onClick={() => {
            setPending(true);
            void api
              .delete(`/${resource}/${id}/image`)
              .then(() => {
                toast.success("이미지를 삭제했습니다");
                onChanged();
              })
              .catch((error) =>
                toast.error(
                  error instanceof ApiError
                    ? error.message
                    : "삭제하지 못했습니다",
                ),
              )
              .finally(() => setPending(false));
          }}
        >
          <Trash2 size={17} /> 이미지 삭제
        </button>
      </div>
    </div>
  );
}
