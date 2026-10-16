/**
 * 새 기능 안내 모달의 내용.
 *
 * 사용처: 웹·앱이 로그인 뒤 한 번 띄우는 "새로 생긴 기능" 모달, 서버의 본 기록 저장.
 *
 * 계정마다 마지막으로 본 안내의 id를 서버에 남긴다(users.seen_whats_new_id). 그래서
 * 웹에서 본 안내는 앱에서 다시 뜨지 않는다. 새 안내를 내보낼 때는 `LATEST_WHATS_NEW`를
 * 새 id로 바꾸기만 하면 모든 사용자에게 한 번씩 다시 뜬다 — id는 다시 쓰지 않는다.
 */

import {
  TOUR_HOLDINGS_SCENE,
  TOUR_SHARE_SCENE,
  type TourScene,
} from "./onboarding-tour";

export type WhatsNew = {
  id: string;
  title: string;
  /**
   * 기능마다 한 장. 온보딩 사용법 투어와 같은 모션 그래픽 장면이라 그림이 직접
   * 눌러 보이고, 장면의 제목·설명(title·body)이 그 아래 짧은 글이 된다.
   */
  scenes: readonly TourScene[];
};

export const LATEST_WHATS_NEW: WhatsNew = {
  // 2026-10-share-image-overnight-toggle은 같은 기능을 글로만 안내했다. 그림으로 다시
  // 보여주려고 id를 바꿨다 — 그 안내를 본 사람에게도 한 번 더 뜬다.
  id: "2026-10-share-image-motion",
  title: "리브에 새 기능이 생겼어요",
  scenes: [TOUR_SHARE_SCENE, TOUR_HOLDINGS_SCENE],
};

/** 이 사용자에게 안내를 띄워야 하는가. */
export function shouldShowWhatsNew(seenId: string | null | undefined): boolean {
  return seenId !== LATEST_WHATS_NEW.id;
}
