/**
 * 고른 날에 걸친 내 휴가. 달력 옆 칸의 맨 위에 둔다.
 *
 * 출타 명단(DayRoster)에도 내 행이 있지만 부대원 사이에 묻혀 맨 아래에 온다.
 * 이 카드는 초안까지 보여준다 — 서버가 명단에는 초안을 내려주지 않는다.
 */

import type { MyLeave } from "@leave/client";
import {
  fmtRange,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
} from "@leave/shared";

export function MyDayLeaves(props: {
  leaves: MyLeave[] | undefined;
  date: string;
  onOpen: (leaveId: string) => void;
}) {
  const leaves = (props.leaves ?? []).filter(
    (leave) => leave.startDate <= props.date && props.date <= leave.endDate,
  );
  // 비었다는 안내는 아래 명단이 이미 한다.
  if (leaves.length === 0) return null;

  return (
    <section
      className="card"
      style={{ padding: "var(--sp-lg)", display: "grid", gap: "var(--sp-sm)" }}
    >
      <h2 className="display-xs">내 휴가</h2>
      {leaves.map((leave) => (
        <button
          type="button"
          key={leave.id}
          className="btn btn-secondary"
          style={{
            justifyContent: "flex-start",
            whiteSpace: "normal",
            textAlign: "left",
          }}
          onClick={() => props.onOpen(leave.id)}
        >
          <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
            <strong>{leave.title}</strong>
            <span className="caption text-mute">
              {fmtRange(leave.startDate, leave.endDate)}
              {isConfirmedLeaveStatus(leave.status)
                ? ""
                : ` · ${LEAVE_STATUS_LABELS[leave.status]}`}
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}
