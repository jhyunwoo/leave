/**
 * 새 기능 안내 모달의 내용.
 *
 * 사용처: 웹·앱이 로그인 뒤 한 번 띄우는 "새로 생긴 기능" 모달, 서버의 본 기록 저장.
 *
 * 계정마다 마지막으로 본 안내의 id를 서버에 남긴다(users.seen_whats_new_id). 그래서
 * 웹에서 본 안내는 앱에서 다시 뜨지 않는다. 새 안내를 내보낼 때는 `LATEST_WHATS_NEW`를
 * 새 id로 바꾸기만 하면 모든 사용자에게 한 번씩 다시 뜬다 — id는 다시 쓰지 않는다.
 */

export type WhatsNewFeature = {
  title: string;
  /** 왜 좋은지 한두 문장. */
  pitch: string;
  /** 어디서 어떻게 쓰는지, 누르는 순서대로. */
  steps: readonly string[];
};

export type WhatsNew = {
  id: string;
  title: string;
  intro: string;
  features: readonly WhatsNewFeature[];
};

export const LATEST_WHATS_NEW: WhatsNew = {
  id: "2026-10-share-image-overnight-toggle",
  title: "리브에 새 기능이 생겼어요",
  intro:
    "캡처 대신 깔끔한 이미지로 휴가를 자랑하고, 남은 휴가는 내 부대 기준으로 보세요.",
  features: [
    {
      title: "휴가 일정을 이미지로 공유",
      pitch:
        "한 달 달력에 내 휴가를 색으로 칠한 이미지를 바로 만들어요. 인스타그램 스토리나 카카오톡에 그대로 올릴 수 있어요.",
      steps: [
        "내 휴가 탭에서 공유 버튼을 눌러요.",
        "화살표로 공유할 달을 골라요.",
        "이미지로 공유를 누르고 올릴 앱을 고르면 끝이에요.",
      ],
    },
    {
      title: "남은 휴가에 외박을 넣을지 직접 정하기",
      pitch:
        "외박을 휴가에 붙여 쓸 수 없는 부대라면 남은 휴가에서 외박을 뺄 수 있어요. 육군은 처음부터 빼 두었어요.",
      steps: [
        "내 휴가 탭의 보유 휴가 카드 아래를 봐요.",
        "남은 휴가에 외박 포함 스위치를 켜거나 꺼요.",
      ],
    },
  ],
};

/** 이 사용자에게 안내를 띄워야 하는가. */
export function shouldShowWhatsNew(seenId: string | null | undefined): boolean {
  return seenId !== LATEST_WHATS_NEW.id;
}
