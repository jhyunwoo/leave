/**
 * 휴가 등록 폼이 다루는 "구간 초안" 모델.
 *
 * 사용자가 고르는 것은 **휴가 시작일 하나와 종류별 개수**다("연가 4개, 정기외박 4개").
 * 각 구간의 시작·종료일과 휴가 전체 종료일은 전부 여기서 파생한다. 날짜를 상태로
 * 들지 않기 때문에 어떤 조작을 해도 구간이 겹치거나 사이에 빈 날이 생길 수 없고,
 * 순서를 바꾸는 것도 배열을 재배치하는 것으로 끝난다.
 *
 * 예전에는 구간마다 종료일을 들고 시작일을 앞 구간에서 파생했다. 그 모델에서는
 * "연가 몇 개"를 표현할 자리가 없었고, 마지막 구간의 종료일을 휴가 종료일에
 * 묶어 두느라 편집 규칙이 구간 위치마다 달랐다.
 *
 * 앱·웹·관리자 세 폼이 같은 규칙을 쓰도록 순수 함수로 분리했다.
 * 구간 수·총 기간 상한(`leaveCreateSchema`)은 여기서 강제하지 않는다 —
 * 저장 가능 여부는 폼이 한곳에서 판정한다(`useLeaveForm`의 submitBlocker).
 */

import { addDays, type ISODate } from "./dates";
import {
  inclusiveDays,
  type BalanceKey,
  type LeaveCategory,
  type OutingKind,
  type OvernightKind,
} from "./leave";

export type SegmentDraft = {
  key: BalanceKey;
  /** 이 종류를 며칠 쓰는가. 1 이상의 정수. 날짜는 여기서 파생된다. */
  days: number;
  regularOvernightCycleStart?: ISODate | null;
};

export type ResolvedDraft = SegmentDraft & {
  startDate: ISODate;
  endDate: ISODate;
};

export function balanceKeyToCategory(key: BalanceKey): {
  category: LeaveCategory;
  overnightKind?: OvernightKind;
  outingKind?: OutingKind;
} {
  if (key === "regular_overnight") {
    return { category: "overnight", overnightKind: "regular" };
  }
  if (key === "other_overnight") {
    return { category: "overnight", overnightKind: "other" };
  }
  // 외출은 갈래를 반드시 실어 보낸다. 비워 두면 서버가 평일로 읽어(segmentBalanceKey)
  // 주말 외출을 골랐는데 평일 몫이 깎이는 조합이 난다.
  if (key === "outing") return { category: "outing", outingKind: "weekday" };
  if (key === "weekend_outing") {
    return { category: "outing", outingKind: "weekend" };
  }
  return { category: key };
}

/** 개수를 1 이상의 정수로 자른다. 스테퍼·직접 입력 어느 쪽에서 와도 여기를 지난다. */
function normalizeDays(days: number): number {
  if (!Number.isFinite(days)) return 1;
  return Math.max(1, Math.floor(days));
}

/** 휴가 전체 일수 = 구간 개수의 합. */
export function totalDraftDays(drafts: readonly SegmentDraft[]): number {
  return drafts.reduce((sum, draft) => sum + normalizeDays(draft.days), 0);
}

/** 휴가 전체 종료일. 시작일(빈 문자열이면 아직 안 고른 것)이나 구간이 없으면 빈 문자열. */
export function draftsEndDate(
  rangeStart: ISODate,
  drafts: readonly SegmentDraft[],
): ISODate {
  const total = totalDraftDays(drafts);
  if (!rangeStart || total < 1) return "";
  return addDays(rangeStart, total - 1);
}

/** 초안에 실제 시작·종료일을 채운다. 화면은 이걸 그린다. */
export function resolveDrafts(
  rangeStart: ISODate,
  drafts: readonly SegmentDraft[],
): ResolvedDraft[] {
  if (!rangeStart) return [];
  const resolved: ResolvedDraft[] = [];
  let cursor: ISODate = rangeStart;
  for (const draft of drafts) {
    const days = normalizeDays(draft.days);
    const endDate = addDays(cursor, days - 1);
    resolved.push({ ...draft, days, startDate: cursor, endDate });
    cursor = addDays(endDate, 1);
  }
  return resolved;
}

