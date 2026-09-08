/**
 * 다음 휴가까지 며칠 남았는가 — 내 휴가 화면 맨 위의 D-day.
 *
 * 사용처: 네이티브 내 휴가 탭의 `NextLeaveCard`.
 *
 * "언제 나가는가"는 목록의 날짜 범위를 읽고 오늘과 빼야 나오는 값이었다. 그 뺄셈을
 * 화면이 대신한다. 이미 나가 있으면 시작일은 지난 날이므로 **종료일까지** 센다 —
 * 휴가 중인 사람이 궁금한 것은 다음 휴가가 아니라 언제 복귀하는가다.
 *
 * 정렬 규칙은 여기 다시 적지 않고 `partitionMyLeaves`를 그대로 쓴다. "종료일이
 * 오늘 이후인 것만, 시작일 가까운 순, 진행 중인 휴가가 맨 위"는 그쪽이 이미
 * 정의하고 테스트로 잠가 둔 규칙이라, 두 곳에 적히면 한쪽만 고쳐져 답이 갈린다.
 */
// 도메인 하위 경로에서 직접 가져온다. 배럴(`@leave/shared`)은 zod 스키마까지 함께
// 평가시킨다 — 자세한 배경은 packages/shared/src/index.ts 주석 참고.
import {
  diffDays,
  kstMidnight,
  todayInSeoul,
  type ISODate,
} from "@leave/shared/dates";
import { isCountedLeaveStatus } from "@leave/shared/leave";
import { partitionMyLeaves } from "./my-leaves-sections";
import type { MyLeave } from "./types";

export type NextLeaveCountdown = {
  leave: MyLeave;
  /** 오늘이 그 휴가 기간 안이면 `onLeave`, 아직 오지 않았으면 `upcoming`. */
  phase: "onLeave" | "upcoming";
  /** `onLeave`면 종료일까지, `upcoming`이면 시작일까지 남은 날. 음수는 없다. */
  days: number;
  /** 휴가 중일 때 복귀시각까지 남은 분. 초 단위는 올림한다. */
  remainingMinutes?: number;
};

const DEFAULT_RETURN_TIME = "21:00";

function returnAt(leave: MyLeave): number {
  const time = leave.returnTime ?? DEFAULT_RETURN_TIME;
  const [hours, minutes] = time.split(":").map(Number) as [number, number];
  return kstMidnight(leave.endDate) + (hours * 60 + minutes) * 60_000;
}

/**
 * 카운트다운할 휴가 한 건과 남은 날. 셀 휴가가 없으면 null.
 *
 * 초안(나만 보는 시뮬레이션)과 반려·취소는 실제로 나가지 않으므로 세지 않는다.
 * 그 집합은 `isCountedLeaveStatus`가 이미 정의한다 — 출타 집계와 같은 기준을 써야
 * "달력에는 잡혀 있는데 D-day는 없다" 같은 어긋남이 생기지 않는다.
 */
export function nextLeaveCountdown(
  leaves: readonly MyLeave[] | undefined,
  at: ISODate | Date = new Date(),
): NextLeaveCountdown | null {
  const today = at instanceof Date ? todayInSeoul(at) : at;
  const now = at instanceof Date ? at.getTime() : kstMidnight(today);
  const counted = (leaves ?? []).filter((leave) =>
    isCountedLeaveStatus(leave.status),
  );
  const candidates = partitionMyLeaves(counted, today).upcoming.filter(
    (leave) => !(at instanceof Date) || returnAt(leave) > now,
  );
  const leave = candidates[0];
  if (!leave) return null;

  const onLeave = leave.startDate <= today;
  const target = onLeave ? leave.endDate : leave.startDate;
  const result: NextLeaveCountdown = {
    leave,
    phase: onLeave ? "onLeave" : "upcoming",
    days: Math.max(diffDays(today, target), 0),
  };
  if (onLeave && at instanceof Date) {
    result.remainingMinutes = Math.max(
      Math.ceil((returnAt(leave) - now) / 60_000),
      0,
    );
  }
  return result;
}
