/**
 * 휴가를 저장하면서 붙어 있는 이웃을 흡수하는 경로.
 *
 * 사용처: `/leaves` POST·PATCH.
 *
 * 규칙 자체는 `@leave/shared`의 `planLeaveMerge`가 갖고 있다. 여기서는 후보를 읽어
 * 넘기고, 결정된 모습을 한 번의 batch로 쓰는 일만 한다. 등록과 수정이 같은 함수를
 * 지나야 규칙이 두 벌로 갈라지지 않는다.
 */

import {
  fmtDateShort,
  planLeaveMerge,
  segmentsRange,
  type Branch,
  type LeaveSegment,
  type LeaveStatus,
  type MergeCandidate,
} from "@leave/shared";
import { and, eq, inArray, ne } from "drizzle-orm";
import { leaves, leaveSegments, type LeaveRow } from "../db/schema";
import type { Db } from "./db";
import {
  assertSegmentsAvailable,
  segmentRowsFor,
  segmentsForLeaves,
} from "./leave-balances";

export type SaveLeaveResult =
  | { ok: false; error: string }
  | { ok: true; row: LeaveRow; segments: LeaveSegment[] };

/**
 * 병합 후보 — 상태가 같은 내 휴가 전부.
 *
 * 날짜로 좁히지 않는다. 흡수할 때마다 기간이 늘어나므로 요청 기간 언저리로 창을
 * 좁히면 창 밖의 이웃이 애초에 안 읽혀 연쇄 병합이 한 홉에서 멈춘다. 한 사용자의
 * 휴가는 수십 건 규모라 상태로만 좁혀도 충분히 싸다.
 */
async function loadMergeCandidates(
  db: Db,
  userId: string,
  input: { status: LeaveStatus; excludeLeaveId?: string },
): Promise<MergeCandidate[]> {
  const rows = await db
    .select()
    .from(leaves)
    .where(
      and(
        eq(leaves.userId, userId),
        eq(leaves.status, input.status),
        ...(input.excludeLeaveId ? [ne(leaves.id, input.excludeLeaveId)] : []),
      ),
    )
    .all();
  if (!rows.length) return [];
  const segments = await segmentsForLeaves(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    reason: row.reason,
    status: row.status,
    createdAt: row.createdAt,
    segments: segments.get(row.id) ?? [],
  }));
}

/**
 * 휴가 한 건을 저장한다. 붙어 있는 같은 상태의 이웃이 있으면 흡수해 한 건으로 만든다.
 *
 * `options.existingId`가 있으면 수정, 없으면 등록이다. 어느 쪽이든 **살아남는 행이
 * 요청한 행이 아닐 수 있다** — 앞 휴가에 흡수되면 그쪽 id와 createdAt이 남는다.
 * 호출자는 반환된 `row.id`를 응답에 그대로 실어야 한다.
 */
export async function saveLeaveWithMerge(
  db: Db,
  user: { id: string; branch: Branch; enlistedAt: string; dischargeAt: string },
  incoming: MergeCandidate,
  options: { existingId?: string } = {},
): Promise<SaveLeaveResult> {
  const plan = planLeaveMerge(
    incoming,
    await loadMergeCandidates(db, user.id, {
      status: incoming.status,
      excludeLeaveId: options.existingId,
    }),
  );

  if (plan.kind === "conflict") {
    return {
      ok: false,
      error: `${fmtDateShort(plan.overlapStart)}에 이미 등록한 휴가가 있어요. 기간이 겹치면 저장할 수 없습니다.`,
    };
  }

  const saved =
    plan.kind === "merged"
      ? {
          id: plan.hostId,
          createdAt: plan.createdAt,
          title: plan.title,
          reason: plan.reason,
          segments: plan.segments,
          // incoming이 아직 행이 없는 등록일 때만 지울 대상에서 뺀다. 수정(PATCH)이면
          // incoming.id는 이미 있는 행이라 다른 이웃에 흡수될 수 있고, 그때는
          // absorbedIds에 그대로 남아야 옛 구간이 지워지고 옛 행도 삭제된다.
          absorbedIds: options.existingId
            ? plan.absorbedIds
            : plan.absorbedIds.filter((id) => id !== incoming.id),
        }
      : {
          id: incoming.id,
          createdAt: incoming.createdAt,
          title: incoming.title,
          reason: incoming.reason,
          segments: incoming.segments,
          absorbedIds: [] as string[],
        };

  const range = segmentsRange(saved.segments)!;
  const row: LeaveRow = {
    id: saved.id,
    userId: user.id,
    title: saved.title,
    startDate: range.startDate,
    endDate: range.endDate,
    reason: saved.reason,
    status: incoming.status,
    createdAt: saved.createdAt,
  };

  // 이번 저장으로 지워지거나 통째로 다시 쓰이는 행 전부. host(saved.id)도 포함된다 —
  // host가 기존 이웃이면 그 구간이 이미 테이블에 있고 saved.segments 안에도 들어
  // 있으므로, 빼지 않으면 host의 날짜를 두 번 세게 된다.
  const clearIds = [saved.id, ...saved.absorbedIds];

  try {
    // 흡수될 이웃의 구간은 이미 DB에 있다. 빼지 않으면 같은 날을 두 번 세고
    // 잔여가 모자란다고 잘못 막는다.
    await assertSegmentsAvailable(db, user, saved.segments, [
      ...clearIds,
      incoming.id,
      ...(options.existingId ? [options.existingId] : []),
    ]);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "잔여량이 부족합니다",
    };
  }

  // 살아남는 행이 이미 DB에 있는지. 등록인데 host가 자기 자신이면 그때만 insert다.
  const inserting = !options.existingId && saved.id === incoming.id;

  type BatchItem = Parameters<typeof db.batch>[0][number];
  const statements: BatchItem[] = [
    db.delete(leaveSegments).where(inArray(leaveSegments.leaveId, clearIds)),
  ];
  if (saved.absorbedIds.length) {
    statements.push(
      db.delete(leaves).where(inArray(leaves.id, saved.absorbedIds)),
    );
  }
  statements.push(
    inserting
      ? db.insert(leaves).values(row)
      : db
          .update(leaves)
          .set({
            title: row.title,
            startDate: row.startDate,
            endDate: row.endDate,
            reason: row.reason,
            status: row.status,
          })
          .where(eq(leaves.id, row.id)),
  );
  statements.push(
    db.insert(leaveSegments).values(segmentRowsFor(row.id, saved.segments)),
  );

  await db.batch(statements as [BatchItem, ...BatchItem[]]);

  return { ok: true, row, segments: saved.segments };
}
