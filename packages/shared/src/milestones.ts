/**
 * 복무 기념일 — 전역 D-n과 진급일.
 *
 * 사용처: 서버의 기념일 알림 cron(`apps/api/src/lib/milestone-notify.ts`),
 * 웹·앱의 축하 화면과 알림함.
 *
 * 판정과 문구를 한 곳에 두는 이유는 알림과 축하 화면이 같은 말을 해야 하기
 * 때문이다. 알림은 "D-100"이라는데 화면이 "100일 남았다"를 다른 기준(오늘 포함
 * 여부)으로 세면 하루가 어긋난다. 남은 일수는 `getRankInfo`의
 * `daysUntilDischarge`와 같은 `diffDays(오늘, 전역일)`이다.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import { currentRank, RANK_LABELS, type Rank } from "./rank";

/** 알림을 보내는 전역 D-n. 1은 "하루 전"이다. 큰 수부터 적는다. */
export const DISCHARGE_COUNTDOWN_DAYS = [
  600, 500, 400, 300, 200, 100, 50, 10, 1,
] as const;
export type DischargeCountdownDays = (typeof DISCHARGE_COUNTDOWN_DAYS)[number];

/** 진급 알림을 보내는 계급. 이병은 입대일이라 기념일로 치지 않는다. */
export const PROMOTION_MILESTONE_RANKS = [
  "private_first",
  "corporal",
  "sergeant",
] as const satisfies readonly Rank[];
export type PromotionMilestoneRank = (typeof PROMOTION_MILESTONE_RANKS)[number];

export type ServiceMilestone =
  | { kind: "discharge_countdown"; days: DischargeCountdownDays }
  | { kind: "promotion"; rank: PromotionMilestoneRank };

export function isDischargeCountdownDays(
  value: number,
): value is DischargeCountdownDays {
  return (DISCHARGE_COUNTDOWN_DAYS as readonly number[]).includes(value);
}

export function isPromotionMilestoneRank(
  value: string,
): value is PromotionMilestoneRank {
  return (PROMOTION_MILESTONE_RANKS as readonly string[]).includes(value);
}

/**
 * 오늘이 전역 D-n 기념일인 사람의 전역일 목록.
 *
 * 서버가 "오늘 알림을 받을 사람"을 `discharge_at IN (...)`으로 좁힐 때 쓴다.
 * 순서는 `DISCHARGE_COUNTDOWN_DAYS`와 같다.
 */
export function countdownDischargeDates(on: ISODate): ISODate[] {
  return DISCHARGE_COUNTDOWN_DAYS.map((days) => addDays(on, days));
}

/**
 * `on` 하루에 맞는 기념일들.
 *
 * 진급은 "어제의 계급과 오늘의 계급이 다른가"로 판정한다. 진급일을 직접 비교하지
 * 않는 이유는 가입 때 더 높은 계급을 적은 사람(조기 진급자) 때문이다 — 그 사람은
 * 표준 진급일이 와도 계급이 바뀌지 않으므로 축하할 일이 없다(`currentRank`의 하한).
 * 전역일 이후의 진급은 없다.
 */
export function milestonesOn(params: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  signupRank: Rank;
  on: ISODate;
}): ServiceMilestone[] {
  const { enlistedAt, dischargeAt, signupRank, on } = params;
  const result: ServiceMilestone[] = [];

  const daysLeft = diffDays(on, dischargeAt);
  if (isDischargeCountdownDays(daysLeft)) {
    result.push({ kind: "discharge_countdown", days: daysLeft });
  }

  if (on < dischargeAt && on > enlistedAt) {
    const before = currentRank({ enlistedAt, signupRank, on: addDays(on, -1) });
    const after = currentRank({ enlistedAt, signupRank, on });
    if (before !== after && isPromotionMilestoneRank(after)) {
      result.push({ kind: "promotion", rank: after });
    }
  }
  return result;
}

/** 알림·저장에 쓰는 안정된 키. 같은 날 같은 기념일을 두 번 보내지 않는 데 쓴다. */
export function milestoneKey(milestone: ServiceMilestone): string {
  return milestone.kind === "discharge_countdown"
    ? `discharge_countdown:${milestone.days}`
    : `promotion:${milestone.rank}`;
}

/** "전역 D-100" / "전역 하루 전" / "상병 진급" — 화면 제목과 배지에 쓰는 짧은 이름. */
export function milestoneLabel(milestone: ServiceMilestone): string {
  if (milestone.kind === "promotion") {
    return `${RANK_LABELS[milestone.rank]} 진급`;
  }
  return milestone.days === 1 ? "전역 하루 전" : `전역 D-${milestone.days}`;
}

