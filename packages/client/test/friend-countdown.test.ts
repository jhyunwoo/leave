/**
 * 친구 카드의 전역·다음 휴가 D-day.
 *
 * 비공개·없음·당일·진행 중을 서로 다른 말로 가르는지가 핵심이다 — 웹과 네이티브가
 * 같은 표기를 쓴다.
 */

import { describe, expect, it } from "vitest";
import {
  friendDischargeDday,
  friendNextLeaveDday,
} from "../src/friend-countdown";

const today = "2026-09-26";

describe("friendDischargeDday", () => {
  it("전역일까지 남은 날을 센다", () => {
    expect(
      friendDischargeDday({ dischargeAt: "2027-01-03" }, today),
    ).toMatchObject({ label: "전역", value: "D-99", muted: false });
  });

  it("전역 당일은 D-DAY다", () => {
    expect(friendDischargeDday({ dischargeAt: today }, today)).toMatchObject({
      value: "D-DAY",
      spoken: "오늘 전역해요",
    });
  });

  it("공유하지 않았거나 이미 전역했으면 숫자 대신 상태를 말한다", () => {
    expect(friendDischargeDday({ dischargeAt: null }, today)).toMatchObject({
      value: "비공개",
      muted: true,
    });
    expect(
      friendDischargeDday({ dischargeAt: "2026-09-25" }, today),
    ).toMatchObject({ value: "완료", muted: true });
  });
});

describe("friendNextLeaveDday", () => {
  const shared = { leaveScheduleShared: true } as const;

  it("다가오는 휴가는 시작일까지 센다", () => {
    expect(
      friendNextLeaveDday(
        {
          ...shared,
          nextLeave: { startDate: "2026-10-01", endDate: "2026-10-03" },
        },
        today,
      ),
    ).toMatchObject({ label: "다음 휴가", value: "D-5", muted: false });
  });

  it("이미 나가 있으면 복귀일까지 센다", () => {
    expect(
      friendNextLeaveDday(
        {
          ...shared,
          nextLeave: { startDate: "2026-09-25", endDate: "2026-09-28" },
        },
        today,
      ),
    ).toMatchObject({ label: "휴가 중", value: "복귀 D-2" });
    expect(
      friendNextLeaveDday(
        { ...shared, nextLeave: { startDate: today, endDate: today } },
        today,
      ),
    ).toMatchObject({ label: "휴가 중", value: "복귀 D-DAY" });
  });

  it("비공개와 잡힌 휴가 없음을 구분한다", () => {
    expect(
      friendNextLeaveDday(
        { leaveScheduleShared: false, nextLeave: null },
        today,
      ),
    ).toMatchObject({ value: "비공개", muted: true });
    expect(
      friendNextLeaveDday({ ...shared, nextLeave: null }, today),
    ).toMatchObject({ value: "없음", muted: true });
  });
});
