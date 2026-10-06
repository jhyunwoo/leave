/** body 포털을 사용해 조상의 transform이 fixed 모달의 기준을 바꾸지 않게 한다. */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 모달 최대 폭. 폼이 넓을수록 데스크톱에서 스크롤이 줄어든다. */
const MAX_WIDTH = { regular: 480, wide: 760 } as const;
const FOCUSABLE_SELECTOR =
  "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function Modal(props: {
  title: string;
  onClose: () => void;
  /** `wide`는 입력이 많은 폼(휴가 등록/수정)용. 좁은 화면에서는 둘 다 꽉 찬다. */
  size?: keyof typeof MAX_WIDTH;
  children: ReactNode;
}) {
  // 배경을 누른 곳이 어디인지 기억해 둔다. 아래 onPointerUp 참고.
  const pressedOverlay = useRef(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  // 포털이 커밋되기 전 렌더 단계에서 열었던 버튼을 기억해야 autoFocus보다 앞선다.
  const returnFocusRef = useRef<HTMLElement | null>(
    typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );

  useLayoutEffect(() => {
    const overlay = overlayRef.current;
    const dialog = dialogRef.current;
    if (!overlay || !dialog) return;
    const returnFocus = returnFocusRef.current;

    // 포털 형제(앱 루트와 다른 화면 고정 UI)를 접근성 트리와 탭 순서에서 뺀다.
    // 이전 inert 상태를 보존해 다른 대화상자의 상태를 덮어쓰지 않는다.
    const background = Array.from(document.body.children)
      .filter(
        (element): element is HTMLElement =>
          element instanceof HTMLElement && element !== overlay,
      )
      .map((element) => ({ element, wasInert: element.inert }));
    for (const { element } of background) element.inert = true;

    // 자식의 autoFocus가 없을 때도 키보드 포커스가 배경에 남지 않게 한다.
    if (!dialog.contains(document.activeElement)) {
      const firstFocusable = dialog.querySelector<HTMLElement>(
        `[data-modal-initial-focus], [autofocus], ${FOCUSABLE_SELECTOR}`,
      );
      (firstFocusable ?? dialog).focus({ preventScroll: true });
    }

    return () => {
      for (const { element, wasInert } of background) {
        element.inert = wasInert;
      }
      if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [props]);

  return createPortal(
    <div
      ref={overlayRef}
      role="presentation"
      // 모달 안에서 시작한 드래그가 폼을 닫지 않도록 양 끝이 배경일 때만 닫는다.
      onPointerDown={(e) => {
        pressedOverlay.current = e.target === e.currentTarget;
      }}
      onPointerUp={(e) => {
        const startedOnOverlay = pressedOverlay.current;
        pressedOverlay.current = false;
        if (startedOnOverlay && e.target === e.currentTarget) props.onClose();
      }}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(14, 15, 12, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--sp-lg)",
        zIndex: 50,
        animation: "fade-in 0.2s ease both",
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              FOCUSABLE_SELECTOR,
            ),
          ).filter((element) => element.getClientRects().length > 0);
          const currentIndex = focusable.findIndex(
            (element) => element === document.activeElement,
          );
          let target: HTMLElement | undefined;
          if (event.shiftKey && currentIndex <= 0) {
            target = focusable.at(-1);
          } else if (
            !event.shiftKey &&
            (currentIndex === -1 || currentIndex === focusable.length - 1)
          ) {
            target = focusable[0];
          }
          if (!target) return;
          event.preventDefault();
          target.focus();
        }}
        className="card"
        style={{
          width: "100%",
          maxWidth: MAX_WIDTH[props.size ?? "regular"],
          // 펼쳐진 모바일 주소창 아래로 폼이 가려지지 않도록 실제 뷰포트 높이를 쓴다.
          maxHeight: "90dvh",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
          // transform을 남기면 자식의 fixed UI가 뷰포트 대신 카드를 기준으로 놓인다.
          animation: "pop-in 0.28s cubic-bezier(0.2, 0.7, 0.2, 1) backwards",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "var(--sp-lg)",
          }}
        >
          <h2 className="display-xs">{props.title}</h2>
          <button
            type="button"
            className="btn-icon"
            aria-label="닫기"
            onClick={props.onClose}
            /* 테두리는 `.btn-icon`이 준 것을 그대로 둔다. 예전에는 여기서 껐는데
               배경이 --canvas(모달과 같은 흰색)라 남는 것이 ×자 하나뿐이었다. */
            style={{ width: 44, height: 44 }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3L3 13"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {props.children}
      </div>
    </div>,
    document.body,
  );
}
