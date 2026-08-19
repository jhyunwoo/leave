/**
 * D1 한 문장의 바인드 파라미터 상한과, 그 상한을 넘기지 않게 문장을 쪼개는 도구.
 *
 * 사용처: 구간 저장(leave-balances), 병합 저장(leave-merge), 관리자 워커.
 *
 * D1은 한 **문장**에 바인드 파라미터를 100개까지만 받는다. 넘기면 느려지는 게 아니라
 * SQLITE_ERROR로 요청이 통째로 죽는다(HTTP 500). 상한은 문장 단위라 `db.batch()`로
 * 여러 문장을 묶는 것은 아무 문제가 없다 — 오히려 쪼갠 문장들을 같은 batch에 담으면
 * 왕복도 하나로 유지되고 원자성도 그대로 지켜진다.
 *
 * 실제로 났던 사고 두 가지가 이 파일의 존재 이유다.
 *  - 구간 15개짜리 휴가 등록이 500. `INSERT INTO leave_segments`는 행마다 컬럼 7개를
 *    바인드하므로 15행이면 105개가 된다(스키마 상한은 30구간이다).
 *  - 휴가 101건인 사용자의 목록 조회가 500. id 목록을 `IN (...)`에 그대로 넣었다.
 */

import { getTableColumns } from "drizzle-orm";
import type { SQLiteTable } from "drizzle-orm/sqlite-core";
import type { Db } from "./db";

/** D1이 한 문장에 받는 최대 바인드 파라미터 수. */
export const D1_MAX_BOUND_PARAMS = 100;

/** `db.batch()`가 받는 문장 하나의 타입. */
export type BatchItem = Parameters<Db["batch"]>[0][number];

/**
 * 문장 하나가 상한을 넘지 않도록 목록을 나눈다.
 *
 * @param paramsPerItem 항목 하나가 쓰는 바인드 파라미터 수.
 *   id 목록을 `IN (...)`에 넣으면 1, 여러 행을 한 번에 INSERT 하면 그 표의 컬럼 수다.
 */
export function chunkForParams<T>(
  items: readonly T[],
  paramsPerItem: number,
): T[][] {
  const size = Math.max(1, Math.floor(D1_MAX_BOUND_PARAMS / paramsPerItem));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * 여러 행을 넣는 INSERT를 상한에 맞춰 쪼갠 문장들.
 *
 * 행 하나가 바인드하는 파라미터 수는 표의 컬럼 수로 잡는다. 실제로는 값을 주지 않은
 * 컬럼이 빠질 수도 있지만, 적게 잡아서 상한을 넘기는 것보다 넉넉히 잡아 문장이 하나 더
 * 늘어나는 편이 안전하다(문장 수는 같은 batch 안이라 왕복에 영향이 없다).
 *
 * 이 상한에 걸린 적이 있는 표들: leave_segments(구간 15개), notifications(초과 알림
 * 대상 12명), push_logs(발송 대상 17명). 셋 다 "사람이 늘면 어느 날 갑자기 500"이었다.
 */
export function insertStatements<T extends SQLiteTable>(
  db: Db,
  table: T,
  rows: readonly T["$inferInsert"][],
): BatchItem[] {
  const columnCount = Object.keys(getTableColumns(table)).length;
  return chunkForParams(rows, columnCount).map(
    (chunk) => db.insert(table).values(chunk) as unknown as BatchItem,
  );
}

/** 문장 목록을 한 번의 batch(=한 왕복, 한 트랜잭션)로 실행한다. 비어 있으면 아무것도 하지 않는다. */
export async function runBatch(db: Db, statements: BatchItem[]): Promise<void> {
  if (!statements.length) return;
  await db.batch(statements as [BatchItem, ...BatchItem[]]);
}
