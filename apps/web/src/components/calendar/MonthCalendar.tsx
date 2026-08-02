import {
  BALANCE_LABELS,
  cycleColor,
  getHoliday,
  todayInSeoul,
  type RegularOvernightCycle,
} from "@leave/shared";
import { useMemo } from "react";
import type { Calendar } from "../../api/queries";
import { buildMonthGrid, WEEKDAYS } from "../../lib/format";
import type { MyLeaveDay } from "../../lib/my-leave-days";
import "./calendar.css";

export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
  /** 스크롤 달력처럼 요일 헤더를 위에서 한 번만 그릴 때 true. */
  hideWeekdays?: boolean;
  /** 날짜 → 내 휴가 재원. 있으면 출타율 대신 재원 칩을 그린다. */
  myLeaveDays?: Map<string, MyLeaveDay>;
  /** 이 달과 겹치는 정기외박 주기들. 각 날짜 아래에 주기별 색 선을 깐다. */
  cycles?: RegularOvernightCycle[];
  /** 오늘이 속한 정기외박 주기. 해당 날짜 칸에 옅은 배경을 깐다. */
  currentCycle?: RegularOvernightCycle | null;
}) {
  const {
    calendar,
    selectedDate,
    onSelectDate,
    hideWeekdays,
    myLeaveDays,
    cycles,
    currentCycle,
  } = props;
  const today = todayInSeoul();
  const weeks = useMemo(() => buildMonthGrid(calendar.month), [calendar.month]);
  const statByDate = useMemo(
    () => new Map(calendar.days.map((d) => [d.date, d])),
    [calendar.days],
  );
  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const l of calendar.leaves) map.set(l.userId, l.userName);
    return map;
  }, [calendar.leaves]);

  return (
    <div
      className="cal"
      role="grid"
      aria-label={`${calendar.month} 부대 휴가 달력`}
    >
      {!hideWeekdays && (
        <div className="cal-weekdays" role="row">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              role="columnheader"
              className={`cal-weekday ${i === 0 ? "is-sunday" : ""}`}
            >
              {w}
            </div>
          ))}
        </div>
      )}
      {weeks.map((week, wi) => (
        <div key={wi} className="cal-week" role="row">
          {week.map((cell) => {
            const stat = cell.inMonth ? statByDate.get(cell.date) : undefined;
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const exceeded = stat?.exceeded ?? false;
            const dayNum = Number(cell.date.slice(8));
            const sunday = new Date(cell.date).getUTCDay() === 0;
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            const names = (stat?.userIds ?? [])
              .map((id) => namesById.get(id))
              .filter((n): n is string => !!n);
            const mine = cell.inMonth ? myLeaveDays?.get(cell.date) : undefined;
            const inCycle =
              cell.inMonth &&
              currentCycle != null &&
              currentCycle.start <= cell.date &&
              cell.date <= currentCycle.end;
            // 이 날이 속한 정기외박 주기. 칸 아래 얇은 색 선으로 표시한다.
            const cycle = cell.inMonth
              ? cycles?.find((c) => c.start <= cell.date && cell.date <= c.end)
              : undefined;

            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                disabled={!cell.inMonth}
                aria-selected={isSelected}
                aria-label={
                  cell.inMonth
                    ? `${dayNum}일${holiday ? `, ${holiday}` : ""}${cycle ? `, 정기외박 ${cycle.index}주기` : ""}${mine ? `, 내 ${BALANCE_LABELS[mine.key]}` : ""}, 출타 ${stat?.count ?? 0}명 허용 ${stat?.allowed ?? 0}명${exceeded ? ", 최대 출타 인원 초과" : ""}`
                    : undefined
                }
                className={[
                  "cal-cell",
                  cell.inMonth ? "" : "is-out",
                  inCycle ? "is-in-cycle" : "",
                  exceeded ? "is-exceeded" : "",
                  isSelected ? "is-selected" : "",
                ].join(" ")}
                onClick={() => cell.inMonth && onSelectDate(cell.date)}
              >
                <span
                  className={[
                    "cal-daynum",
                    isToday ? "is-today" : "",
                    (sunday || holiday) && cell.inMonth ? "is-sunday" : "",
                    exceeded ? "is-exceeded" : "",
                  ].join(" ")}
                >
                  {dayNum}
                </span>
                {holiday && (
                  <span className="cal-holiday" title={holiday}>
                    {holiday}
                  </span>
                )}
                {cell.inMonth && names.length > 0 && (
                  <span className="cal-chips">
                    {names.slice(0, 2).map((n) => (
                      <span
                        key={n}
                        className={`cal-chip ${exceeded ? "is-exceeded" : ""}`}
                      >
                        {n}
                      </span>
                    ))}
                    {names.length > 2 && (
                      <span className="cal-chip is-more">
                        +{names.length - 2}
                      </span>
                    )}
                  </span>
                )}
                {/* 내 휴가가 있는 날은 재원 칩을 먼저 깔고, */}
                {cell.inMonth && mine && (
                  <span
                    className={[
                      "cal-mine",
                      mine.isSegmentStart ? "" : "is-joined-left",
                      mine.isSegmentEnd ? "" : "is-joined-right",
                    ].join(" ")}
                    data-balance={mine.key}
                  >
                    {mine.isSegmentStart ? BALANCE_LABELS[mine.key] : ""}
                  </span>
                )}
                {/* 부대 출타 인원은 날짜를 열어보지 않아도 되게 늘 보여준다.
                    아무도 안 나간 날은 흐리게 깔아 그리드를 조용히 둔다. */}
                {cell.inMonth && stat && (
                  <span
                    className={[
                      "cal-count",
                      stat.count === 0 ? "is-empty" : "",
                      exceeded ? "is-exceeded" : "",
                    ].join(" ")}
                  >
                    {stat.count}/{stat.allowed}
                  </span>
                )}
                {/* 주기 표시선 — 같은 주기는 같은 색으로 이어져 한 줄처럼 보인다. */}
                {cycle && (
                  <span
                    aria-hidden="true"
                    className={[
                      "cal-cycle-bar",
                      cell.date === cycle.start ? "is-cycle-start" : "",
                      cell.date === cycle.end ? "is-cycle-end" : "",
                    ].join(" ")}
                    style={{ background: cycleColor(cycle.index) }}
                  />
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
