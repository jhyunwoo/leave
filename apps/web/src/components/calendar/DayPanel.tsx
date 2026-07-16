import type { Calendar } from "../../api/queries";
import { fmtDateK, fmtRange } from "../../lib/format";
import { Avatar } from "../Avatar";

export function DayPanel(props: {
  calendar: Calendar;
  date: string;
  onAddLeave: () => void;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const dayLeaves = calendar.leaves.filter(
    (l) => l.startDate <= date && date <= l.endDate,
  );
  const exceeded = stat?.exceeded ?? false;

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
          <span className={`badge ${exceeded ? "badge-negative" : "badge-positive"}`}>
            출타 {stat.count}명 / 허용 {stat.allowed}명
          </span>
          {exceeded && (
            <span className="caption" style={{ color: "var(--negative-deep)", fontWeight: 600 }}>
              출타율 초과
            </span>
          )}
        </div>
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
          {dayLeaves.map((l) => (
            <li
              key={l.id}
              style={{
                display: "flex",
                gap: "var(--sp-md)",
                alignItems: "center",
              }}
            >
              <Avatar name={l.userName} imageKey={l.userProfileImageKey} size={40} />
              <div style={{ minWidth: 0 }}>
                <p className="body-sm strong">
                  {l.userRankLabel} {l.userName}
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
          ))}
        </ul>
      )}

      <button type="button" className="btn btn-primary" onClick={props.onAddLeave}>
        이 날부터 휴가 등록
      </button>
    </div>
  );
}
