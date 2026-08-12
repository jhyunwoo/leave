import type { Branch } from "./rank";

export const REGULAR_OVERNIGHT_VERIFIED_AT = "2026-08-10";
export const REGULAR_OVERNIGHT_DEFAULTS = {
  intervalDays: 42,
  daysPerGrant: 3,
} as const;

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
    label: "국회예산정책처 군 복무여건 개선사업 평가",
    url: "https://www.nabo.go.kr/ko/report/analysisView.do?idx=8409&key=2509250001",
  },
] as const;

export function regularOvernightGuidance(branch: Branch) {
  if (branch === "army") return null;
  return {
    branch,
    summary: `${branch === "navy" ? "해군" : "공군"}은 일반적으로 6주마다 2박 3일 외박을 운영해요.`,
    detail:
      "공개 규정에는 전군 공통 첫 시작일이 명시되어 있지 않아요. 부대가 주기를 세기 시작한다고 안내한 실제 기준일을 입력하세요.",
    disclaimer:
      "외출·외박은 지휘관 승인 사항이며 근무형태와 부대 지침에 따라 달라질 수 있습니다.",
  } as const;
}
