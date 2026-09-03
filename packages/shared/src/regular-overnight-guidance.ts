/**
 * 군별 정기외박 통상 운영값과 그 근거.
 *
 * 사용처: 온보딩 정기외박 단계(웹·네이티브), 보유 휴가의 자동 적립 설정.
 *
 * 여기 있는 숫자는 **규정이 아니라 제안값**이다. 법령(군인복무기본법 제18조·시행령,
 * 부대관리훈령 제56~57조)이 정하는 것은 "지휘관이 승인한다"와 외박 시간 상한
 * (48시간, 공휴일·토요일이 끼면 72시간)뿐이고, 몇 주기마다 몇 박인지는 각 군과
 * 부대의 지침이다. 그래서 화면은 이 값을 기본으로 깔되 사용자가 고칠 수 있게 두고,
 * 출처와 "부대 지침이 우선"이라는 고지를 함께 보여준다.
 */

import { isValidISODate, type ISODate } from "./dates";
import { BRANCH_LABELS, type Branch } from "./rank";
import { cycleDateAfter, regularOvernightInterval } from "./regular-overnight";

export const REGULAR_OVERNIGHT_VERIFIED_AT = "2026-09-03";

export type RegularOvernightDefaults = {
  /** 일 단위 주기. 달 단위와 둘 중 하나만 값을 갖는다. */
  intervalDays: number | null;
  /** 달 단위 주기. 규정이 "분기"처럼 달로 쓰여 있을 때 쓴다. */
  intervalMonths: number | null;
  daysPerGrant: number;
};

/**
 * 군별 기본 주기.
 *
 * 육군은 2012년 12월 외박제도 개정 이후 분기별 1회 1박 2일(+ 월 1회 외출)로 운영한다.
 * "분기"는 달 단위라 일수로 옮기면 어긋나므로(91일로 잡으면 네 주기마다 하루씩
 * 앞당겨진다) 달 단위 주기로 둔다. 해·공군의 6주는 일수로 정확히 떨어져 일 단위다.
 */
export const REGULAR_OVERNIGHT_DEFAULTS: Record<
  Branch,
  RegularOvernightDefaults
> = {
  army: { intervalDays: null, intervalMonths: 3, daysPerGrant: 2 },
  navy: { intervalDays: 42, intervalMonths: null, daysPerGrant: 3 },
  air_force: { intervalDays: 42, intervalMonths: null, daysPerGrant: 3 },
};

export const REGULAR_OVERNIGHT_SOURCES = [
  {
    label: "군인복무기본법 제18조",
    url: "https://law.go.kr/lsInfoP.do?ancYnChk=0&lsId=012438",
  },
  {
    label: "군인복무기본법 시행령 제14조",
    url: "https://law.go.kr/LSW/LsiJoLinkP.do?docType=JO&joNo=001400000&lsNm=%EA%B5%B0%EC%9D%B8%EC%9D%98+%EC%A7%80%EC%9C%84+%EB%B0%8F+%EB%B3%B5%EB%AC%B4%EC%97%90+%EA%B4%80%ED%95%9C+%EA%B8%B0%EB%B3%B8%EB%B2%95+%EC%8B%9C%ED%96%89%EB%A0%B9",
  },
  {
    label: "부대관리훈령 제56~57조 (외출·외박)",
    url: "https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq=2200000076719",
  },
  {
    label: "국회예산정책처 군 복무여건 개선사업 평가",
    url: "https://www.nabo.go.kr/ko/report/analysisView.do?idx=8409&key=2509250001",
  },
] as const;

export interface RegularOvernightGuidance {
  branch: Branch;
  /** 단계 제목 아래 한 줄. 이 군의 통상 운영을 그대로 말한다. */
  summary: string;
  /** 기준일을 왜 직접 물어보는지. */
  detail: string;
  disclaimer: string;
}

