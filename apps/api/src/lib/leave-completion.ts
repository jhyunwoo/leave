/**
 * 복귀일이 지난 계획을 "복귀 완료"로 굳히는 정기 작업.
 *
 * 사용처: `src/index.ts`의 `scheduled` 핸들러 (wrangler.jsonc의 cron 트리거, 12:10 KST).
 *
 * 판정 자체는 `settledLeaveStatus` 하나뿐이고 응답 직렬화도 같은 함수를 쓴다 —
 * 화면과 저장된 값이 다른 답을 낼 수 없다. 여기서 조건을 SQL로 다시 적는 것은
 * 행마다 읽어 고치면 D1 왕복이 행 수만큼 늘기 때문이고, 상태 목록은
 * `AUTO_COMPLETED_LEAVE_STATUSES`를 그대로 바인딩해 두 벌이 되지 않게 한다.
 *
 * **왜 굳히는가.** 읽을 때마다 파생하므로 화면에는 이미 반영돼 있다. 저장된 값까지
 * 맞추는 이유는 병합 후보를 상태로 나누는 `leave-merge.ts`가 저장된 값을 보기
 * 때문이다 — 응답과 저장이 갈리면 이미 다녀온 휴가가 겹침 검사에서 빠진다.
 * (지금은 쓰기 경로도 같은 함수로 굳히므로, 여기서 고치는 것은 종료일이 지나기
 * **전에** 쓰인 옛 행뿐이다.)
 *
 * 인덱스는 만들지 않는다. `leaves_dates_idx`가 `(startDate, endDate)`라 `endDate < ?`는
 * 스캔이지만, 하루 한 번 도는 제한된 스캔이 매 쓰기마다 유지되는 인덱스보다 싸다 —
 * `db/schema.ts`가 상태성 인덱스를 두지 않는 이유와 같다.
 *
 * 지우는 쪽(`retention.ts`)과 같은 이유로 끊어서 돈다. 못 굳힌 몫은 다음 실행이 이어서 한다.
 */

import {
  AUTO_COMPLETED_LEAVE_STATUSES,
  todayInSeoul,
  type ISODate,
} from "@leave/shared";
import { sql } from "drizzle-orm";
import { leaves } from "../db/schema";
import type { Db } from "./db";

/** 한 문장이 고치는 최대 행 수. */
const UPDATE_BATCH = 500;

/** 한 번의 실행에서 도는 최대 횟수(= 최대 500 * 20 = 1만 행). */
const MAX_ROUNDS = 20;

export type LeaveCompletionSummary = {
  /** 이번 실행에서 복귀 완료로 바뀐 행 수. */
  completed: number;
  /** 판정에 쓴 오늘(KST). 로그만 보고도 경계를 확인할 수 있어야 한다. */
  today: ISODate;
};

export async function completePastLeaves(
  db: Db,
  options: { today?: ISODate } = {},
): Promise<LeaveCompletionSummary> {
  const today = options.today ?? todayInSeoul();
  // `UPDATE ... LIMIT`은 SQLite 빌드 옵션이라 D1에서 기대할 수 없다. 고칠 id를
  // 뽑는 하위 질의에 LIMIT을 건다 — 바인드 파라미터는 오늘 하나, 상태 셋, 상한 하나로
  // 다섯 개뿐이라 문장당 100개 상한과는 무관하다.
  const statuses = sql.join(
    AUTO_COMPLETED_LEAVE_STATUSES.map((status) => sql`${status}`),
    sql`, `,
  );

  let completed = 0;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const result = await db
      .update(leaves)
      .set({ status: "completed" })
      .where(
        sql`${leaves.id} in (select ${leaves.id} from ${leaves} where ${leaves.endDate} < ${today} and ${leaves.status} in (${statuses}) limit ${UPDATE_BATCH})`,
      )
      .run();
    completed += result.meta.changes;
    // 상한보다 적게 고쳤다면 조건에 맞는 행이 더 없다.
    if (result.meta.changes < UPDATE_BATCH) break;
  }
  return { completed, today };
}
