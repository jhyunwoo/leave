/**
 * 보관 기간이 지난 운영 데이터를 지우는 정리 작업.
 *
 * 사용처: `src/index.ts`의 `scheduled` 핸들러 (wrangler.jsonc의 cron 트리거).
 *
 * 왜 필요한가: 접속 기록은 **요청당 한 행**이 쌓이고, 푸시 로그와 만료된 세션도
 * 지우는 곳이 없었다. 지금 규모에서는 눈에 띄지 않지만 셋 다 상한이 없는 표라
 * 시간이 지나면 저장 비용과 관리자 화면 조회가 함께 나빠진다. 무엇보다 접속 기록은
 * 개인정보라서 "필요한 기간만 보관한다"는 약속을 코드가 실제로 지켜야 한다.
 *
 * 지우는 방식: 한 번에 다 지우려 하면 큰 표에서 트랜잭션이 오래 잡히고 워커가
 * 시간 안에 못 끝낼 수 있다. `LIMIT`을 건 하위 질의로 조금씩 끊어 지우고,
 * 한 번의 실행에서 도는 횟수에도 상한을 둔다. 다 못 지우면 다음 실행이 이어서 한다.
 */

import { sql } from "drizzle-orm";
import {
  accessLogs,
  emailVerifications,
  passkeyChallenges,
  pushLogs,
  rateLimitCounters,
  sessions,
} from "../db/schema";
import type { Db } from "./db";

/** 접속 기록·푸시 로그 기본 보관 일수. `LOG_RETENTION_DAYS`로 덮어쓸 수 있다. */
export const DEFAULT_LOG_RETENTION_DAYS = 90;

/** 한 문장이 지우는 최대 행 수. */
const DELETE_BATCH = 500;

/** 한 번의 실행에서 표 하나당 도는 최대 횟수(= 최대 500 * 20 = 1만 행). */
const MAX_ROUNDS = 20;

export type RetentionSummary = {
  emailVerifications: number;
  accessLogs: number;
  pushLogs: number;
  sessions: number;
  passkeyChallenges: number;
  rateLimitCounters: number;
  cutoff: string;
};

/** `LOG_RETENTION_DAYS`를 읽는다. 값이 이상하면 기본값으로 되돌린다. */
export function resolveRetentionDays(raw: string | undefined): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 1
    ? Math.floor(parsed)
    : DEFAULT_LOG_RETENTION_DAYS;
}

/** `days`일 전 시각의 ISO 문자열. 저장된 createdAt이 ISO라 문자열 비교로 충분하다. */
export function cutoffIso(days: number, now: Date = new Date()): string {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * 조건에 맞는 행을 나눠 지우고 지운 수를 돌려준다.
 *
 * `DELETE ... LIMIT`은 SQLite 빌드 옵션이라 D1에서 기대할 수 없다. 대신 지울 id를
 * 뽑는 하위 질의에 LIMIT을 걸어 같은 효과를 낸다 — 바인드 파라미터는 두 개뿐이다.
 */
async function deleteInRounds(
  db: Db,
  statement: (limit: number) => Promise<number>,
): Promise<number> {
  let removed = 0;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const changes = await statement(DELETE_BATCH);
    removed += changes;
    // 상한보다 적게 지워졌다면 조건에 맞는 행이 더 없다.
    if (changes < DELETE_BATCH) break;
  }
  return removed;
}

/**
 * 보관 기간이 지난 접속 기록·푸시 로그와, 이미 만료된 세션을 지운다.
 *
 * 만료 세션에는 보관 기간을 따로 두지 않는다 — 만료된 순간부터 인증에 쓰이지 않으므로
 * 남겨 둘 이유가 없다.
 */
export async function pruneExpiredData(
  db: Db,
  options: { retentionDays: number; now?: Date },
): Promise<RetentionSummary> {
  const now = options.now ?? new Date();
  const cutoff = cutoffIso(options.retentionDays, now);
  const nowIso = now.toISOString();

  const removedAccessLogs = await deleteInRounds(db, async (limit) => {
    const result = await db
      .delete(accessLogs)
      .where(
        sql`${accessLogs.id} in (select ${accessLogs.id} from ${accessLogs} where ${accessLogs.createdAt} < ${cutoff} limit ${limit})`,
      )
      .run();
    return result.meta.changes;
  });

  const removedPushLogs = await deleteInRounds(db, async (limit) => {
    const result = await db
      .delete(pushLogs)
      .where(
        sql`${pushLogs.id} in (select ${pushLogs.id} from ${pushLogs} where ${pushLogs.createdAt} < ${cutoff} limit ${limit})`,
      )
      .run();
    return result.meta.changes;
  });

  const removedSessions = await deleteInRounds(db, async (limit) => {
    const result = await db
      .delete(sessions)
      .where(
        sql`${sessions.id} in (select ${sessions.id} from ${sessions} where ${sessions.expiresAt} <= ${nowIso} limit ${limit})`,
      )
      .run();
    return result.meta.changes;
  });

  const removedPasskeyChallenges = await deleteInRounds(db, async (limit) => {
    const result = await db
      .delete(passkeyChallenges)
      .where(
        sql`${passkeyChallenges.id} in (select ${passkeyChallenges.id} from ${passkeyChallenges} where ${passkeyChallenges.expiresAt} <= ${nowIso} limit ${limit})`,
      )
      .run();
    return result.meta.changes;
  });

  // 창이 지난 rate limit 카운터. 키에 창 번호가 들어 있어 다시 읽히지 않으므로
  // 남아 있어도 판정을 바꾸지 않지만, 요청마다 한 행씩 늘어나는 표라 지우는 곳이
  // 없으면 접속 기록과 같은 이유로 자란다.
  const removedRateLimitCounters = await deleteInRounds(db, async (limit) => {
    const result = await db
      .delete(rateLimitCounters)
      .where(
        sql`${rateLimitCounters.key} in (select ${rateLimitCounters.key} from ${rateLimitCounters} where ${rateLimitCounters.expiresAt} <= ${nowIso} limit ${limit})`,
      )
      .run();
    return result.meta.changes;
  });

  const removedEmailVerifications = await deleteInRounds(db, async (limit) => {
    const result = await db
      .delete(emailVerifications)
      .where(
        sql`${emailVerifications.userId} in (select ${emailVerifications.userId} from ${emailVerifications} where ${emailVerifications.expiresAt} <= ${nowIso} limit ${limit})`,
      )
      .run();
    return result.meta.changes;
  });

  return {
    emailVerifications: removedEmailVerifications,
    accessLogs: removedAccessLogs,
    pushLogs: removedPushLogs,
    sessions: removedSessions,
    passkeyChallenges: removedPasskeyChallenges,
    rateLimitCounters: removedRateLimitCounters,
    cutoff,
  };
}
