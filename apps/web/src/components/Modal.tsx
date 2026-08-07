/**
 * 공용 모달 껍데기.
 *
 * 사용처: 휴가 등록/수정, 적립분 편집 등 웹의 모든 대화형 폼.
 * 열려 있는 동안 배경 스크롤을 잠그고 Esc로 닫는다.
 */

import { useEffect, type ReactNode } from "react";

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
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

  return (
    <div
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) props.onClose();
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
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="card"
        style={{
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          overflowY: "auto",
          boxShadow: "var(--shadow-modal)",
          animation: "pop-in 0.28s cubic-bezier(0.2, 0.7, 0.2, 1) both",
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
    </div>
  );
}
