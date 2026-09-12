/**
 * 다음 휴가까지 며칠 남았는가 — 내 휴가 화면 맨 위의 D-day.
 *
 * 사용처: 웹·네이티브 내 휴가 탭의 `NextLeaveCard`, 네이티브 위젯.
 *
 * "언제 나가는가"는 목록의 날짜 범위를 읽고 오늘과 빼야 나오는 값이었다. 그 뺄셈을
 * 화면이 대신한다. 이미 나가 있으면 시작일은 지난 날이므로 **종료일까지** 센다 —
 * 휴가 중인 사람이 궁금한 것은 다음 휴가가 아니라 언제 복귀하는가다.
 *
 * 정렬 규칙은 여기 다시 적지 않고 `partitionMyLeaves`를 그대로 쓴다. "종료일이
 * 오늘 이후인 것만, 시작일 가까운 순, 진행 중인 휴가가 맨 위"는 그쪽이 이미
 * 정의하고 테스트로 잠가 둔 규칙이라, 두 곳에 적히면 한쪽만 고쳐져 답이 갈린다.
 *
 * **화면은 휴가와 외출을 따로 센다**(`nextLeaveCountdowns`). 하나로 합치면 내일
 * 나가는 외출이 다음 주 연가를 가려, 정작 며칠 뒤에 휴가를 나가는지 알 수 없다.
 * 둘은 세는 단위부터 다르다 — 외출은 당일 복귀라 D-day가 언제나 며칠 안쪽이다.
 */
// 도메인 하위 경로에서 직접 가져온다. 배럴(`@leave/shared`)은 zod 스키마까지 함께
// 평가시킨다 — 자세한 배경은 packages/shared/src/index.ts 주석 참고.
import {
  diffDays,
  kstMidnight,
  todayInSeoul,
  type ISODate,
} from "@leave/shared/dates";
import { isCountedLeaveStatus, isOutingSegments } from "@leave/shared/leave";
import { partitionMyLeaves } from "./my-leaves-sections";
import type { MyLeave } from "./types";

export type NextLeaveCountdown = {
  leave: MyLeave;
  /** 오늘이 그 휴가 기간 안이면 `onLeave`, 아직 오지 않았으면 `upcoming`. */
  phase: "onLeave" | "upcoming";
  /** `onLeave`면 종료일까지, `upcoming`이면 시작일까지 남은 날. 음수는 없다. */
  days: number;
  /** 휴가 중일 때 복귀시각까지 남은 초. 밀리초는 올림한다. */
  remainingSeconds?: number;
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
    result.remainingSeconds = Math.max(
      Math.ceil((returnAt(leave) - now) / 1_000),
      0,
    );
  }
  return result;
}

/** 이 휴가가 외출인가. 판정 규칙은 서버와 함께 쓰는 `isOutingSegments` 하나뿐이다. */
export function isOutingLeave(leave: MyLeave): boolean {
  return isOutingSegments(leave.segments);
}

/** 휴가와 외출 각각의 다음 카운트다운. 셀 것이 없는 쪽은 null이고 화면에서 사라진다. */
export type NextLeaveCountdowns = {
  /** 외출이 아닌 다음 휴가. */
  leave: NextLeaveCountdown | null;
  /** 다음 외출. */
  outing: NextLeaveCountdown | null;
};

/**
 * 휴가와 외출을 갈라 각각 카운트다운한다.
 *
 * 규칙은 `nextLeaveCountdown` 하나뿐이고 여기서는 목록만 나눈다 — 세는 규칙을 여기
 * 다시 적으면 한쪽만 고쳐져 두 카드가 다른 기준으로 움직인다.
 */
export function nextLeaveCountdowns(
  leaves: readonly MyLeave[] | undefined,
  at: ISODate | Date = new Date(),
): NextLeaveCountdowns {
  const all = leaves ?? [];
  return {
    leave: nextLeaveCountdown(
      all.filter((item) => !isOutingLeave(item)),
      at,
    ),
    outing: nextLeaveCountdown(all.filter(isOutingLeave), at),
  };
}

/** 24시간을 넘겨도 총 시간으로 표시한다. 웹·앱·위젯 공통 표기. */
export function formatLeaveRemainingTime(seconds: number): string {
  const total = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(total / 3600)}시간 ${String(Math.floor(total / 60) % 60).padStart(2, "0")}분 ${String(total % 60).padStart(2, "0")}초`;
}
