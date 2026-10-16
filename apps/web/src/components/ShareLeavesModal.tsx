/**
 * 한 달치 내 휴가를 SNS에 올릴 이미지로 만들어 공유한다.
 *
 * 사용처: 내 휴가 화면의 "공유" 버튼.
 *
 * 배치는 @leave/shared의 buildLeaveShareCard가 정하고 여기서는 캔버스에 옮겨 그리기만
 * 한다(앱은 같은 배치를 SVG로 그린다). 파일 공유를 받는 브라우저(모바일 대부분)는
 * 공유 시트로, 받지 않는 브라우저(데스크톱 대부분)는 PNG 내려받기로 넘긴다.
 */

import {
  buildLeaveShareCard,
  defaultShareMonth,
  SHARE_BACKGROUNDS,
  shiftMonth,
  splitMonth,
  todayInSeoul,
  type ShareBackgroundId,
  type ShareCard,
} from "@leave/shared";
import type { MyLeave } from "@leave/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActionIcon } from "./ActionIcon";
import { Modal } from "./Modal";

/** 웹 본문과 같은 글꼴을 쓴다. 캔버스는 CSS 변수를 못 읽어 이름을 직접 적는다. */
const FONT_FAMILY =
  '"Leave Pretendard UI", "Pretendard Variable", Pretendard, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif';

function drawCard(canvas: HTMLCanvasElement, card: ShareCard) {
  canvas.width = card.width;
  canvas.height = card.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  for (const shape of card.shapes) {
    ctx.fillStyle = shape.fill;
    if (shape.kind === "rect") {
      ctx.beginPath();
      ctx.roundRect(shape.x, shape.y, shape.width, shape.height, shape.radius);
      ctx.fill();
    } else {
      ctx.font = `${shape.weight} ${shape.size}px ${FONT_FAMILY}`;
      ctx.textAlign = shape.anchor === "middle" ? "center" : shape.anchor;
      ctx.textBaseline = "alphabetic";
      ctx.fillText(shape.text, shape.x, shape.y);
    }
  }
}

function toPngFile(canvas: HTMLCanvasElement, name: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(new File([blob], name, { type: "image/png" }));
      else reject(new Error("이미지를 만들지 못했어요"));
    }, "image/png");
  });
}

function download(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  link.click();
  URL.revokeObjectURL(url);
}

export function ShareLeavesModal(props: {
  leaves: readonly MyLeave[];
  onClose: () => void;
}) {
  const [month, setMonth] = useState(() =>
    defaultShareMonth(props.leaves, todayInSeoul()),
  );
  const [background, setBackground] = useState<ShareBackgroundId>("green");
  const [showOutings, setShowOutings] = useState(false);
  const card = useMemo(
    () =>
      buildLeaveShareCard({
        month,
        leaves: props.leaves,
        background,
        showOutings,
      }),
    [month, props.leaves, background, showOutings],
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const [status, setStatus] = useState<"idle" | "working" | "error">("idle");
  const { year, monthNum } = splitMonth(month);

  // 글꼴이 오기 전에 그리면 시스템 글꼴로 한 번 그려진 채 남는다. 굵기마다 따로 받는다.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(
      [600, 700, 900].map((weight) =>
        document.fonts.load(`${weight} 40px "Leave Pretendard UI"`, "리브"),
      ),
    )
      .catch(() => undefined)
      .then(() => {
        if (!cancelled) setFontsReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (fontsReady && canvasRef.current) drawCard(canvasRef.current, card);
  }, [card, fontsReady]);

  const share = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setStatus("working");
    try {
      const file = await toPngFile(canvas, `leave-${month}.png`);
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: `${monthNum}월 휴가` });
      } else {
        download(file);
      }
      setStatus("idle");
    } catch (error) {
      // 공유 시트를 닫은 것은 실패가 아니다.
      setStatus(
        error instanceof DOMException && error.name === "AbortError"
          ? "idle"
          : "error",
      );
    }
  };

  const empty = card.outDays === 0;

  return (
    <Modal title="휴가 일정 공유" onClose={props.onClose}>
      <div style={{ display: "grid", gap: "var(--sp-md)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <button
            type="button"
            className="btn-icon"
            aria-label="이전 달"
            style={{ width: 44, height: 44 }}
            onClick={() => setMonth((value) => shiftMonth(value, -1))}
          >
            <ActionIcon name="left" />
          </button>
          <p className="body-md strong" aria-live="polite">
            {year}년 {monthNum}월
          </p>
          <button
            type="button"
            className="btn-icon"
            aria-label="다음 달"
            style={{ width: 44, height: 44 }}
            onClick={() => setMonth((value) => shiftMonth(value, 1))}
          >
            <ActionIcon name="right" />
          </button>
        </div>

        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`${year}년 ${monthNum}월 휴가 일정 이미지 미리보기`}
          style={{
            width: "100%",
            aspectRatio: `${card.width} / ${card.height}`,
            borderRadius: "var(--r-md)",
            background: "var(--canvas-soft)",
          }}
        />

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--sp-sm)",
          }}
        >
          <p className="body-md strong" id="share-background-label">
            배경
          </p>
          <div
            role="radiogroup"
            aria-labelledby="share-background-label"
            style={{ display: "flex", flexWrap: "wrap", gap: 4 }}
          >
            {SHARE_BACKGROUNDS.map((option) => {
              const selected = option.id === background;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${option.label} 배경`}
                  onClick={() => setBackground(option.id)}
                  style={{
                    // 44px 탭 영역 안에 32px 색 원을 둔다.
                    width: 44,
                    height: 44,
                    padding: 6,
                    border: 0,
                    borderRadius: "50%",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      display: "block",
                      width: "100%",
                      height: "100%",
                      borderRadius: "50%",
                      background: option.fill,
                      boxShadow: selected
                        ? "0 0 0 3px var(--ink)"
                        : "inset 0 0 0 1px var(--hairline)",
                    }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <label className="check-field">
          <input
            type="checkbox"
            checked={showOutings}
            onChange={(event) => setShowOutings(event.target.checked)}
          />
          <span>
            <strong>외출도 표시</strong>
          </span>
        </label>

        <p className="caption text-body">
          {empty
            ? "이 달에는 나가는 일정이 없어요. 다른 달을 골라주세요."
            : "초안·반려·취소한 일정은 이미지에 넣지 않아요."}
        </p>
        {status === "error" && (
          <p className="field-error" role="alert">
            이미지를 공유하지 못했어요. 다시 시도해주세요.
          </p>
        )}
        <button
          type="button"
          className="btn btn-primary"
          disabled={empty || !fontsReady || status === "working"}
          onClick={() => void share()}
        >
          <ActionIcon name="share" />
          {status === "working" ? "이미지 만드는 중" : "이미지로 공유"}
        </button>
      </div>
    </Modal>
  );
}
