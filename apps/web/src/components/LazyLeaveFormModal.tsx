/**
 * 휴가 폼은 사용자가 등록·수정을 누른 뒤에만 받는다.
 * 포인터가 버튼에 머물거나 키보드 포커스가 오면 같은 로더로 미리 받아,
 * 실제 클릭 때의 대기를 줄인다.
 */

import {
  Component as ReactComponent,
  lazy,
  Suspense,
  useRef,
  type ReactNode,
} from "react";
import type {
  LeaveFormModal as LeaveFormModalComponent,
  LeaveFormModalProps,
} from "./LeaveFormModal";
import { Modal } from "./Modal";

type LeaveFormModule = { LeaveFormModal: typeof LeaveFormModalComponent };

let modulePromise: Promise<LeaveFormModule> | undefined;

function loadLeaveFormModal(): Promise<LeaveFormModule> {
  modulePromise ??= import("./LeaveFormModal").catch((error: unknown) => {
    // 우리 쪽 promise 캐시는 실패를 보존하지 않고, 오류는 아래 경계로 전달한다.
    modulePromise = undefined;
    throw error;
  });
  return modulePromise;
}

const DeferredLeaveFormModal = lazy(() =>
  loadLeaveFormModal().then((module) => ({ default: module.LeaveFormModal })),
);

/** 실제로 폼을 열 가능성이 높은 hover/focus에서만 호출한다. */
export function preloadLeaveFormModal(): void {
  void loadLeaveFormModal().catch(() => undefined);
}

/** 느린 연결에서도 클릭이 반응했다는 사실을 즉시 보이고 스크린리더에 알린다. */
function LeaveFormLoading(
  props: Pick<LeaveFormModalProps, "editing" | "onClose">,
) {
  return (
    <Modal
      title={props.editing ? "휴가 수정" : "휴가 등록"}
      onClose={props.onClose}
      size="wide"
    >
      <div
        role="status"
        aria-live="polite"
        aria-busy="true"
        tabIndex={-1}
        data-modal-initial-focus
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "var(--sp-md)",
          minHeight: 96,
        }}
      >
        <div className="spinner" aria-hidden="true" />
        <span className="body-sm strong">휴가 양식을 불러오는 중…</span>
      </div>
    </Modal>
  );
}

type LeaveFormErrorBoundaryProps = Pick<
  LeaveFormModalProps,
  "editing" | "onClose"
> & {
  children: ReactNode;
};

/** 청크 다운로드 실패를 이 화면 안에 가두고, 안전하게 새 문서에서 다시 받는다. */
class LeaveFormErrorBoundary extends ReactComponent<
  LeaveFormErrorBoundaryProps,
  { failed: boolean }
> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;

    return (
      <Modal
        title={this.props.editing ? "휴가 수정" : "휴가 등록"}
        onClose={this.props.onClose}
        size="wide"
      >
        <div role="alert">
          <p className="body-lg strong">휴가 양식을 불러오지 못했어요.</p>
          <p
            className="body-sm text-body"
            style={{ marginTop: "var(--sp-sm)" }}
          >
            연결을 확인한 뒤 페이지를 새로고침해 주세요. 아직 양식이 열리지 않아
            입력한 내용은 없어요.
          </p>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "var(--sp-sm)",
              marginTop: "var(--sp-xl)",
            }}
          >
            <button
              type="button"
              className="btn btn-secondary"
              onClick={this.props.onClose}
            >
              닫기
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => window.location.reload()}
              autoFocus
            >
              페이지 새로고침
            </button>
          </div>
        </div>
      </Modal>
    );
  }
}

export function LazyLeaveFormModal(props: LeaveFormModalProps) {
  const triggerRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const close = () => {
    props.onClose();
    const trigger = triggerRef.current;
    window.requestAnimationFrame(() => {
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    });
  };

  return (
    <LeaveFormErrorBoundary editing={props.editing} onClose={close}>
      <Suspense
        fallback={<LeaveFormLoading editing={props.editing} onClose={close} />}
      >
        <DeferredLeaveFormModal {...props} onClose={close} />
      </Suspense>
    </LeaveFormErrorBoundary>
  );
}