export function regularOvernightGuidance(
  branch: Branch,
): RegularOvernightGuidance {
  const label = BRANCH_LABELS[branch];
  return {
    branch,
    summary:
      branch === "army"
        ? `${label}은 통상 분기(3개월)마다 1박 2일 외박을 운영해요.`
        : `${label}은 일반적으로 6주마다 2박 3일 외박을 운영해요.`,
    detail:
      branch === "army"
        ? // 육군의 "분기"가 달력 분기인지 전입일 기준 3개월인지는 공개 자료에
          // 나오지 않고 부대마다 다르다. 앱이 임의로 고르면 처음부터 어긋난 주기를
          // 계산하게 되므로 기준일은 반드시 사용자에게 묻는다.
          "공개 규정에는 분기를 어느 날부터 세는지가 나와 있지 않고 부대마다 달라요. 부대가 주기를 세기 시작한다고 안내한 실제 기준일을 입력하세요."
        : "공개 규정에는 전군 공통 첫 시작일이 명시되어 있지 않아요. 부대가 주기를 세기 시작한다고 안내한 실제 기준일을 입력하세요.",
    disclaimer:
      "외출·외박은 지휘관 승인 사항이며 근무형태와 부대 지침에 따라 달라질 수 있습니다.",
  };
}

/* -------------------------------------------------------------- 폼 헬퍼 */

/**
 * 폼이 들고 있는 주기 한 벌. 단위가 곧 입력칸의 라벨과 허용 범위를 정한다.
 *
 * 저장 계층은 컬럼 두 개(intervalDays·intervalMonths)로 나뉘어 있지만 화면에서는
 * 언제나 "숫자 하나 + 단위 하나"다. 그 변환을 화면마다 따로 쓰면 네 곳(웹·앱 ×
 * 온보딩·설정)이 서로 다른 규칙으로 갈라지므로 여기 한 벌만 둔다.
 */
export type RegularOvernightIntervalForm = {
  unit: "day" | "month";
  value: number;
};

/** 단위별 입력칸 라벨과 허용 범위. 서버 스키마와 같은 값이어야 한다. */
export const REGULAR_OVERNIGHT_INTERVAL_LIMITS = {
  day: { label: "주기 (일)", unitLabel: "일", min: 1, max: 365 },
  month: { label: "주기 (개월)", unitLabel: "개월", min: 1, max: 12 },
} as const;

/**
 * 폼의 초기 주기. 저장된 설정이 있으면 그 단위를 그대로 따르고, 없으면 군별
 * 통상 운영값을 깐다 — 군종을 바꾼 직후에는 config를 넘기지 않아야 새 군의
 * 기본값이 나온다.
 */
export function regularOvernightIntervalForm(
  branch: Branch,
  config?: {
    intervalDays?: number | null;
    intervalMonths?: number | null;
  } | null,
): RegularOvernightIntervalForm {
  const stored = regularOvernightInterval({
    enabled: true,
    startDate: null,
    intervalDays: config?.intervalDays ?? null,
    intervalMonths: config?.intervalMonths ?? null,
    daysPerGrant: null,
  });
  if (stored) return { unit: stored.unit, value: stored.value };

  const defaults = REGULAR_OVERNIGHT_DEFAULTS[branch];
  return defaults.intervalMonths
    ? { unit: "month", value: defaults.intervalMonths }
    : { unit: "day", value: defaults.intervalDays ?? 1 };
}

/** 주기 한 벌을 저장 요청의 두 필드로. 쓰지 않는 쪽은 반드시 null이다. */
export function regularOvernightIntervalPayload(
  form: RegularOvernightIntervalForm,
): { intervalDays: number | null; intervalMonths: number | null } {
  return form.unit === "month"
    ? { intervalDays: null, intervalMonths: form.value }
    : { intervalDays: form.value, intervalMonths: null };
}

/** 입력 중인 값이 서버 스키마의 범위 안인가. */
export function isRegularOvernightIntervalValid(
  form: RegularOvernightIntervalForm,
): boolean {
  const { min, max } = REGULAR_OVERNIGHT_INTERVAL_LIMITS[form.unit];
  return Number.isInteger(form.value) && form.value >= min && form.value <= max;
}

/**
 * 입력된 값으로 계산한 첫 적립일(= 1주기 첫날). 값이 덜 찼으면 null.
 * 달 단위 주기를 일수로 근사하지 않도록 실제 주기 계산을 그대로 쓴다.
 */
export function regularOvernightFirstGrantPreview(
  startDate: string,
  form: RegularOvernightIntervalForm,
): ISODate | null {
  if (!isValidISODate(startDate) || !isRegularOvernightIntervalValid(form)) {
    return null;
  }
  return cycleDateAfter(
    {
      enabled: true,
      startDate,
      daysPerGrant: 1,
      ...regularOvernightIntervalPayload(form),
    },
    1,
  );
}
