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
import { leaves, type LeaveRow } from "../db/schema";
import { chunkForParams, runBatch, type BatchItem } from "./d1";
import type { Db } from "./db";
import { leaveRuleMessage } from "./errors";
import {
  assertSegmentsAvailable,
  deleteSegmentsOfStatements,
  foldSegmentRows,
  segmentInsertStatements,
  segmentsOfUserQuery,
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
  // 후보 행과 그 구간을 한 번의 왕복으로 함께 읽는다. 예전에는 행을 먼저 읽고
  // id 목록을 IN(...)에 넣어 구간을 읽었는데, 같은 상태의 휴가가 100건을 넘으면
  // D1 바인드 파라미터 상한에 걸려 등록·수정이 통째로 실패했다.
  const [rows, segments] = await db.batch([
    db
      .select()
      .from(leaves)
      .where(
        and(
          eq(leaves.userId, userId),
          eq(leaves.status, input.status),
          ...(input.excludeLeaveId
            ? [ne(leaves.id, input.excludeLeaveId)]
            : []),
        ),
      ),
    segmentsOfUserQuery(db, userId, input),
  ]);
  if (!rows.length) return [];
  const segmentMap = foldSegmentRows(segments);
  // 구간이 하나도 없는 행은 정상 경로로는 생길 수 없지만(스키마가 min(1)),
  // 등록과 구간 삽입을 나눠 하는 관리자 경로가 중간에 실패하면 남을 수 있다.
  // 그런 행을 후보로 넘기면 뒤의 rangeOf가 non-null 단정에서 그대로 죽으므로,
  // 병합 후보에서 조용히 걸러 그 행은 흡수 대상에서 빠지게 한다.
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      reason: row.reason,
      status: row.status,
      createdAt: row.createdAt,
      segments: segmentMap.get(row.id) ?? [],
    }))
    .filter((candidate) => candidate.segments.length > 0);
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
    // host(흡수될 이웃 포함)의 구간은 이미 DB에 있다. clearIds로 빼지 않으면
    // host를 두 번 세어(위 주석 참고) 잔여가 모자란다고 잘못 막는다.
    await assertSegmentsAvailable(db, user, saved.segments, [
      ...clearIds,
      incoming.id,
      ...(options.existingId ? [options.existingId] : []),
    ]);
  } catch (error) {
    // 규칙 위반만 "이래서 못 넣는다"로 돌려준다. D1 장애 같은 것은 그대로 올려
    // 보내야 500으로 잡히고 관측에도 남는다.
    const message = leaveRuleMessage(error);
    if (message === null) throw error;
    return { ok: false, error: message };
  }

  // 살아남는 행이 이미 DB에 있는지. 등록인데 host가 자기 자신이면 그때만 insert다.
  const inserting = !options.existingId && saved.id === incoming.id;

  // 아래 문장들은 모두 한 batch = 한 트랜잭션에 들어간다. 중간에 실패하면 전부 되돌아가야
  // 한다 — 옛 구간만 지워지고 새 구간이 안 들어가면 휴가가 통째로 빈 껍데기가 된다.
  // 문장을 여러 개로 쪼개는 것은 D1의 문장당 바인드 파라미터 상한(100개) 때문이고,
  // 같은 batch 안에 있으므로 왕복도 원자성도 그대로다.
  const statements: BatchItem[] = deleteSegmentsOfStatements(db, clearIds);
  // 흡수되는 이웃 수에는 상한이 없다 — 같은 재원의 붙은 구간은 하나로 합쳐지므로
  // 구간 30개 상한에 걸리지 않고도 수백 건이 한 번에 흡수될 수 있다.
  for (const ids of chunkForParams(saved.absorbedIds, 1)) {
    statements.push(db.delete(leaves).where(inArray(leaves.id, ids)));
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
          // id만으로도 오늘은 안전하다(후보 풀도 existingId도 이미 사용자로 좁혀져 있다) —
          // 하지만 그 전제가 나중에 깨지더라도 남의 행을 건드리지 않도록 userId도 같이 건다.
          .where(and(eq(leaves.id, row.id), eq(leaves.userId, user.id))),
  );
  statements.push(...segmentInsertStatements(db, row.id, saved.segments));

  await runBatch(db, statements);

  return { ok: true, row, segments: saved.segments };
}
