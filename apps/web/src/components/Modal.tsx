/**
 * 공용 모달 껍데기.
 *
 * 사용처: 휴가 등록/수정, 적립분 편집 등 웹의 모든 대화형 폼.
 * 열려 있는 동안 배경 스크롤을 잠그고 Esc로 닫는다.
 *
 * ## 왜 `document.body`로 포털을 쓰는가
 *
 * `position: fixed`의 기준은 뷰포트가 아니라 **transform이 걸린 가장 가까운
 * 조상**이다. 페이지 컨테이너 대부분이 쓰는 `.anim-rise`는
 * `animation-fill-mode: both`라 애니메이션이 끝난 뒤에도 마지막 키프레임의
 * `transform: translateY(0)`을 계속 물고 있어서, 모달을 페이지 트리 안에 그대로
 * 두면 오버레이가 화면이 아니라 그 페이지 칸을 덮는다. 목록이 길어질수록 모달은
 * 칸 한가운데(=화면 아래쪽)에 놓이고, 배경 스크롤은 잠겨 있으니 저장 버튼에
 * 닿을 방법이 없어진다. 조상의 스타일에 기대지 않도록 body로 꺼내 그린다.
 */

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
      // 배경 클릭으로 닫되, **누른 곳과 뗀 곳이 모두 배경일 때만** 닫는다.
      //
      // `onClick`만 보면 안 되는 이유: click의 target은 누른 노드와 뗀 노드의
      // 공통 조상이다. 모달 안에서 글자를 드래그하다가 손이 모달 밖으로 나간 채
      // 버튼을 놓으면 공통 조상이 이 오버레이가 되어, 안에서 시작한 드래그인데도
      // `e.target === e.currentTarget`이 참이 되고 모달이 닫힌다(입력 내용 유실).
      // 데스크톱에서 텍스트를 조금만 길게 끌어도 재현된다.
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
          // dvh로 잰다. 모바일 주소창이 펼쳐져 있으면 90vh가 실제로 보이는 높이를
          // 넘어서, 폼 맨 아래 버튼이 주소창 밑에 깔린다.
          maxHeight: "90dvh",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
          // fill-mode는 `backwards`. `both`면 등장 애니메이션이 끝난 뒤에도
          // transform이 남아, 이 안에 그리는 폼이 `position: fixed`를 쓸 때
          // 화면이 아니라 이 카드를 기준으로 놓인다(.anim-rise와 같은 함정).
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
            style={{ width: 36, height: 36, border: "none" }}
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
