import { describe, expect, it } from "vitest";
import {
  countdownDischargeDates,
  friendMilestoneNotificationText,
  milestoneKey,
  milestoneCelebration,
  milestoneLabel,
  milestoneNotificationText,
  milestoneParams,
  milestonesOn,
  parseMilestoneParams,
} from "../src";

const base = {
  enlistedAt: "2026-01-05",
  dischargeAt: "2027-07-04",
  signupRank: "private" as const,
};

describe("milestonesOn — 전역 D-n", () => {
  it("D-100과 하루 전을 잡는다", () => {
    expect(milestonesOn({ ...base, on: "2027-03-26" })).toEqual([
      { kind: "discharge_countdown", days: 100 },
    ]);
    expect(milestonesOn({ ...base, on: "2027-07-03" })).toEqual([
      { kind: "discharge_countdown", days: 1 },
    ]);
  });

  it("목록에 없는 날과 전역일 당일은 비어 있다", () => {
    expect(milestonesOn({ ...base, on: "2027-03-25" })).toEqual([]);
    expect(milestonesOn({ ...base, on: "2027-03-27" })).toEqual([]);
    expect(milestonesOn({ ...base, on: "2027-07-04" })).toEqual([]);
    expect(milestonesOn({ ...base, on: "2027-07-02" })).toEqual([]);
  });

  it("남은 일수는 getRankInfo와 같은 기준으로 센다(오늘 제외)", () => {
    // 2027-07-04 - 600일 = 2025-11-11
    expect(
      milestonesOn({
        enlistedAt: "2025-10-01",
        dischargeAt: "2027-07-04",
        signupRank: "private",
        on: "2025-11-11",
      }),
    ).toEqual([{ kind: "discharge_countdown", days: 600 }]);
  });

  it("countdownDischargeDates는 오늘 D-n인 사람의 전역일을 준다", () => {
    const dates = countdownDischargeDates("2027-03-26");
    expect(dates).toContain("2027-07-04");
    expect(dates).toHaveLength(9);
    expect(dates.at(-1)).toBe("2027-03-27");
  });
});

describe("milestonesOn — 진급", () => {
  it("표준 진급일(매월 1일)에 새 계급을 잡는다", () => {
    expect(milestonesOn({ ...base, on: "2026-04-01" })).toEqual([
      { kind: "promotion", rank: "private_first" },
    ]);
    expect(milestonesOn({ ...base, on: "2026-10-01" })).toEqual([
      { kind: "promotion", rank: "corporal" },
    ]);
    expect(milestonesOn({ ...base, on: "2027-04-01" })).toEqual([
      { kind: "promotion", rank: "sergeant" },
    ]);
  });

  it("진급일 전날과 다음 날은 비어 있다", () => {
    expect(milestonesOn({ ...base, on: "2026-03-31" })).toEqual([]);
    expect(milestonesOn({ ...base, on: "2026-04-02" })).toEqual([]);
  });

  it("최저복무기간이 1일에 끝나면 그날이 진급일이다", () => {
    expect(
      milestonesOn({
        enlistedAt: "2026-01-01",
        dischargeAt: "2027-06-30",
        signupRank: "private",
        on: "2026-03-01",
      }),
    ).toEqual([{ kind: "promotion", rank: "private_first" }]);
  });

  it("가입 때 더 높은 계급을 적었으면 표준 진급일에 축하하지 않는다", () => {
    expect(
      milestonesOn({ ...base, signupRank: "corporal", on: "2026-04-01" }),
    ).toEqual([]);
    expect(
      milestonesOn({ ...base, signupRank: "corporal", on: "2026-10-01" }),
    ).toEqual([]);
    // 하한보다 높은 다음 진급은 그대로 축하한다.
    expect(
      milestonesOn({ ...base, signupRank: "corporal", on: "2027-04-01" }),
    ).toEqual([{ kind: "promotion", rank: "sergeant" }]);
  });

  it("D-n과 진급이 같은 날이면 둘 다 준다", () => {
    // 2027-04-01은 병장 진급일이고, 전역일을 D-100에 맞춘다.
    expect(
      milestonesOn({ ...base, dischargeAt: "2027-07-10", on: "2027-04-01" }),
    ).toEqual([
      { kind: "discharge_countdown", days: 100 },
      { kind: "promotion", rank: "sergeant" },
    ]);
  });
});

describe("문구", () => {
  it("키는 종류와 값으로 만든다", () => {
    expect(milestoneKey({ kind: "discharge_countdown", days: 50 })).toBe(
      "discharge_countdown:50",
    );
    expect(milestoneKey({ kind: "promotion", rank: "corporal" })).toBe(
      "promotion:corporal",
    );
  });

  it("하루 전은 D-1이 아니라 말로 쓴다", () => {
    expect(milestoneLabel({ kind: "discharge_countdown", days: 1 })).toBe(
      "전역 하루 전",
    );
    expect(milestoneLabel({ kind: "discharge_countdown", days: 10 })).toBe(
      "전역 D-10",
    );
    expect(milestoneLabel({ kind: "promotion", rank: "sergeant" })).toBe(
      "병장 진급",
    );
  });

  it("본인·친구 알림 문구", () => {
    expect(
      milestoneNotificationText({ kind: "promotion", rank: "corporal" }).title,
    ).toBe("상병 진급을 축하해요");
    expect(
      friendMilestoneNotificationText(
        { kind: "discharge_countdown", days: 100 },
        "김리브",
      ).body,
    ).toBe("김리브님이 전역까지 100일 남았어요. 축하해주세요!");
  });
});

describe("축하 화면 주소", () => {
  it("주소 값으로 기념일을 되읽는다", () => {
    expect(
      parseMilestoneParams(
        milestoneParams({ kind: "discharge_countdown", days: 100 }),
      ),
    ).toEqual({ kind: "discharge_countdown", days: 100 });
    expect(
      parseMilestoneParams({ kind: "promotion", rank: "sergeant" }),
    ).toEqual({ kind: "promotion", rank: "sergeant" });
  });

  it("목록에 없는 값은 버린다", () => {
    expect(
      parseMilestoneParams({ kind: "discharge_countdown", days: "99" }),
    ).toBeNull();
    expect(parseMilestoneParams({ kind: "promotion", rank: "private" })).toBe(
      null,
    );
    expect(parseMilestoneParams({ kind: "birthday" })).toBeNull();
  });

  it("축하 문구는 D-n이면 숫자, 하루 전이면 D-1, 진급이면 계급을 크게 쓴다", () => {
    expect(
      milestoneCelebration({ kind: "discharge_countdown", days: 100 }).hero,
    ).toBe("100");
    expect(
      milestoneCelebration({ kind: "discharge_countdown", days: 1 }).hero,
    ).toBe("D-1");
    expect(
      milestoneCelebration({ kind: "promotion", rank: "corporal" }),
    ).toMatchObject({
      hero: "상병",
      headline: "상병 진급을 축하해요",
    });
  });
});
