/**
 * 내 잔여 휴가·정기외박 주기를 셀 때 쓰는 구간 목록.
 *
 * 사용처: 웹/네이티브 달력의 주기 배너, 휴가 등록 폼의 주기 검사.
 *
 * 이 한 줄짜리 규칙이 예전에는 세 곳에 따로 적혀 있었고 셋이 서로 달랐다 —
 * 네이티브 달력과 웹 달력은 상태를 아예 걸르지 않아 취소한 휴가가 주기 몫을
 * 계속 잡아먹었고, 등록 폼은 `isCountedLeaveStatus`로 걸러 초안까지 빼 버려
 * 서버가 400을 돌려주는 조합을 만들었다. 기준은 서버가 잔여를 계산할 때 쓰는
 * 것과 같아야 한다 — `BALANCE_LEAVE_STATUSES`(shared/leave.ts) 하나다.
 */
import { countsAgainstBalance } from "@leave/shared/leave";
import type { MyLeave } from "./types";

/**
 * 잔여에서 빠지는 휴가의 구간 전부.
 *
 * `excludeLeaveId`는 수정 중인 휴가를 뺄 때 쓴다 — 자기 자신과 부딪히면 늘
 * 초과로 읽힌다.
 */
export function balanceCountedSegments(
  leaves: readonly MyLeave[] | undefined,
  options: { excludeLeaveId?: string } = {},
): MyLeave["segments"] {
  return (leaves ?? [])
    .filter(
      (leave) =>
        leave.id !== options.excludeLeaveId &&
        countsAgainstBalance(leave.status),
    )
    .flatMap((leave) => leave.segments);
}
