/**
 * 자동 제목과 사용자가 직접 지은 이름을 가르는 규칙.
 *
 * 네이티브 수정 시트는 이 판정으로 제목 입력을 어떻게 열지 정한다. 자동 제목이면
 * 휴가 종류를 바꿀 때 제목이 따라 바뀌고, 직접 지은 이름이면 그대로 둔다.
 * 잘못 판정하면 사용자가 붙인 이름을 "연가 계획" 같은 자동 제목이 조용히 덮는다.
 */

import { BALANCE_KEYS, BALANCE_LABELS, type SegmentDraft } from "@leave/shared";
import { describe, expect, it } from "vitest";
import { isDerivedTitle, titleFromDrafts } from "../src/forms/use-leave-form";

/** 첫 구간만 제목을 정하므로 종료일은 아무 날이나 좋다. */
function draft(key: SegmentDraft["key"]): SegmentDraft {
  return { key, endDate: "2026-08-20" };
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
