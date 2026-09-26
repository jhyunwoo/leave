/**
 * 애플워치 페이스 컴플리케이션이 읽는 값 — 전역·다음 휴가·다음 외출 D-day.
 *
 * 세는 규칙은 화면이 쓰는 `nextLeaveCountdowns`와 `serviceProgressAt` 그대로다.
 * 따로 두면 "내 휴가 카드는 D-3인데 페이스는 D-4"처럼 어긋나므로, 타임라인을 만든
 * 같은 재료(`WidgetSource`)에서만 짠다.
 *
 * 직렬화된 JSON은 워치의 `WatchFaceData`와 필드 이름이 같아야 한다.
 */
import { fmtRangeTiny } from "@leave/shared/calendar";
import { diffDays, kstMidnight, type ISODate } from "@leave/shared/dates";
import { serviceProgressAt } from "@leave/shared/rank";
import { nextLeaveCountdowns } from "@leave/client/next-leave-countdown";
import type { LeaveWatchFaceData } from "./watch-publisher";
import type { WidgetSource } from "./payload";

function countdownToJson(
  countdown: ReturnType<typeof nextLeaveCountdowns>["leave"],
): LeaveWatchFaceData["nextLeave"] {
  if (!countdown) return null;
  return {
    days: countdown.days,
    // 진행 중이면 복귀일, 아니면 시작일이 목표 날짜다(nextLeaveCountdown의 규칙).
    date:
      countdown.phase === "onLeave"
        ? countdown.leave.endDate
        : countdown.leave.startDate,
    title: countdown.leave.title,
    range: fmtRangeTiny(countdown.leave.startDate, countdown.leave.endDate),
  };
}

export function buildWatchFaceData(
  source: WidgetSource,
  today: ISODate,
): LeaveWatchFaceData {
  const { profile } = source;
  const dischargeAt = profile?.dischargeAt ?? null;
  const enlistedAt = profile?.enlistedAt ?? null;
  const countdowns = nextLeaveCountdowns(source.leaves, today);
  return {
    state: source.state,
    discharge: dischargeAt
      ? { days: Math.max(diffDays(today, dischargeAt), 0), date: dischargeAt }
      : null,
    progress:
      enlistedAt && dischargeAt
        ? serviceProgressAt(enlistedAt, dischargeAt, kstMidnight(today))
        : null,
    dutyDays: source.dutyDaysToday ?? null,
    nextLeave: countdownToJson(countdowns.leave),
    nextOuting: countdownToJson(countdowns.outing),
  };
}