/**
 * 총 일수를 목표에 맞춘다. 달력에서 종료일을 직접 골랐을 때 쓴다 —
 * 개수와 달력이 서로를 밀 수 있어야 "8/9까지"와 "8개"가 같은 말이 된다.
 *
 * 앞 구간부터 남은 몫을 나눠 주고, 목표를 다 쓰면 뒤 구간은 버린다.
 * 마지막까지 남는 몫은 마지막 구간이 흡수한다.
 */
export function fitDraftsToTotal(
  drafts: readonly SegmentDraft[],
  totalDays: number,
  fallbackKey: BalanceKey = "annual",
): SegmentDraft[] {
  const target = Math.floor(totalDays);
  if (!Number.isFinite(target) || target < 1) return [];
  if (!drafts.length) return [{ key: fallbackKey, days: target }];

  const fitted: SegmentDraft[] = [];
  let remaining = target;
  for (const draft of drafts) {
    if (remaining < 1) break;
    // 뒤 구간이 최소 하루씩은 가져갈 수 있게 남겨 둔다.
    const days = Math.min(normalizeDays(draft.days), remaining);
    fitted.push({ ...draft, days });
    remaining -= days;
  }

  if (!fitted.length) return [{ key: fallbackKey, days: target }];
  if (remaining > 0) {
    const last = fitted[fitted.length - 1]!;
    fitted[fitted.length - 1] = { ...last, days: last.days + remaining };
  }
  return fitted;
}

/** 구간 하나의 개수를 바꾼다. 뒤 구간은 날짜만 밀리고 개수는 그대로다. */
export function setDraftDays(
  drafts: readonly SegmentDraft[],
  index: number,
  days: number,
): SegmentDraft[] {
  if (index < 0 || index >= drafts.length) return [...drafts];
  return drafts.map((draft, i) =>
    i === index ? { ...draft, days: normalizeDays(days) } : draft,
  );
}

/** 종류를 하나 더 이어 쓴다. 총 기간이 그만큼 늘어난다. */
export function appendDraft(
  drafts: readonly SegmentDraft[],
  key: BalanceKey,
  days = 1,
): SegmentDraft[] {
  return [...drafts, { key, days: normalizeDays(days) }];
}

/** 구간 하나를 지운다. 마지막 하나는 남긴다 — 종류 없는 휴가는 저장할 수 없다. */
export function removeDraft(
  drafts: readonly SegmentDraft[],
  index: number,
): SegmentDraft[] {
  if (drafts.length <= 1 || index < 0 || index >= drafts.length) {
    return [...drafts];
  }
  return drafts.filter((_, i) => i !== index);
}

/** 구간 순서를 바꾼다(꾹 눌러 드래그). 개수는 그대로고 날짜만 다시 배치된다. */
export function reorderDrafts(
  drafts: readonly SegmentDraft[],
  from: number,
  to: number,
): SegmentDraft[] {
  if (
    from === to ||
    from < 0 ||
    to < 0 ||
    from >= drafts.length ||
    to >= drafts.length
  ) {
    return [...drafts];
  }
  const next = [...drafts];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
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
    ...(draft.key === "regular_overnight" && draft.regularOvernightCycleStart
      ? { regularOvernightCycleStart: draft.regularOvernightCycleStart }
      : {}),
  }));
}

/** 저장된 휴가를 폼 초안으로 되돌린다. 시작일 순서가 곧 구간 순서다. */
export function segmentsToDrafts(
  segments: readonly {
    startDate: ISODate;
    endDate: ISODate;
    category: string;
    overnightKind?: string | null;
  }[],
): SegmentDraft[] {
  return [...segments]
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .map((segment) => ({
      key: (segment.category !== "overnight"
        ? segment.category
        : segment.overnightKind === "regular"
          ? "regular_overnight"
          : "other_overnight") as BalanceKey,
      days: inclusiveDays(segment.startDate, segment.endDate),
      ...(segment.overnightKind === "regular" &&
      "regularOvernightCycleStart" in segment
        ? {
            regularOvernightCycleStart:
              (segment as { regularOvernightCycleStart?: ISODate | null })
                .regularOvernightCycleStart ?? null,
          }
        : {}),
    }));
}

/** 재원별 사용 일수 합계. 잔여량 표시에 쓴다. */
export function draftDaysByKey(
  drafts: readonly SegmentDraft[],
): Map<BalanceKey, number> {
  const result = new Map<BalanceKey, number>();
  for (const draft of drafts) {
    const days = normalizeDays(draft.days);
    result.set(draft.key, (result.get(draft.key) ?? 0) + days);
  }
  return result;
}
