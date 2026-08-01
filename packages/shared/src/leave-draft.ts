/**
 * 휴가 등록 폼이 다루는 "구간 초안" 모델.
 *
 * 폼에서는 구간들이 항상 휴가 기간을 빈틈없이 이어 덮어야 하므로,
 * 각 구간의 시작일은 앞 구간의 다음 날로 파생시키고 사용자는 재원과 종료일만 고른다.
 * 이렇게 하면 어떤 조작을 해도 항상 유효한 상태가 유지된다.
 *
 * 앱·웹·관리자 세 폼이 같은 규칙을 쓰도록 순수 함수로 분리했다.
 */

import { addDays, type ISODate } from "./dates";
import {
  inclusiveDays,
  type BalanceKey,
  type LeaveCategory,
  type OvernightKind,
} from "./leave";

export type SegmentDraft = {
  key: BalanceKey;
  /** 이 구간의 마지막 날. 시작일은 앞 구간에서 파생된다. */
  endDate: ISODate;
};

export type ResolvedDraft = SegmentDraft & {
  startDate: ISODate;
  days: number;
};

export function balanceKeyToCategory(key: BalanceKey): {
  category: LeaveCategory;
  overnightKind?: OvernightKind;
} {
  if (key === "regular_overnight") {
    return { category: "overnight", overnightKind: "regular" };
  }
  if (key === "other_overnight") {
    return { category: "overnight", overnightKind: "other" };
  }
  return { category: key };
}

/** 초안에 시작일과 일수를 채운다. */
export function resolveDrafts(
  rangeStart: ISODate,
  drafts: readonly SegmentDraft[],
): ResolvedDraft[] {
  const resolved: ResolvedDraft[] = [];
  let cursor = rangeStart;
  for (const draft of drafts) {
    resolved.push({
      ...draft,
      startDate: cursor,
      days: inclusiveDays(cursor, draft.endDate),
    });
    cursor = addDays(draft.endDate, 1);
  }
  return resolved;
}

/**
 * 기간이 바뀌거나 구간이 지워진 뒤에도 "빈틈 없이 전체를 덮는" 상태로 되돌린다.
 * 범위를 벗어난 구간은 버리고, 마지막 구간은 항상 종료일까지 늘린다.
 */
export function fitDrafts(
  drafts: readonly SegmentDraft[],
  rangeStart: ISODate,
  rangeEnd: ISODate,
  fallbackKey: BalanceKey = "annual",
): SegmentDraft[] {
  if (!rangeStart || !rangeEnd || rangeStart > rangeEnd) return [];

  const fitted: SegmentDraft[] = [];
  let cursor = rangeStart;
  for (const draft of drafts) {
    if (cursor > rangeEnd) break;
    const end = draft.endDate < cursor ? cursor : draft.endDate;
    fitted.push({ key: draft.key, endDate: end > rangeEnd ? rangeEnd : end });
    cursor = addDays(fitted[fitted.length - 1]!.endDate, 1);
  }

  if (!fitted.length) return [{ key: fallbackKey, endDate: rangeEnd }];
  // 마지막 구간은 남은 날을 모두 가져간다.
  fitted[fitted.length - 1] = {
    ...fitted[fitted.length - 1]!,
    endDate: rangeEnd,
  };
  return fitted;
}

/** 마지막 구간을 절반으로 나눠 새 구간을 만든다. 하루짜리라 못 나누면 null. */
export function splitLastDraft(
  drafts: readonly SegmentDraft[],
  rangeStart: ISODate,
  rangeEnd: ISODate,
  newKey: BalanceKey,
): SegmentDraft[] | null {
  const resolved = resolveDrafts(rangeStart, drafts);
  const last = resolved[resolved.length - 1];
  if (!last || last.days < 2) return null;

  const firstHalf = Math.ceil(last.days / 2);
  return [
    ...drafts.slice(0, -1),
    { key: last.key, endDate: addDays(last.startDate, firstHalf - 1) },
    { key: newKey, endDate: rangeEnd },
  ];
}

/** 구간 하나를 지운다. 남은 구간이 전체를 덮도록 다시 맞춘다. */
export function removeDraft(
  drafts: readonly SegmentDraft[],
  index: number,
  rangeStart: ISODate,
  rangeEnd: ISODate,
): SegmentDraft[] {
  if (drafts.length <= 1) return [...drafts];
  return fitDrafts(
    drafts.filter((_, i) => i !== index),
    rangeStart,
    rangeEnd,
  );
}

/**
 * 구간의 종료일을 바꾼다. 뒤 구간들의 시작일이 밀리므로 다시 맞춘다.
 * 마지막 구간의 종료일은 휴가 종료일에 고정이라 바꿀 수 없다.
 */
export function setDraftEnd(
  drafts: readonly SegmentDraft[],
  index: number,
  endDate: ISODate,
  rangeStart: ISODate,
  rangeEnd: ISODate,
): SegmentDraft[] {
  if (index === drafts.length - 1) return [...drafts];
  return fitDrafts(
    drafts.map((draft, i) => (i === index ? { ...draft, endDate } : draft)),
    rangeStart,
    rangeEnd,
  );
}

/** 서버로 보낼 구간 배열. */
export function draftsToSegments(
  rangeStart: ISODate,
  drafts: readonly SegmentDraft[],
) {
  return resolveDrafts(rangeStart, drafts).map((draft) => ({
    ...balanceKeyToCategory(draft.key),
    startDate: draft.startDate,
    endDate: draft.endDate,
  }));
}

/** 저장된 휴가를 폼 초안으로 되돌린다. */
export function segmentsToDrafts(
  segments: readonly {
    endDate: ISODate;
    category: string;
    overnightKind?: string | null;
  }[],
): SegmentDraft[] {
  return [...segments]
    .sort((a, b) => a.endDate.localeCompare(b.endDate))
    .map((segment) => ({
      key: (segment.category !== "overnight"
        ? segment.category
        : segment.overnightKind === "regular"
          ? "regular_overnight"
          : "other_overnight") as BalanceKey,
      endDate: segment.endDate,
    }));
}

/** 재원별 사용 일수 합계. 잔여량 표시에 쓴다. */
export function draftDaysByKey(
  rangeStart: ISODate,
  drafts: readonly SegmentDraft[],
): Map<BalanceKey, number> {
  const result = new Map<BalanceKey, number>();
  for (const draft of resolveDrafts(rangeStart, drafts)) {
    result.set(draft.key, (result.get(draft.key) ?? 0) + draft.days);
  }
  return result;
}
