import {
  formatLeaveRemainingTime,
  nextLeaveCountdown,
  type MyLeave,
} from "@leave/client";
import { fmtRange } from "@leave/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

/** 시계 갱신을 카드 안에 두어 휴가 목록 전체를 매초 다시 그리지 않는다. */
export function NextLeaveCard({
  leaves,
}: {
  leaves: readonly MyLeave[] | undefined;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    const sync = () => {
      clearInterval(interval);
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      interval = setInterval(() => setNow(Date.now()), 1_000);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);
  const countdown = nextLeaveCountdown(leaves, new Date(now));
  if (!countdown) return null;
  const { leave, phase, days } = countdown;
  const onLeave = phase === "onLeave";
  const value = onLeave
    ? formatLeaveRemainingTime(countdown.remainingSeconds ?? 0)
    : `D-${days}`;
  return (
    <Link
      to={`/leaves/${leave.id}`}
      className="card"
      data-testid="next-leave-card"
      style={{
        padding: "var(--sp-lg)",
        textDecoration: "none",
        color: "var(--brand)",
      }}
      aria-label={`${onLeave ? `복귀까지 ${value}` : `다음 휴가까지 ${days}일`} · ${leave.title} · 자세히 보기`}
    >
      <span className="caption" style={{ display: "block" }}>
        {onLeave ? "휴가 중" : "다음 휴가"}
      </span>
      <span
        className="display-xs"
        style={{ display: "block", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </span>
      <span className="caption text-body">
        {leave.title} · {fmtRange(leave.startDate, leave.endDate)}
      </span>
    </Link>
  );
}
