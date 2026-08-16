/**
 * 휴가 제목 — 자동으로 지은 제목과 사용자가 직접 붙인 이름을 가른다.
 *
 * 사용처: 네이티브 등록·수정 시트(제목 입력을 어떻게 열지), 서버의 휴가 병합(합친 뒤
 * 자동 제목을 다시 지을 때).
 *
 * 두 쓰임이 같은 규칙을 봐야 한다. 화면이 "연가 계획"을 자동으로 보고 서버가 사람이
 * 지은 이름으로 보면, 병합이 사용자가 붙인 이름을 덮거나 반대로 낡은 자동 제목을
 * 영영 남긴다.
 */

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  segmentBalanceKey,
  type LeaveSegment,
} from "./leave";
import type { SegmentDraft } from "./leave-draft";

/** 제목을 정하는 건 언제나 첫 구간이다 — 그날 나가는 이유가 그 휴가의 이름이다. */
function derive(label: string | undefined): string {
  return label ? `${label} 계획` : "휴가 계획";
}

/** 네이티브처럼 제목 입력을 두지 않는 화면이 쓰는 기본 제목 생성기. */
export function titleFromDrafts(drafts: readonly SegmentDraft[]): string {
  const first = drafts[0];
  return derive(first && BALANCE_LABELS[first.key]);
}

/** 저장된 구간에서 같은 규칙으로 제목을 짓는다. 서버의 병합이 쓴다. */
export function titleFromSegments(
  segments: readonly Pick<LeaveSegment, "category" | "overnightKind">[],
): string {
  const first = segments[0];
  return derive(first && BALANCE_LABELS[segmentBalanceKey(first)]);
}

/**
 * 자동으로 지어진 제목인지 판별한다.
 *
 * 자동 제목과 사용자가 직접 붙인 이름을 갈라야, 종류를 바꿨을 때 자동 제목만
 * 따라 바뀌고 손으로 지은 이름은 그대로 남는다.
 */
export function isDerivedTitle(title: string): boolean {
  const trimmed = title.trim();
  return (
    trimmed === "휴가 계획" ||
    BALANCE_KEYS.some((key) => trimmed === `${BALANCE_LABELS[key]} 계획`)
  );
}
