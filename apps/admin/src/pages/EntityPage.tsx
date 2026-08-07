/**
 * 관리자 목록/상세 화면 하나로 모든 리소스를 다룬다.
 *
 * 사용처: apps/admin/src/App.tsx 의 라우트 전부(`<EntityPage resource="users" />` 등).
 *
 * 무엇이 리소스마다 다른지는 두 곳에만 있다.
 *  - 표시 형식(제목·열·생성 가능 여부) → ./entity-configs.tsx
 *  - 행 단위 특수 작업(폐기·강제 만료·임시 비밀번호) → 아래 ROW_ACTIONS
 * 그 밖의 흐름(검색·페이지·상세 서랍·삭제 확인·토스트)은 리소스와 무관하게 같다.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Pencil, ShieldOff, Trash2 } from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { api, ApiError, downloadCsv, type ListResponse } from "../api/client";
import { ImageManager } from "../components/ImageManager";
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
  TableToolbar,
  useToast,
} from "../components/ui";
import { text } from "../lib/format";
import {
  entityConfigs,
  type Entity,
  type EntityResource,
} from "./entity-configs";

export type { EntityResource } from "./entity-configs";

/** 목록에 한 번에 담는 행 수. 접속 로그만 훑어보는 용도라 더 크게 잡는다. */
const PAGE_SIZE = 25;
const ACCESS_LOG_PAGE_SIZE = 50;

/**
 * 페이지 나누기를 서버가 하지 않는 리소스.
 * 운영상 개수가 적어 전체를 한 번에 내려주고, 화면에서 한 페이지처럼 다룬다.
 */
const UNPAGED_RESOURCES: readonly EntityResource[] = [
  "admins",
  "admin-sessions",
];

/** 상세 서랍에서 누를 수 있는 행 단위 작업. */
type RowAction = "revoke" | "reset-password" | "reviewing" | "resolved";

type RowActionSpec = {
  run: (id: string) => Promise<unknown>;
  success: string;
};

/**
 * 리소스별 행 작업 정의.
 *
 * 같은 "revoke"라도 초대코드는 폐기 엔드포인트를, 세션은 DELETE를 쓴다.
 * 그 차이를 if 문 사슬로 두면 리소스가 늘 때마다 사슬이 길어지므로 표로 만든다.
 */
const ROW_ACTIONS: Partial<
  Record<EntityResource, Partial<Record<RowAction, RowActionSpec>>>
> = {
  "content-reports": {
    reviewing: {
      run: (id) => api.patch(`/content-reports/${id}`, { status: "reviewing" }),
      success: "확인 중으로 바꿨습니다",
    },
    resolved: {
      run: (id) => api.patch(`/content-reports/${id}`, { status: "resolved" }),
      success: "처리 완료했습니다",
    },
  },
  "unit-invites": {
    revoke: {
      run: (id) => api.post(`/unit-invites/${id}/revoke`),
      success: "초대코드를 폐기했습니다",
    },
  },
  sessions: {
    revoke: {
      run: (id) => api.delete(`/sessions/${id}`),
      success: "세션을 만료시켰습니다",
    },
  },
  "admin-sessions": {
    revoke: {
      run: (id) => api.delete(`/admin-sessions/${id}`),
      success: "세션을 만료시켰습니다",
    },
  },
  admins: {
    "reset-password": {
      run: (id) =>
        api.post<{ temporaryPassword: string }>(`/admins/${id}/reset-password`),
      success: "임시 비밀번호를 발급했습니다",
    },
  },
};

