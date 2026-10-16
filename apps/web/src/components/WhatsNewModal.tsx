/**
 * 새 기능 안내. 계정마다 최신 안내를 한 번만 띄운다.
 *
 * 사용처: AppLayout(로그인 뒤 모든 화면). 내용은 @leave/shared의 LATEST_WHATS_NEW,
 * "봤다"는 기록은 서버 계정에 남는다 — 앱에서 본 안내는 웹에서 다시 뜨지 않는다.
 * 닫는 방법(버튼·Esc·바깥 누르기)과 상관없이 닫으면 본 것으로 친다.
 *
 * 기능마다 한 장씩 넘긴다. 그림은 온보딩 사용법 투어의 무대(TourStage)가 그대로
 * 그리고, 아래 글은 그림이 해 보이는 동작을 한두 문장으로 말한다.
 */

import type { Me } from "@leave/client";
import { useMarkWhatsNewSeen } from "@leave/client";
import { LATEST_WHATS_NEW, shouldShowWhatsNew } from "@leave/shared";
import { useState } from "react";
import { TourStage } from "../pages/onboarding/TourStage";
import { Modal } from "./Modal";

export function WhatsNewModal(props: { me: Me }) {
  const markSeen = useMarkWhatsNewSeen();
  const [index, setIndex] = useState(0);
  if (!shouldShowWhatsNew(props.me.user.seenWhatsNewId)) return null;

  const { scenes } = LATEST_WHATS_NEW;
  const last = scenes.length - 1;
  const scene = scenes[Math.min(index, last)];
  if (!scene) return null;
  const close = () => markSeen.mutate(LATEST_WHATS_NEW.id);
  const go = (next: number) => setIndex(Math.min(Math.max(next, 0), last));

  return (
    <Modal title={LATEST_WHATS_NEW.title} onClose={close}>
      <div style={{ display: "grid", gap: "var(--sp-md)" }}>
        <TourStage
          scene={scene}
          onSwipe={(direction) => go(index + direction)}
        />
        <div aria-live="polite" style={{ display: "grid", gap: 4 }}>
          <p className="caption text-body">
            {index + 1} / {scenes.length} · {scene.label}
          </p>
          <h3 className="body-lg strong">{scene.title}</h3>
          <p className="body-md text-body">{scene.body}</p>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
          {index > 0 ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => go(index - 1)}
            >
              이전
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            data-modal-initial-focus
            onClick={() => (index < last ? go(index + 1) : close())}
          >
            {index < last ? "다음" : "확인했어요"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
