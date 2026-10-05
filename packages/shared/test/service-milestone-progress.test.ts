import { describe, expect, it } from "vitest";
import { serviceMilestoneProgress } from "../src/service-milestone-progress";

const profile = {
  enlistedAt: "2026-01-15",
  dischargeAt: "2027-07-14",
  rank: "private_first" as const,
  nextPromotionDate: "2026-10-01",
  on: "2026-07-01",
};

describe("serviceMilestoneProgress", () => {
  it("현재 계급 기간과 이번 달을 기준으로 각각 진행률을 계산한다", () => {
    const [promotion, payStep] = serviceMilestoneProgress(profile);
    expect(promotion).toMatchObject({ daysLeft: 92, progress: 91 / 183 });
    expect(payStep).toMatchObject({ daysLeft: 31, progress: 0 });
  });

  it("입대 첫 달은 입대일부터 세고, 윤년과 연말을 처리한다", () => {
    expect(
      serviceMilestoneProgress({
        ...profile,
        rank: "private",
        on: "2026-01-23",
      })[1],
    ).toMatchObject({ daysLeft: 9, progress: 8 / 17 });
    expect(
      serviceMilestoneProgress({
        ...profile,
        enlistedAt: "2023-01-01",
        dischargeAt: "2025-01-01",
        on: "2024-02-29",
      })[1],
    ).toMatchObject({ daysLeft: 1, progress: 28 / 29 });
    expect(
      serviceMilestoneProgress({ ...profile, on: "2026-12-31" })[1],
    ).toMatchObject({ daysLeft: 1, progress: 30 / 31 });
  });

  it("진급 당일 D-Day를 지원하고 새 계급의 진행률은 0부터 시작한다", () => {
    expect(
      serviceMilestoneProgress({ ...profile, on: "2026-10-01" })[0],
    ).toMatchObject({ daysLeft: 0, progress: 1 });
    expect(
      serviceMilestoneProgress({
        ...profile,
        rank: "corporal",
        on: "2026-10-01",
        nextPromotionDate: "2027-04-01",
      })[0],
    ).toMatchObject({ daysLeft: 182, progress: 0 });
  });

  it("조기 진급으로 표준 진급일보다 앞서 있어도 음수 진행률을 표시하지 않는다", () => {
    expect(
      serviceMilestoneProgress({
        ...profile,
        rank: "corporal",
        nextPromotionDate: "2027-04-01",
      })[0]?.progress,
    ).toBe(0);
  });

  it("최종 계급이나 전역일 이후 일정은 예정 없음으로 처리한다", () => {
    expect(
      serviceMilestoneProgress({
        ...profile,
        rank: "sergeant",
        nextPromotionDate: null,
      })[0]?.daysLeft,
    ).toBeNull();
    expect(
      serviceMilestoneProgress({ ...profile, dischargeAt: "2026-08-01" }).map(
        (item) => item.daysLeft,
      ),
    ).toEqual([null, null]);
  });

  it("입대 전과 전역 당일부터는 일정을 표시하지 않는다", () => {
    for (const on of ["2026-01-14", "2027-07-14", "2027-08-01"]) {
      expect(serviceMilestoneProgress({ ...profile, on })).toEqual([]);
    }
  });
});
