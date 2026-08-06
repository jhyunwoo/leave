import {
  availabilitySignal,
  BALANCE_LABELS,
  fmtRangeTiny,
  getHoliday,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  segmentBalanceKey,
  segmentOnDate,
  type RegularOvernightCycle,
} from "@leave/shared";
import type { Calendar } from "../../api/queries";
import { fmtDateK, fmtRange } from "../../lib/format";
import { Avatar } from "../Avatar";
import { OfficialDisclaimer } from "../OfficialDisclaimer";

export function DayPanel(props: {
  calendar: Calendar;
  date: string;
  onAddLeave: () => void;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  // 명단에는 내 일정도 함께 들어 있다. 초안은 서버가 애초에 내려주지 않는다.
  const dayAttendees = calendar.attendees.filter(
    (a) => a.startDate <= date && date <= a.endDate,
  );
  const exceeded = stat?.exceeded ?? false;
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  const holiday = getHoliday(date);
  const blackout = calendar.blackouts.find(
    (b) => b.startDate <= date && date <= b.endDate,
  );

  return (
    <div
      className="card anim-rise"
      style={{ display: "flex", flexDirection: "column", gap: "var(--sp-lg)" }}
    >
      <div>
        <p className="eyebrow">선택한 날짜</p>
        <h2 className="display-xs" style={{ marginTop: 4 }}>
          {fmtDateK(date)}
        </h2>
        {holiday && (
          <p
            className="caption"
            style={{ marginTop: 4, color: "var(--negative)", fontWeight: 600 }}
          >
            {holiday}
          </p>
        )}
      </div>

      {stat && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--sp-sm)",
            flexWrap: "wrap",
          }}
        >
          <span
            className={`badge ${exceeded ? "badge-negative" : "badge-positive"}`}
          >
            {signal?.percent == null
              ? "기준 미설정"
              : `${signal.label} ${signal.percent}%`}
          </span>
          {exceeded && (
            <span
              className="caption"
              style={{ color: "var(--negative-deep)", fontWeight: 600 }}
            >
              참고 기준 초과
            </span>
          )}
        </div>
      )}

      {blackout && (
        <div
          className="card-sage"
          style={{
            padding: "var(--sp-md)",
            border: "1px solid var(--warning)",
          }}
        >
          <p
            className="body-sm strong"
            style={{ color: "var(--warning-content)" }}
          >
            제한 가능 기간
          </p>
          <p className="caption text-body" style={{ marginTop: 2 }}>
            {blackout.reason ?? "관리자가 등록한 기간입니다."} 출타율과 무관하게
            지휘관이 휴가를 제한할 수 있어요.
          </p>
        </div>
      )}

      <OfficialDisclaimer />

      {props.cycle && (
        <p className="caption text-body">
          정기외박 {props.cycle.index}주기{" "}
          {fmtRangeTiny(props.cycle.start, props.cycle.end)} 안에 속한 날이에요.
        </p>
      )}

      {dayAttendees.length === 0 ? (
        <div
          className="card-sage"
          style={{ textAlign: "center", padding: "var(--sp-2xl) var(--sp-lg)" }}
        >
          <p className="body-sm text-body">이 날 출타 예정인 사람이 없어요.</p>
          <p className="caption text-mute" style={{ marginTop: 4 }}>
            내 계획을 먼저 시뮬레이션해보세요.
          </p>
        </div>
      ) : (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-md)",
          }}
        >
          <p className="body-sm strong">이 날 출타 {dayAttendees.length}명</p>
          <ul
            style={{
              listStyle: "none",
              margin: 0,
              padding: 0,
              display: "flex",
              flexDirection: "column",
              gap: "var(--sp-xs)",
            }}
          >
            {dayAttendees.map((attendee) => {
              // 날짜별 재원을 알 수 있으므로 그날 해당하는 재원만 보여준다.
              const segment = segmentOnDate(attendee.segments, date);
              const key = segment ? segmentBalanceKey(segment) : null;
              const isMine = attendee.userId === props.myUserId;
              return (
                <li
                  key={attendee.leaveId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--sp-md)",
                    background: isMine
                      ? "var(--primary-pale, #e2f6d5)"
                      : "transparent",
                    borderRadius: "var(--r-lg)",
                    padding: "var(--sp-sm)",
                    minWidth: 0,
                  }}
                >
                  <Avatar name={attendee.name} size={32} />
                  <div style={{ minWidth: 0 }}>
                    <p className="body-sm strong">
                      {isMine
                        ? "내 계획"
                        : `${attendee.rankLabel} ${attendee.name}`}
                      {key && (
                        <span
                          className="cal-mine"
                          data-balance={key}
                          style={{
                            display: "inline-block",
                            width: "auto",
                            margin: "0 0 0 6px",
                          }}
                        >
                          {BALANCE_LABELS[key]}
                        </span>
                      )}
                    </p>
                    <p className="caption text-mute">
                      {fmtRange(attendee.startDate, attendee.endDate)}
                      {isConfirmedLeaveStatus(attendee.status)
                        ? ""
                        : ` · ${LEAVE_STATUS_LABELS[attendee.status]}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <button
        type="button"
        className="btn btn-primary"
        onClick={props.onAddLeave}
      >
        이 날부터 휴가 등록
      </button>
    </div>
  );
}
