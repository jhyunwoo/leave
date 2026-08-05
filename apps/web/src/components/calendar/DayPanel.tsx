import {
  availabilitySignal,
  BALANCE_LABELS,
  fmtRangeTiny,
  getHoliday,
  segmentBalanceKey,
  segmentOnDate,
  type RegularOvernightCycle,
} from "@leave/shared";
import type { Calendar } from "../../api/queries";
import { fmtDateK, fmtRange } from "../../lib/format";
import { OfficialDisclaimer } from "../OfficialDisclaimer";

export function DayPanel(props: {
  calendar: Calendar;
  date: string;
  onAddLeave: () => void;
  /** 이전 응답과의 호출 호환용. 서버는 이제 내 일정 상세만 내려준다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  // 서버가 타인의 일정 상세를 내려주지 않으므로 여기 남는 건 전부 내 계획이다.
  const dayLeaves = calendar.leaves.filter(
    (l) => l.startDate <= date && date <= l.endDate,
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

      {dayLeaves.length === 0 ? (
        <div
          className="card-sage"
          style={{ textAlign: "center", padding: "var(--sp-2xl) var(--sp-lg)" }}
        >
          <p className="body-sm text-body">공유된 내 계획이 아직 없어요.</p>
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
          <div className="card-sage" style={{ padding: "var(--sp-md)" }}>
            <p className="body-sm strong">다른 참여자는 집계로만 표시</p>
            <p className="caption text-mute" style={{ marginTop: 2 }}>
              사회적 압력을 줄이기 위해 이름·계급·일정 상세·사유는 내려받지
              않아요.
            </p>
          </div>
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
              return (
                <li
                  key={l.id}
                  style={{
                    background: "var(--primary-pale, #e2f6d5)",
                    borderRadius: "var(--r-lg)",
                    padding: "var(--sp-sm)",
                    minWidth: 0,
                  }}
                >
                  <p className="body-sm strong">
                    내 계획
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
