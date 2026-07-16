import { todayInSeoul } from "@leave/shared";
import { useMemo } from "react";
import type { Calendar } from "../../api/queries";
import { buildMonthGrid, WEEKDAYS } from "../../lib/format";
import "./calendar.css";

export function MonthCalendar(props: {
  calendar: Calendar;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const { calendar, selectedDate, onSelectDate } = props;
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
    <div className="cal" role="grid" aria-label={`${calendar.month} 부대 휴가 달력`}>
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
      {weeks.map((week, wi) => (
        <div key={wi} className="cal-week" role="row">
          {week.map((cell) => {
            const stat = cell.inMonth ? statByDate.get(cell.date) : undefined;
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const exceeded = stat?.exceeded ?? false;
            const dayNum = Number(cell.date.slice(8));
            const sunday = new Date(cell.date).getUTCDay() === 0;
            const names = (stat?.userIds ?? [])
              .map((id) => namesById.get(id))
              .filter((n): n is string => !!n);

            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                disabled={!cell.inMonth}
                aria-selected={isSelected}
                aria-label={
                  cell.inMonth
                    ? `${dayNum}일, 휴가 ${stat?.count ?? 0}명${exceeded ? ", 출타율 초과" : ""}`
                    : undefined
                }
                className={[
                  "cal-cell",
                  cell.inMonth ? "" : "is-out",
                  exceeded ? "is-exceeded" : "",
                  isSelected ? "is-selected" : "",
                ].join(" ")}
                onClick={() => cell.inMonth && onSelectDate(cell.date)}
              >
                <span
                  className={[
                    "cal-daynum",
                    isToday ? "is-today" : "",
                    sunday && cell.inMonth ? "is-sunday" : "",
                    exceeded ? "is-exceeded" : "",
                  ].join(" ")}
                >
                  {dayNum}
                </span>
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
                {cell.inMonth && stat && stat.count > 0 && (
                  <span
                    className={`cal-count ${exceeded ? "is-exceeded" : ""}`}
                  >
                    {stat.count}/{stat.allowed}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
