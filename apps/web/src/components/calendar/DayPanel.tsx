/**
 * 달력에서 날짜를 고르면 열리는 하루 요약 패널.
 * 출타율·공휴일·제한 기간을 알리고, 그날의 출타 명단(DayRoster)을 보여준다.
 */

import { ActionIcon } from "../ActionIcon";

import {
  availabilitySignal,
  fmtRangeTiny,
  getHoliday,
  segmentOnDate,
  type RegularOvernightCycle,
} from "@leave/shared";
import type { Calendar } from "@leave/client";
import { fmtDateK } from "@leave/shared";
import { OfficialDisclaimer } from "../OfficialDisclaimer";
import { DayRoster } from "./DayRoster";

export function DayPanel(props: {
  calendar: Calendar;
  date: string;
  onAddLeave: () => void;
  onPreloadAddLeave?: () => void;
  /** 출타 명단에서 내 행을 가려내는 데 쓴다. */
  myUserId?: string;
  /** 이 날이 속한 정기외박 주기. */
  cycle?: RegularOvernightCycle | null;
  /** 내 전역일. 이 날이 전역일이면 한 줄로 알린다. */
  dischargeAt?: string | null;
  /** 명단의 내 계획 행을 눌러 그 휴가로 갈 수 있게 한다. */
  onOpenLeave?: (leaveId: string) => void;
}) {
  const { calendar, date } = props;
  const stat = calendar.days.find((d) => d.date === date);
  const exceeded = stat?.exceeded ?? false;
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  // 이 그룹이 외출을 비율에서 빼는데 그날 명단에 외출이 있으면, 비율과 명단 인원이
  // 다르게 읽힌다. 왜 다른지 그 자리에서 말해 준다.
  const outingUncounted =
    calendar.unit.outingCounts === false &&
    calendar.attendees.some(
      (attendee) =>
        segmentOnDate(attendee.segments, date)?.category === "outing",
    );
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
        {date === props.dischargeAt && (
          <p
            className="caption"
            style={{ marginTop: 4, color: "var(--brand)", fontWeight: 700 }}
          >
            전역일
          </p>
        )}
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
          {outingUncounted && (
            <span className="caption text-mute">
              외출은 이 그룹 설정에서 출타율에 세지 않아요.
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

      <DayRoster
        attendees={calendar.attendees}
        date={date}
        myUserId={props.myUserId}
        onOpenLeave={props.onOpenLeave}
      />

      <button
        type="button"
        className="btn btn-primary"
        onMouseEnter={props.onPreloadAddLeave}
        onFocus={props.onPreloadAddLeave}
        onClick={props.onAddLeave}
      >
        <ActionIcon name="calendarAdd" />이 날부터 휴가 등록
      </button>
    </div>
  );
}