export function EntityPage({ resource }: { resource: EntityResource }) {
  const config = entityConfigs[resource];
  const toast = useToast();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // 검색어는 입력마다 요청하지 않고 한 박자 늦춰 보낸다(useDeferredValue).
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [platform, setPlatform] = useState(searchParams.get("platform") ?? "");
  const [status, setStatus] = useState("");

  const [selected, setSelected] = useState<Entity | null>(null);
  const [editorMode, setEditorMode] = useState<"create" | "edit" | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [temporaryPassword, setTemporaryPassword] = useState("");

  // 조건이 바뀌면 보고 있던 페이지 번호는 의미가 없다.
  useEffect(() => setPage(1), [deferredQuery, platform, status]);

  // 다른 화면에서 `?create=1`로 넘어오면 생성 서랍을 바로 연다.
  useEffect(() => {
    if (searchParams.get("create") !== "1" || !config.createLabel) return;
    setEditorMode("create");
    const next = new URLSearchParams(searchParams);
    next.delete("create");
    setSearchParams(next, { replace: true });
  }, [config.createLabel, searchParams, setSearchParams]);

  const queryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(
        resource === "access-logs" ? ACCESS_LOG_PAGE_SIZE : PAGE_SIZE,
      ),
    });
    if (deferredQuery.trim()) params.set("q", deferredQuery.trim());
    if (platform) params.set("platform", platform);
    if (status) params.set("status", status);
    return params.toString();
  }, [deferredQuery, page, platform, resource, status]);

  const list = useQuery({
    queryKey: ["entities", resource, queryString],
    queryFn: async () => {
      if (UNPAGED_RESOURCES.includes(resource)) {
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
    void queryClient.invalidateQueries({ queryKey: ["entities", resource] });

  const closeDrawer = () => {
    setSelected(null);
    setEditorMode(null);
    setFormError("");
  };

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
      const created = editorMode === "create";
      setFormError("");
      setEditorMode(null);
      setSelected(result.item);
      // 관리자 계정을 새로 만들면 임시 비밀번호가 이 응답에만 실려 온다.
      if ("temporaryPassword" in result && result.temporaryPassword) {
        setTemporaryPassword(String(result.temporaryPassword));
      }
      invalidate();
      toast.success(
        created ? "데이터를 생성했습니다" : "변경사항을 저장했습니다",
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
      invalidate();
      toast.success("데이터를 삭제했습니다");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "삭제하지 못했습니다",
      ),
  });

  const action = useMutation({
    mutationFn: async (name: RowAction) => {
      if (!selected) throw new Error("선택된 레코드가 없습니다");
      const spec = ROW_ACTIONS[resource]?.[name];
      if (!spec) throw new Error("지원하지 않는 작업입니다");
      return { name, result: await spec.run(selected.id) };
    },
    onSuccess: ({ name, result }) => {
      // 임시 비밀번호는 이 응답에서만 볼 수 있으므로 서랍을 닫지 않고 보여준다.
      if (
        result &&
        typeof result === "object" &&
        "temporaryPassword" in result
      ) {
        setTemporaryPassword(String(result.temporaryPassword));
      } else {
        setSelected(null);
      }
      invalidate();
      toast.success(ROW_ACTIONS[resource]?.[name]?.success ?? "완료했습니다");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "작업에 실패했습니다",
      ),
  });

  if (list.isPending) return <LoadingScreen />;
  if (list.isError || !list.data) {
    return (
      <ErrorState
        message={list.error?.message ?? "목록을 불러오지 못했습니다"}
        onRetry={() => void list.refetch()}
      />
    );
  }

  // 삭제 확인은 대상 이름을 그대로 입력하게 해 오조작을 막는다.
  const itemLabel = selected
    ? text(selected.name ?? selected.title ?? selected.email ?? selected.id)
    : "";
  const rowActions = ROW_ACTIONS[resource] ?? {};

  return (
    <div className="entity-page">
      <PageHeader
        title={config.title}
        description={config.description}
        actionLabel={config.createLabel}
        onAction={
          config.createLabel
            ? () => {
                setSelected(null);
                setFormError("");
                setEditorMode("create");
              }
            : undefined
        }
      />

      <section className="data-panel">
        <TableFilters
          resource={resource}
          query={query}
          onQueryChange={setQuery}
          platform={platform}
          onPlatformChange={setPlatform}
          status={status}
          onStatusChange={setStatus}
          exportPath={config.exportPath}
          onExportError={(message) => toast.error(message)}
        />
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
            ? `${config.title} ${editorMode === "create" ? "생성" : "편집"}`
            : `${config.title} 상세`
        }
        open={Boolean(selected || editorMode)}
        onClose={closeDrawer}
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
              {rowActions.reviewing ? (
                <button
                  className="button secondary"
                  type="button"
                  disabled={action.isPending || selected.status === "reviewing"}
                  onClick={() => action.mutate("reviewing")}
                >
                  확인 중
                </button>
              ) : null}
              {rowActions.resolved ? (
                <button
                  className="button primary"
                  type="button"
                  disabled={action.isPending || selected.status === "resolved"}
                  onClick={() => action.mutate("resolved")}
                >
                  처리 완료
                </button>
              ) : null}
              {/* 이미 폐기된 초대코드에는 폐기 버튼을 노출하지 않는다. */}
              {rowActions.revoke && !selected.revokedAt ? (
                <button
                  className="button danger"
                  type="button"
                  disabled={action.isPending}
                  onClick={() => action.mutate("revoke")}
                >
                  <ShieldOff size={17} />{" "}
                  {resource === "unit-invites"
                    ? "초대코드 폐기"
                    : "세션 강제 만료"}
                </button>
              ) : null}
              {rowActions["reset-password"] ? (
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
        {editorMode && config.editable ? (
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
                onChanged={invalidate}
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

/** 접속 로그에서만 쓰는 플랫폼 필터 선택지. */
const PLATFORM_OPTIONS = [
  { value: "web", label: "Web" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
];

/** 운영 중 실제로 들여다보게 되는 HTTP 상태 코드만 추린다. */
const STATUS_OPTIONS = ["200", "400", "401", "403", "404", "500"];

/**
 * 검색창 + CSV 내보내기 + (접속 로그일 때만) 플랫폼·상태 필터.
 * 필터가 붙는 리소스가 하나뿐이라 별도 파일로 두지 않고 이 화면에 함께 둔다.
 */
function TableFilters(props: {
  resource: EntityResource;
  query: string;
  onQueryChange: (value: string) => void;
  platform: string;
  onPlatformChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  exportPath?: string;
  onExportError: (message: string) => void;
}) {
  const { exportPath } = props;
  return (
    <TableToolbar
      query={props.query}
      onQueryChange={props.onQueryChange}
      onExport={
        exportPath
          ? () => {
              void downloadCsv(exportPath).catch((error) =>
                props.onExportError(
                  error instanceof Error ? error.message : "내보내기 실패",
                ),
              );
            }
          : undefined
      }
    >
      {props.resource === "access-logs" ? (
        <>
          <select
            aria-label="플랫폼 필터"
            value={props.platform}
            onChange={(event) => props.onPlatformChange(event.target.value)}
          >
            <option value="">전체 플랫폼</option>
            {PLATFORM_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <select
            aria-label="상태 코드 필터"
            value={props.status}
            onChange={(event) => props.onStatusChange(event.target.value)}
          >
            <option value="">전체 상태</option>
            {STATUS_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </>
      ) : null}
    </TableToolbar>
  );
}
