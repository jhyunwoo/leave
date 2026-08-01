import {
  BALANCE_LABELS,
  fmtRangeTiny,
  getHoliday,
  segmentBalanceKey,
  segmentOnDate,
  type RegularOvernightCycle,
} from "@leave/shared";
import type { Calendar } from "../../api/queries";
import { fmtDateK, fmtRange } from "../../lib/format";
import { Avatar } from "../Avatar";

export function DayPanel(props: {
  calendar: Calendar;
  date: string;
  onAddLeave: () => void;
  /** 내 사용자 id. 내 휴가를 맨 위로 올려 강조한다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const dayLeaves = calendar.leaves
    .filter((l) => l.startDate <= date && date <= l.endDate)
    .sort((a, b) =>
      a.userId === props.myUserId ? -1 : b.userId === props.myUserId ? 1 : 0,
    );
  const exceeded = stat?.exceeded ?? false;
  const holiday = getHoliday(date);

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
            출타 {stat.count}명 / 허용 {stat.allowed}명
          </span>
          {exceeded && (
            <span
              className="caption"
              style={{ color: "var(--negative-deep)", fontWeight: 600 }}
            >
              최대 출타 인원 초과
            </span>
          )}
        </div>
      )}

      {props.cycle && (
        <p className="caption text-body">
          정기외박 {props.cycle.index}주기{" "}
          {fmtRangeTiny(props.cycle.start, props.cycle.end)} 안에 속한 날이에요.
        </p>
      )}

      {dayLeaves.length === 0 ? (
        <div
          className="card-sage"
          style={{ textAlign: "center", padding: "var(--sp-2xl) var(--sp-lg)" }}
        >
          <p className="body-sm text-body">이 날은 아무도 휴가가 아니에요.</p>
          <p className="caption text-mute" style={{ marginTop: 4 }}>
            가장 먼저 휴가를 잡아보세요.
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-md)",
          }}
        >
          {dayLeaves.map((l) => {
            // 이제 날짜별 재원을 알 수 있으므로 그날 해당하는 재원만 보여준다.
            const segment = segmentOnDate(l.segments, date);
            const key = segment ? segmentBalanceKey(segment) : null;
            const mine = l.userId === props.myUserId;
            return (
              <li
                key={l.id}
                style={{
                  display: "flex",
                  gap: "var(--sp-md)",
                  alignItems: "center",
                  background: mine ? "var(--primary-pale, #e2f6d5)" : undefined,
                  borderRadius: mine ? "var(--r-lg)" : undefined,
                  padding: mine ? "var(--sp-sm)" : undefined,
                }}
              >
                <Avatar
                  name={l.userName}
                  imageKey={l.userProfileImageKey}
                  size={40}
                />
                <div style={{ minWidth: 0 }}>
                  <p className="body-sm strong">
                    {l.userRankLabel} {l.userName}
                    {mine ? " (나)" : ""}
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
                    {l.title} · {fmtRange(l.startDate, l.endDate)}
                  </p>
                  {l.reason && (
                    <p className="caption text-body" style={{ marginTop: 2 }}>
                      {l.reason}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
