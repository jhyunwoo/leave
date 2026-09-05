/**
 * 자동 제목과 사용자가 직접 지은 이름을 가르는 규칙.
 *
 * 네이티브 수정 시트는 이 판정으로 제목 입력을 어떻게 열지 정하고, 서버는 붙은 휴가를
 * 합친 뒤 자동 제목을 다시 지을 때 쓴다. 잘못 판정하면 사용자가 붙인 이름을
 * "연가 계획" 같은 자동 제목이 조용히 덮는다.
 */

import { describe, expect, it } from "vitest";
import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  isDerivedTitle,
  titleFromDrafts,
  titleFromSegments,
  type LeaveSegment,
  type SegmentDraft,
} from "../src/index";

/** 첫 구간만 제목을 정하므로 개수는 아무 값이나 좋다. */
function draft(key: SegmentDraft["key"]): SegmentDraft {
  return { key, days: 3 };
}

function segment(
  category: LeaveSegment["category"],
  overnightKind?: LeaveSegment["overnightKind"],
): LeaveSegment {
  return {
    category,
    overnightKind,
    startDate: "2026-08-18",
    endDate: "2026-08-20",
    days: 3,
  };
}

describe("titleFromDrafts / isDerivedTitle", () => {
  it("모든 재원의 자동 제목을 자동으로 판정한다", () => {
    for (const key of BALANCE_KEYS) {
      const title = titleFromDrafts([draft(key)]);
      expect(title).toBe(`${BALANCE_LABELS[key]} 계획`);
      expect(isDerivedTitle(title)).toBe(true);
    }
  });

  it("구간이 없을 때의 기본 제목도 자동으로 본다", () => {
    expect(titleFromDrafts([])).toBe("휴가 계획");
    expect(isDerivedTitle("휴가 계획")).toBe(true);
  });

  it("사용자가 직접 지은 이름은 자동으로 보지 않는다", () => {
    expect(isDerivedTitle("제주도 가족여행")).toBe(false);
    // 자동 제목을 조금이라도 고쳤으면 그 사람 이름이다.
    expect(isDerivedTitle("연가 계획 (부모님)")).toBe(false);
    expect(isDerivedTitle("연가")).toBe(false);
  });

  it("빈 제목은 자동으로 지은 제목이 아니다", () => {
    // 서버 스키마가 빈 제목을 막아 실제로는 오지 않는다. 판정은 문자열만 본다.
    expect(isDerivedTitle("")).toBe(false);
  });
});

describe("titleFromSegments", () => {
  it("첫 구간의 재원으로 제목을 짓는다 — drafts 판본과 같은 결과다", () => {
    expect(titleFromSegments([segment("annual")])).toBe("연가 계획");
    expect(titleFromSegments([segment("overnight", "regular")])).toBe(
      "정기외박 계획",
    );
    expect(titleFromSegments([segment("overnight", "other")])).toBe(
      "기타 외박 계획",
    );
  });

  it("첫 구간만 본다 — 뒤에 다른 재원이 붙어도 제목은 그대로다", () => {
    expect(
      titleFromSegments([segment("annual"), segment("overnight", "regular")]),
    ).toBe("연가 계획");
  });

  it("구간이 없으면 기본 제목이다", () => {
    expect(titleFromSegments([])).toBe("휴가 계획");
  });
});
