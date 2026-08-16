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

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** 모달 최대 폭. 폼이 넓을수록 데스크톱에서 스크롤이 줄어든다. */
const MAX_WIDTH = { regular: 480, wide: 760 } as const;

export function Modal(props: {
  title: string;
  onClose: () => void;
  /** `wide`는 입력이 많은 폼(휴가 등록/수정)용. 좁은 화면에서는 둘 다 꽉 찬다. */
  size?: keyof typeof MAX_WIDTH;
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

  return createPortal(
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
