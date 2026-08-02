import {
  BALANCE_LABELS,
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
  /** 이 달과 겹치는 정기외박 주기들. 경계에 구분선을 긋는다. */
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
  const cycleStarts = useMemo(
    () => new Map((cycles ?? []).map((cycle) => [cycle.start, cycle.index])),
    [cycles],
  );

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
      {weeks.map((week, wi) => {
        const cycleStart = week.find(
          (cell) => cell.inMonth && cycleStarts.has(cell.date),
        );
        return (
          <div key={wi}>
            {cycleStart && (
              <div className="cal-cycle-divider" aria-hidden="true">
                <span className="cal-cycle-label">
                  정기외박 {cycleStarts.get(cycleStart.date)}주기
                </span>
              </div>
            )}
            <div className="cal-week" role="row">
              {week.map((cell) => {
                const stat = cell.inMonth
                  ? statByDate.get(cell.date)
                  : undefined;
                const isToday = cell.date === today;
                const isSelected = cell.date === selectedDate;
                const exceeded = stat?.exceeded ?? false;
                const dayNum = Number(cell.date.slice(8));
                const sunday = new Date(cell.date).getUTCDay() === 0;
                const holiday = cell.inMonth ? getHoliday(cell.date) : null;
                const names = (stat?.userIds ?? [])
                  .map((id) => namesById.get(id))
                  .filter((n): n is string => !!n);
                const mine = cell.inMonth
                  ? myLeaveDays?.get(cell.date)
                  : undefined;
                const inCycle =
                  cell.inMonth &&
                  currentCycle != null &&
                  currentCycle.start <= cell.date &&
                  cell.date <= currentCycle.end;

                return (
                  <button
                    key={cell.date}
                    type="button"
                    role="gridcell"
                    disabled={!cell.inMonth}
                    aria-selected={isSelected}
                    aria-label={
                      cell.inMonth
                        ? `${dayNum}일${holiday ? `, ${holiday}` : ""}${mine ? `, 내 ${BALANCE_LABELS[mine.key]}` : ""}, 휴가 ${stat?.count ?? 0}명${exceeded ? ", 최대 출타 인원 초과" : ""}`
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
                    {/* 내 휴가가 있는 날은 재원 칩, 없으면 부대 출타율. */}
                    {cell.inMonth && mine ? (
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
                    ) : (
                      cell.inMonth &&
                      stat &&
                      stat.count > 0 && (
                        <span
                          className={`cal-count ${exceeded ? "is-exceeded" : ""}`}
                        >
                          {stat.count}/{stat.allowed}
                        </span>
                      )
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
