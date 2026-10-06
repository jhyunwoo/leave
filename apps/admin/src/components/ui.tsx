/** 관리자 화면의 공통 상태와 대화상자 동작을 한 곳에서 유지한다. */

import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  X,
  ShieldAlert,
} from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { ListMeta } from "../api/client";
import { detailText } from "../lib/format";
import { createPortal } from "react-dom";
import { useModalFocus } from "./use-modal-focus";

export function LoadingScreen({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="loading-screen" role="status">
      <LoaderCircle className="spin" size={28} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="empty-state is-error" role="alert">
      <CircleAlert size={38} />
      <h2>데이터를 불러오지 못했습니다</h2>
      <p>{message}</p>
      {onRetry ? (
        <button className="button secondary" type="button" onClick={onRetry}>
          <RefreshCw size={17} /> 다시 시도
        </button>
      ) : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="page-header">
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actionLabel && onAction ? (
        <button className="button primary" type="button" onClick={onAction}>
          <Plus size={18} />
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function TableToolbar({
  query,
  onQueryChange,
  onExport,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  onExport?: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="table-toolbar">
      <label className="table-search">
        <Search size={18} aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="검색"
          aria-label="목록 검색"
        />
      </label>
      <div className="toolbar-controls">
        {children}
        {onExport ? (
          <button
            className="button compact secondary"
            type="button"
            onClick={onExport}
          >
            <Download size={17} /> CSV
          </button>
        ) : null}
      </div>
    </div>
  );
}

export type Column<T> = {
  key: string;
  label: string;
  className?: string;
  render: (item: T) => ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns,
  items,
  onRowClick,
  emptyLabel = "표시할 데이터가 없습니다.",
}: {
  columns: Column<T>[];
  items: T[];
  onRowClick?: (item: T) => void;
  emptyLabel?: string;
}) {
  if (!items.length) {
    return (
      <div className="table-empty">
        <p>{emptyLabel}</p>
      </div>
    );
  }
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} className={column.className}>
                {column.label}
              </th>
            ))}
            {onRowClick ? <th aria-label="상세" /> : null}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(item) : undefined}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick(item);
                      }
                    }
                  : undefined
              }
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.className}
                  data-label={column.label}
                >
                  {column.render(item)}
                </td>
              ))}
              {onRowClick ? (
                <td className="row-chevron" aria-hidden="true">
                  <ChevronRight size={18} />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({
  meta,
  onPageChange,
}: {
  meta: ListMeta;
  onPageChange: (page: number) => void;
}) {
  const start = meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1;
  const end = Math.min(meta.page * meta.pageSize, meta.total);
  return (
    <div className="pagination">
      <span>
        전체 {meta.total.toLocaleString()}건 · {start.toLocaleString()}–
        {end.toLocaleString()}
      </span>
      <div>
        <button
          className="icon-button bordered"
          type="button"
          aria-label="이전 페이지"
          disabled={meta.page <= 1}
          onClick={() => onPageChange(meta.page - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <span className="page-number">
          {meta.page} / {meta.totalPages}
        </span>
        <button
          className="icon-button bordered"
          type="button"
          aria-label="다음 페이지"
          disabled={meta.page >= meta.totalPages}
          onClick={() => onPageChange(meta.page + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}

export function StatusBadge({
  value,
}: {
  value: string | number | boolean | null | undefined;
}) {
  const text =
    typeof value === "boolean"
      ? value
        ? "활성"
        : "비활성"
      : value == null
        ? "없음"
        : String(value);
  const numeric = Number(text);
  const tone =
    text === "ok" ||
    text === "활성" ||
    text === "owner" ||
    text === "200" ||
    text === "201" ||
    text === "204"
      ? "positive"
      : text === "비활성" ||
          text === "error" ||
          text === "500" ||
          numeric >= 500
        ? "negative"
        : text === "401" ||
            text === "403" ||
            text === "skipped" ||
            (numeric >= 400 && numeric < 500)
          ? "warning"
          : "neutral";
  return <span className={`status-badge ${tone}`}>{text}</span>;
}

type DrawerProps = {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
};

export function Drawer({ open, ...props }: DrawerProps) {
  return open ? <DrawerBody {...props} /> : null;
}

function DrawerBody({
  title,
  onClose,
  children,
  footer,
}: Omit<DrawerProps, "open">) {
  const { overlayRef, dialogRef } = useModalFocus(onClose);
  return createPortal(
    <div
      ref={overlayRef}
      className="overlay"
      role="presentation"
      onMouseDown={onClose}
    >
      <section
        ref={dialogRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button
            className="icon-button"
            type="button"
            aria-label="닫기"
            onClick={onClose}
          >
            <X size={21} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-footer">{footer}</footer> : null}
      </section>
    </div>,
    document.body,
  );
}

export function RecordDetails({ item }: { item: Record<string, unknown> }) {
  return (
    <dl className="record-details">
      {Object.entries(item).map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{detailText(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  confirmationText,
  destructive = true,
  pending = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmationText?: string;
  destructive?: boolean;
  pending?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // 새로 열 때 이전 확인 입력이 남지 않도록 닫힌 본문을 언마운트한다.
  if (!open) return null;
  return (
    <ConfirmDialogBody
      title={title}
      description={description}
      confirmLabel={confirmLabel}
      confirmationText={confirmationText}
      destructive={destructive}
      pending={pending}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

function ConfirmDialogBody({
  title,
  description,
  confirmLabel,
  confirmationText,
  destructive,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmationText?: string;
  destructive: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = useState("");
  const { overlayRef, dialogRef } = useModalFocus(onCancel);
  const disabled =
    pending || (confirmationText !== undefined && typed !== confirmationText);
  return createPortal(
    <div
      ref={overlayRef}
      className="overlay centered"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        ref={dialogRef}
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className={`confirm-icon ${destructive ? "danger" : "warning"}`}>
          <AlertTriangle size={25} />
        </span>
        <h2>{title}</h2>
        <p>{description}</p>
        {confirmationText !== undefined ? (
          <label className="field">
            <span>
              계속하려면 <strong>{confirmationText}</strong> 입력
            </span>
            <input
              autoFocus
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
            />
          </label>
        ) : null}
        <div className="confirm-actions">
          <button className="button secondary" type="button" onClick={onCancel}>
            취소
          </button>
          <button
            className={`button ${destructive ? "danger" : "primary"}`}
            type="button"
            disabled={disabled}
            onClick={onConfirm}
          >
            {pending ? (
              <LoaderCircle className="spin" size={17} aria-hidden="true" />
            ) : destructive ? (
              <ShieldAlert size={17} aria-hidden="true" />
            ) : (
              <Check size={17} aria-hidden="true" />
            )}
            {confirmLabel}
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}

type Toast = {
  id: number;
  message: string;
  tone: "success" | "error";
};

const ToastContext = createContext<{
  success: (message: string) => void;
  error: (message: string) => void;
} | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, tone: Toast["tone"]) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }, []);
  const value = useMemo(
    () => ({
      success: (message: string) => push(message, "success"),
      error: (message: string) => push(message, "error"),
    }),
    [push],
  );
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            {toast.tone === "success" ? (
              <Check size={18} />
            ) : (
              <CircleAlert size={18} />
            )}
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
