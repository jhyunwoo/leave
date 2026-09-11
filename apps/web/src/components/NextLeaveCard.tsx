/**
 * 다음 휴가·다음 외출까지 남은 D-day 카드.
 *
 * 사용처: 내 휴가 화면 맨 위.
 *
 * 카드가 둘인 이유는 `nextLeaveCountdowns`(@leave/client) 주석에 있다 — 내일 나가는
 * 외출이 다음 주 연가를 가리면 안 된다. 셀 것이 없는 쪽은 그리지 않고, 둘 다 없으면
 * 이 영역 자체가 사라진다.
 */

import {
  formatLeaveRemainingTime,
  nextLeaveCountdowns,
  type MyLeave,
  type NextLeaveCountdown,
} from "@leave/client";
import { fmtRange } from "@leave/shared";
import { useEffect, useState } from "react";
import { Link } from "react-router";

type CountdownKind = "leave" | "outing";

/** 갈래마다 다른 것은 문구와 testid뿐이다. 계산은 둘이 같은 함수를 쓴다. */
const KIND_LABELS: Record<
  CountdownKind,
  { onLeave: string; upcoming: string; testId: string }
> = {
  leave: {
    onLeave: "휴가 중",
    upcoming: "다음 휴가",
    testId: "next-leave-card",
  },
  outing: {
    onLeave: "외출 중",
    upcoming: "다음 외출",
    testId: "next-outing-card",
  },
};

/** 시계 갱신을 이 영역 안에 두어 휴가 목록 전체를 매초 다시 그리지 않는다. */
export function NextLeaveCards({
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

  const countdowns = nextLeaveCountdowns(leaves, new Date(now));
  if (!countdowns.leave && !countdowns.outing) return null;

  return (
    <div
      style={{
        display: "grid",
        // 한 장만 남으면 그 한 장이 폭을 다 쓴다. 좁은 화면에서는 둘이 세로로 쌓인다.
        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        gap: "var(--sp-md)",
      }}
    >
      {countdowns.leave && (
        <CountdownCard countdown={countdowns.leave} kind="leave" />
      )}
      {countdowns.outing && (
        <CountdownCard countdown={countdowns.outing} kind="outing" />
      )}
    </div>
  );
}

function CountdownCard({
  countdown,
  kind,
}: {
  countdown: NextLeaveCountdown;
  kind: CountdownKind;
}) {
  const { leave, phase, days } = countdown;
  const labels = KIND_LABELS[kind];
  const onLeave = phase === "onLeave";
  const value = onLeave
    ? formatLeaveRemainingTime(countdown.remainingSeconds ?? 0)
    : `D-${days}`;
  return (
    <Link
      to={`/leaves/${leave.id}`}
      className="card"
      data-testid={labels.testId}
      style={{
        padding: "var(--sp-lg)",
        textDecoration: "none",
        color: "var(--brand)",
      }}
      aria-label={`${onLeave ? `복귀까지 ${value}` : `${labels.upcoming}까지 ${days}일`} · ${leave.title} · 자세히 보기`}
    >
      <span className="caption" style={{ display: "block" }}>
        {onLeave ? labels.onLeave : labels.upcoming}
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
