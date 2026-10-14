/**
 * 새 기능 안내. 계정마다 최신 안내를 한 번만 띄운다.
 *
 * 사용처: AppLayout(로그인 뒤 모든 화면). 내용은 @leave/shared의 LATEST_WHATS_NEW,
 * "봤다"는 기록은 서버 계정에 남는다 — 앱에서 본 안내는 웹에서 다시 뜨지 않는다.
 * 닫는 방법(버튼·Esc·바깥 누르기)과 상관없이 닫으면 본 것으로 친다.
 */

import type { Me } from "@leave/client";
import { useMarkWhatsNewSeen } from "@leave/client";
import { LATEST_WHATS_NEW, shouldShowWhatsNew } from "@leave/shared";
import { Modal } from "./Modal";

export function WhatsNewModal(props: { me: Me }) {
  const markSeen = useMarkWhatsNewSeen();
  if (!shouldShowWhatsNew(props.me.user.seenWhatsNewId)) return null;

  const close = () => markSeen.mutate(LATEST_WHATS_NEW.id);

  return (
    <Modal title={LATEST_WHATS_NEW.title} onClose={close}>
      <div style={{ display: "grid", gap: "var(--sp-lg)" }}>
        <p className="body-md text-body">{LATEST_WHATS_NEW.intro}</p>
        {LATEST_WHATS_NEW.features.map((feature, index) => (
          <section
            key={feature.title}
            className="card-sage"
            style={{
              padding: "var(--sp-lg)",
              display: "grid",
              gap: "var(--sp-sm)",
            }}
          >
            <h3 className="body-lg strong">
              {index + 1}. {feature.title}
            </h3>
            <p className="body-md text-body">{feature.pitch}</p>
            <ol
              className="body-md"
              style={{
                margin: 0,
                paddingLeft: "1.2em",
                display: "grid",
                gap: 4,
              }}
            >
              {feature.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
        <button
          type="button"
          className="btn btn-primary"
          data-modal-initial-focus
          onClick={close}
        >
          확인했어요
        </button>
      </div>
    </Modal>
  );
}
