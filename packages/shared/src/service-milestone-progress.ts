import { addMonthsClamped, diffDays, type ISODate } from "./dates";
import { isDischargedOn, standardPromotionDate, type Rank } from "./rank";

export interface ServiceMilestoneProgress {
  kind: "promotion" | "pay-step";
  label: string;
  daysLeft: number | null;
  progress: number;
  /** 진행률 구간. 화면이 KST 자정 기준으로 실시간 값을 다시 그릴 때 쓴다. */
  startDate: ISODate;
  endDate: ISODate | null;
}

/** 호봉은 매월 1일 갱신하며, 진급 진행률은 현재 계급의 표준 진급일부터 센다. */
export function serviceMilestoneProgress(params: {
  enlistedAt: ISODate;
  dischargeAt: ISODate;
  rank: Rank;
  nextPromotionDate: ISODate | null;
  on: ISODate;
}): ServiceMilestoneProgress[] {
  const { enlistedAt, dischargeAt, rank, nextPromotionDate, on } = params;
  if (on < enlistedAt || isDischargedOn(dischargeAt, on)) return [];

  function milestone(
    kind: ServiceMilestoneProgress["kind"],
    label: string,
    start: ISODate,
    end: ISODate | null,
  ): ServiceMilestoneProgress {
    const upcoming = end !== null && end >= on && end < dischargeAt;
    return {
      kind,
      label,
      daysLeft: upcoming ? diffDays(on, end) : null,
      progress: upcoming
        ? Math.min(
            Math.max(
              diffDays(start, on) / Math.max(diffDays(start, end), 1),
              0,
            ),
            1,
          )
        : 0,
      startDate: start,
      endDate: end,
    };
  }

  const monthStart = `${on.slice(0, 7)}-01`;
  return [
    milestone(
      "promotion",
      "다음 진급",
      standardPromotionDate(enlistedAt, rank),
      nextPromotionDate,
    ),
    milestone(
      "pay-step",
      "다음 호봉",
      monthStart < enlistedAt ? enlistedAt : monthStart,
      addMonthsClamped(monthStart, 1),
    ),
  ];
}