/** 본인에게 가는 알림의 제목·본문. */
export function milestoneNotificationText(milestone: ServiceMilestone): {
  title: string;
  body: string;
} {
  if (milestone.kind === "promotion") {
    const rank = RANK_LABELS[milestone.rank];
    return {
      title: `${rank} 진급을 축하해요`,
      body: `오늘부터 ${rank}이에요. 여기까지 정말 고생 많았어요!`,
    };
  }
  if (milestone.days === 1) {
    return {
      title: "전역 하루 전이에요",
      body: "내일이면 전역이에요. 그동안 정말 수고 많았어요!",
    };
  }
  return {
    title: `전역 D-${milestone.days}`,
    body: `전역까지 ${milestone.days}일 남았어요. 여기까지 온 걸 축하해요!`,
  };
}

/** 친구에게 가는 알림의 제목·본문. 이름은 알림을 만드는 시점의 이름이다. */
export function friendMilestoneNotificationText(
  milestone: ServiceMilestone,
  friendName: string,
): { title: string; body: string } {
  if (milestone.kind === "promotion") {
    const rank = RANK_LABELS[milestone.rank];
    return {
      title: `친구의 ${rank} 진급`,
      body: `${friendName}님이 오늘 ${rank}으로 진급했어요. 축하해주세요!`,
    };
  }
  if (milestone.days === 1) {
    return {
      title: "친구의 전역 하루 전",
      body: `${friendName}님이 내일 전역해요. 축하해주세요!`,
    };
  }
  return {
    title: `친구의 전역 D-${milestone.days}`,
    body: `${friendName}님이 전역까지 ${milestone.days}일 남았어요. 축하해주세요!`,
  };
}

/** 축하 화면 주소에 싣는 값. 웹은 쿼리 문자열, 앱은 라우트 파라미터로 쓴다. */
export type MilestoneParams = { kind: string; days?: string; rank?: string };

export function milestoneParams(milestone: ServiceMilestone): MilestoneParams {
  return milestone.kind === "discharge_countdown"
    ? { kind: milestone.kind, days: String(milestone.days) }
    : { kind: milestone.kind, rank: milestone.rank };
}

/** 주소에서 기념일을 되읽는다. 목록에 없는 값이면 null — 주소는 누구나 고쳐 칠 수 있다. */
export function parseMilestoneParams(params: {
  kind?: string | null;
  days?: string | null;
  rank?: string | null;
}): ServiceMilestone | null {
  if (params.kind === "discharge_countdown") {
    const days = Number(params.days);
    return isDischargeCountdownDays(days)
      ? { kind: "discharge_countdown", days }
      : null;
  }
  if (params.kind === "promotion" && params.rank) {
    return isPromotionMilestoneRank(params.rank)
      ? { kind: "promotion", rank: params.rank }
      : null;
  }
  return null;
}

const COUNTDOWN_MESSAGES: Record<DischargeCountdownDays, string> = {
  600: "긴 여정의 큰 고비 하나를 넘었어요. 지금처럼만 가요.",
  500: "500일 남았어요. 하루하루 차근차근 잘 해내고 있어요.",
  400: "400일, 이제 반환점이 보이기 시작해요.",
  300: "300일 남았어요. 한 걸음씩 꾸준히 여기까지 왔어요.",
  200: "200일 남았어요. 이제 끝이 보이기 시작해요.",
  100: "드디어 백 일 남았어요. 두 자릿수가 코앞이에요!",
  50: "50일! 이제 마지막 스퍼트예요.",
  10: "열흘 남았어요. 거의 다 왔어요!",
  1: "그동안 정말 고생 많았어요. 마지막 하루도 무사히 보내요!",
};

const PROMOTION_MESSAGES: Record<PromotionMilestoneRank, string> = {
  private_first: "이병 딱지를 뗐어요. 새 계급장이 잘 어울려요!",
  corporal: "어느덧 상병이에요. 든든한 선임이 되어 가고 있어요.",
  sergeant: "드디어 병장! 전역이 정말 가까워졌어요.",
};

/**
 * 축하 화면의 문구. `hero`는 화면 가운데 크게 쓰는 짧은 글자다
 * (D-n이면 숫자, 하루 전이면 "D-1", 진급이면 계급 이름).
 */
export function milestoneCelebration(milestone: ServiceMilestone): {
  eyebrow: string;
  hero: string;
  heroUnit: string | null;
  headline: string;
  message: string;
} {
  if (milestone.kind === "promotion") {
    const rank = RANK_LABELS[milestone.rank];
    return {
      eyebrow: "진급 축하",
      hero: rank,
      heroUnit: null,
      headline: `${rank} 진급을 축하해요`,
      message: PROMOTION_MESSAGES[milestone.rank],
    };
  }
  if (milestone.days === 1) {
    return {
      eyebrow: "전역 하루 전",
      hero: "D-1",
      heroUnit: null,
      headline: "내일이면 전역이에요",
      message: COUNTDOWN_MESSAGES[1],
    };
  }
  return {
    eyebrow: `전역 D-${milestone.days}`,
    hero: String(milestone.days),
    heroUnit: "일",
    headline: `전역까지 ${milestone.days}일 남았어요`,
    message: COUNTDOWN_MESSAGES[milestone.days],
  };
}
