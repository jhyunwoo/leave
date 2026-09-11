/**
 * 군별 외출 통상 운영값과 그 근거.
 *
 * 사용처: 온보딩 완료 시 기본 설정 시드, 보유 휴가의 외출 자동 적립 설정 화면.
 *
 * 여기 있는 숫자는 **규정이 아니라 제안값**이다. 법령(군인복무기본법 제18조·시행령,
 * 부대관리훈령 제51~57조)이 정하는 것은 "지휘관이 승인한다"와 외출이 당일 복귀라는
 * 것(과업 개시 ~ 저녁점호 전)뿐이고, 한 달에 몇 번인지는 각 군과 부대의 지침이다.
 * 부대관리훈령은 세부 기준을 **각 군 참모총장이 달리 정할 수 있다**고 명시한다.
 * 그래서 화면은 이 값을 기본으로 깔되 사용자가 고칠 수 있게 두고, 출처와
 * "부대 지침이 우선"이라는 고지를 함께 보여준다.
 *
 * `regular-overnight-guidance.ts`와 같은 원칙이다 — **군종은 제안값만 주고 상한은
 * 주지 않는다**(lib/leave-balances.ts의 saveRegularOvernightConfig 주석).
 */

import type { OutingKind } from "./leave";
import { BRANCH_LABELS, type Branch } from "./rank";

export const OUTING_VERIFIED_AT = "2026-09-11";

export type OutingDefaults = {
  /** 꺼진 갈래는 사용자가 부대 안내를 보고 직접 켠다. */
  enabled: boolean;
  /**
   * 달 단위 주기. 외출은 어느 군이든 "한 달에 몇 번"으로 운영돼 일 단위를 쓰지 않는다.
   * 달 산술을 쓰는 이유는 leave-cycle.ts 머리말에 있다.
   */
  intervalMonths: number;
  /** 한 주기에 나갈 수 있는 횟수. 외출은 당일 복귀라 횟수 = 일수다. */
  countPerGrant: number;
};

/**
 * 군별 · 갈래별 기본값.
 *
 * **평일 외출**은 일과 후에 나갔다 저녁점호 전에 돌아오는 것으로, 육군 기준 월 2회
 * 운영한다. 해·공군도 일과 후 외출을 같은 리듬으로 두는 것이 통상이라 같은 값을 깐다.
 *
 * **주말 외출**은 육군만 켜 둔다. 육군은 2012년 12월 외박제도 개정 이후 "분기별 1회
 * 1박 2일 외박 + 월 1회 외출"로 운영한다고 공개 자료가 말한다. 해·공군은 6주마다
 * 2박 3일 외박을 받고 그 사이 주말에 나가지만, **몇 주마다인지가 공개 규정에 없다.**
 * 근거 없는 숫자를 깔면 사용자는 그것을 규정으로 읽는다 — 그래서 끄고, 부대 안내를
 * 보고 직접 넣게 한다.
 */
export const OUTING_DEFAULTS: Record<
  Branch,
  Record<OutingKind, OutingDefaults>
> = {
  army: {
    weekday: { enabled: true, intervalMonths: 1, countPerGrant: 2 },
    weekend: { enabled: true, intervalMonths: 1, countPerGrant: 1 },
  },
  navy: {
    weekday: { enabled: true, intervalMonths: 1, countPerGrant: 2 },
    weekend: { enabled: false, intervalMonths: 1, countPerGrant: 1 },
  },
  air_force: {
    weekday: { enabled: true, intervalMonths: 1, countPerGrant: 2 },
    weekend: { enabled: false, intervalMonths: 1, countPerGrant: 1 },
  },
};

export const OUTING_SOURCES = [
  {
    label: "군인복무기본법 제18조",
    url: "https://law.go.kr/lsInfoP.do?ancYnChk=0&lsId=012438",
  },
  {
    label: "부대관리훈령 제51~57조 (외출·외박·면회)",
    url: "https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2200000076719",
  },
  {
    label: "찾기쉬운 생활법령정보 — 현역병의 외출·외박 및 면회",
    url: "https://easylaw.go.kr/CSP/CnpClsMain.laf?popMenu=ov&csmSeq=1461&ccfNo=2&cciNo=3&cnpClsNo=2",
  },
] as const;

export interface OutingGuidance {
  branch: Branch;
  /** 설정 화면 제목 아래 한 줄. 이 군의 통상 운영을 그대로 말한다. */
  summary: string;
  /** 기준일을 왜 물어보는지. */
  detail: string;
  disclaimer: string;
}

export function outingGuidance(branch: Branch): OutingGuidance {
  const label = BRANCH_LABELS[branch];
  const weekend = OUTING_DEFAULTS[branch].weekend.enabled;
  return {
    branch,
    summary: weekend
      ? `${label}은 통상 일과 후 외출 월 2회와 주말 외출 월 1회를 운영해요.`
      : `${label}은 통상 일과 후 외출 월 2회를 운영해요. 주말 외출 주기는 부대마다 달라 기본값을 두지 않았어요.`,
    detail:
      // 주기 시작일을 앱이 임의로 고르면 처음부터 어긋난 주기를 계산하게 된다.
      // 기본값은 입대월 1일이지만, 부대가 다른 날부터 센다면 사용자가 고쳐야 한다.
      "기본 주기는 입대한 달의 1일부터 한 달씩 셉니다. 부대가 다른 날을 기준으로 센다면 그 날짜로 바꾸세요.",
    disclaimer:
      "외출·외박은 지휘관 승인 사항이며 근무형태와 부대 지침에 따라 달라질 수 있습니다.",
  };
}

/**
 * 외출 주기의 기본 시작일 — 입대한 달의 1일.
 *
 * "한 달에 두 번"은 달력의 달로 세는 것이 실제 운영이라 주기도 달의 경계에 맞춘다.
 * 입대일 그대로를 쓰면 3/15~4/14 같은 주기가 되어 부대가 세는 달과 어긋난다.
 *
 * 첫 적립은 한 주기 뒤이므로(leave-cycle.ts) 입대 다음 달 1일이 된다 — 신병교육
 * 기간에는 외출이 없으니 규정과도 맞다.
 */
export function defaultOutingStartDate(enlistedAt: string): string {
  return `${enlistedAt.slice(0, 7)}-01`;
}
