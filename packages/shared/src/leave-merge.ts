/**
 * 붙어 있는 내 휴가를 한 건으로 합치는 규칙.
 *
 * 사용처: 서버의 휴가 등록·수정(`apps/api/src/lib/leave-merge.ts`).
 *
 * 2/3~2/5 휴가를 만든 뒤 2/6~2/9 휴가를 따로 만들면 실제로는 2/3부터 9일까지 한 번
 * 나갔다 오는 일정이다. 휴가 한 건은 이미 여러 구간을 가질 수 있으므로, 합치는 일은
 * 새 모델을 만드는 게 아니라 구간을 이어 붙이는 일이다.
 *
 * 지켜야 하는 것 두 가지:
 *  - **재원이 다른 구간은 절대 합치지 않는다.** 잔여 차감은 휴가가 아니라 구간 단위로
 *    움직이므로, 연가 3일 + 정기외박 4일을 한 구간으로 뭉개면 재원별 사용량이 틀어진다.
 *  - **사람이 붙인 이름을 자동 제목이 덮지 않는다.**
 *
 * 상태(status)가 같은 휴가끼리만 본다. 초안은 나만 보는 시뮬레이션이라 확정과 합쳐지면
 * 조용히 공개되거나 반대로 확정이 초안으로 내려간다.
 */

import { addDays, rangesOverlap, type ISODate } from "./dates";
import {
  inclusiveDays,
  MAX_LEAVE_SEGMENTS,
  segmentBalanceKey,
  segmentsRange,
  sortSegments,
  type LeaveSegment,
  type LeaveStatus,
} from "./leave";
import { isDerivedTitle, titleFromSegments } from "./leave-title";

export const MAX_LEAVE_REASON = 500;

/** 병합 판정에 필요한 만큼의 휴가 한 건. 서버가 DB 행에서 만들어 넘긴다. */
export type MergeCandidate = {
  id: string;
  title: string;
  reason: string | null;
  status: LeaveStatus;
  createdAt: string;
  segments: LeaveSegment[];
};

export type LeaveMergePlan =
  /** 같은 상태의 휴가와 기간이 겹친다. 서버가 400으로 돌려준다. */
  | { kind: "conflict"; conflictWith: MergeCandidate; overlapStart: ISODate }
  /** 합칠 이웃이 없다. 지금까지처럼 저장하면 된다. */
  | { kind: "alone" }
  | {
      kind: "merged";
      /** 살아남는 행의 id. incoming일 수도, 이웃일 수도 있다. */
      hostId: string;
      createdAt: string;
      title: string;
      reason: string | null;
      segments: LeaveSegment[];
      /** 사라질 휴가 id들. hostId는 들어 있지 않다. */
      absorbedIds: string[];
    };

function rangeOf(candidate: MergeCandidate) {
  // 구간이 하나도 없는 휴가는 저장될 수 없다(스키마가 min(1)).
  return segmentsRange(candidate.segments)!;
}

function byStart(a: MergeCandidate, b: MergeCandidate): number {
  return rangeOf(a).startDate.localeCompare(rangeOf(b).startDate);
}

/**
 * 모아 놓은 구간을 하나의 휴가가 될 수 있는 형태로 잇는다.
 * 빈틈·겹침이 있거나 구간이 30개를 넘으면 null — 그때는 병합을 포기한다.
 */
function combineSegments(
  parts: readonly MergeCandidate[],
): LeaveSegment[] | null {
  const sorted = sortSegments(parts.flatMap((part) => part.segments));
  const out: LeaveSegment[] = [];
  for (const segment of sorted) {
    const days = inclusiveDays(segment.startDate, segment.endDate);
    const last = out[out.length - 1];
    if (!last) {
      out.push({ ...segment, days });
      continue;
    }
    // 앞 구간 끝 다음 날에 시작하지 않으면 빈틈이거나 겹침이다.
    if (segment.startDate !== addDays(last.endDate, 1)) return null;
    // 같은 재원끼리만 잇는다. 재원이 다르면 구간을 그대로 남겨야 일수가 보존된다.
    if (segmentBalanceKey(last) === segmentBalanceKey(segment)) {
      last.endDate = segment.endDate;
      last.days = inclusiveDays(last.startDate, last.endDate);
      continue;
    }
    out.push({ ...segment, days });
  }
  return out.length > MAX_LEAVE_SEGMENTS ? null : out;
}

/** 합쳐진 사유 — 시작일 순으로 잇고, 같은 문구는 한 번만, 상한에서 자른다. */
function combineReasons(parts: readonly MergeCandidate[]): string | null {
  const texts: string[] = [];
  for (const part of parts) {
    const text = part.reason?.trim();
    if (!text || texts.includes(text)) continue;
    texts.push(text);
  }
  const joined = texts.join("\n");
  return joined ? joined.slice(0, MAX_LEAVE_REASON) : null;
}

export function planLeaveMerge(
  incoming: MergeCandidate,
  others: readonly MergeCandidate[],
): LeaveMergePlan {
  const pool = others
    .filter(
      (other) => other.id !== incoming.id && other.status === incoming.status,
    )
    .sort(byStart);

  // 겹침이 먼저다. 합칠 이웃이 있더라도 겹치는 게 있으면 그걸 알리는 쪽이 먼저다.
  const incomingRange = rangeOf(incoming);
  for (const other of pool) {
    const range = rangeOf(other);
    if (
      !rangesOverlap(
        incomingRange.startDate,
        incomingRange.endDate,
        range.startDate,
        range.endDate,
      )
    ) {
      continue;
    }
    return {
      kind: "conflict",
      conflictWith: other,
      overlapStart:
        incomingRange.startDate > range.startDate
          ? incomingRange.startDate
          : range.startDate,
    };
  }

  // 흡수할 때마다 기간이 늘어나므로 더 붙을 이웃이 없을 때까지 반복한다.
  // 이 규칙이 처음부터 있었다면 한 홉이면 끝이지만, 기존 데이터에는 이미 붙은 채로
  // 저장된 휴가들이 남아 있다.
  const parts: MergeCandidate[] = [incoming];
  const rest = [...pool];
  let grew = true;
  while (grew) {
    grew = false;
    for (let i = 0; i < rest.length; i += 1) {
      const other = rest[i]!;
      const merged = rangeOf({
        ...incoming,
        segments: parts.flatMap((p) => p.segments),
      });
      const range = rangeOf(other);
      const touches =
        addDays(merged.endDate, 1) === range.startDate ||
        addDays(range.endDate, 1) === merged.startDate;
      if (!touches) continue;
      // 이어 붙였을 때 성립하지 않으면(기존 데이터의 겹침, 30구간 초과) 건드리지 않는다.
      // 기존 데이터 때문에 사용자가 자기 휴가를 못 고치게 되면 안 된다.
      if (!combineSegments([...parts, other])) continue;
      parts.push(other);
      rest.splice(i, 1);
      grew = true;
      break;
    }
  }

  if (parts.length === 1) return { kind: "alone" };

  const segments = combineSegments(parts)!;
  const ordered = [...parts].sort(byStart);
  const host = ordered[0]!;
  const named = ordered.filter((part) => !isDerivedTitle(part.title));

  return {
    kind: "merged",
    hostId: host.id,
    createdAt: host.createdAt,
    title: named.length ? named[0]!.title : titleFromSegments(segments),
    reason: combineReasons(ordered),
    segments,
    absorbedIds: ordered
      .filter((part) => part.id !== host.id)
      .map((part) => part.id),
  };
}
