/**
 * 웹 휴가 기간 선택기.
 *
 * 사용처: LeaveFormModal(휴가 등록/수정).
 *
 * `<input type="date">`를 쓰지 않는 이유는 두 가지다. 하나는 기간 — 시작일과 종료일을
 * 각각 고르게 하면 "언제부터 언제까지"가 한눈에 보이지 않는다. 다른 하나는 공휴일 —
 * 브라우저 기본 달력에는 한국 공휴일이 없어서, 휴가를 잡는 자리에서 "이 날이 쉬는
 * 날인가"를 확인하러 달력 화면으로 나갔다 와야 한다.
 *
 * 네이티브 `apps/native/src/components/date-picker.tsx`의 `DateRangePicker`와 같은
 * 규칙·같은 문구를 쓴다. 두 앱이 같은 날 같은 색을 보여야 한다.
 */

import {
  buildMonthGrid,
  fmtDateK,
  fmtDateShort,
  getHoliday,
  inclusiveDays,
  isWeekend,
  shiftMonth,
  todayInSeoul,
  WEEKDAYS,
} from "@leave/shared";
import { useState } from "react";
import "./date-range-picker.css";

function initialMonth(value?: string) {
  return (value || todayInSeoul()).slice(0, 7);
}

function CalendarPanel(props: {
  month: string;
  value: string;
  min?: string;
  rangeStart: string;
  rangeEnd: string;
  instruction: string;
  onChangeMonth: (month: string) => void;
  onSelect: (date: string) => void;
  testId?: string;
}) {
  const weeks = buildMonthGrid(props.month);
  const today = todayInSeoul();

  return (
    <div
      className="dp-calendar"
      data-testid={props.testId}
      // 테스트가 "다음 달"을 몇 번 눌러야 하는지 오늘 날짜로 역산하지 않게 한다.
      data-month={props.month}
    >
      <p className="dp-instruction" aria-live="polite">
        {props.instruction}
      </p>

      <div className="dp-month-nav">
        <button
          type="button"
          className="dp-month-button"
          aria-label="이전 달"
          onClick={() => props.onChangeMonth(shiftMonth(props.month, -1))}
          data-testid={props.testId ? `${props.testId}-prev` : undefined}
        >
          ‹
        </button>
        <span className="dp-month-title" aria-live="polite">
          {props.month.slice(0, 4)}년 {Number(props.month.slice(5))}월
        </span>
        <button
          type="button"
          className="dp-month-button"
          aria-label="다음 달"
          onClick={() => props.onChangeMonth(shiftMonth(props.month, 1))}
          data-testid={props.testId ? `${props.testId}-next` : undefined}
        >
          ›
        </button>
      </div>

      <div
        className="dp-grid"
        role="grid"
        aria-label={`${props.month} 날짜 선택`}
      >
        <div className="dp-week" role="row">
          {WEEKDAYS.map((weekday, index) => (
            <div
              key={weekday}
              role="columnheader"
              className={`dp-weekday ${index === 0 || index === 6 ? "is-red" : ""}`}
            >
              {weekday}
            </div>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0]?.date} className="dp-week" role="row">
            {week.map((cell) => {
              const disabled =
                !cell.inMonth || Boolean(props.min && cell.date < props.min);
              const selected = cell.date === props.value;
              const rangeEdge =
                cell.date === props.rangeStart || cell.date === props.rangeEnd;
              const inRange = Boolean(
                props.rangeStart &&
                props.rangeEnd &&
                props.rangeStart <= cell.date &&
                cell.date <= props.rangeEnd,
              );
              const holiday = cell.inMonth ? getHoliday(cell.date) : null;
              // 달력 화면과 같은 규칙 — 주말과 공휴일을 한 가지 "빨간 날"로 묶는다.
              const red =
                cell.inMonth && (isWeekend(cell.date) || holiday != null);

              return (
                <button
                  key={cell.date}
                  type="button"
                  role="gridcell"
                  disabled={disabled}
                  aria-selected={selected || rangeEdge}
                  aria-label={
                    cell.inMonth
                      ? `${fmtDateK(cell.date)}${holiday ? `, ${holiday}` : ""}${
                          cell.date === today ? ", 오늘" : ""
                        }`
                      : undefined
                  }
                  className={[
                    "dp-day",
                    inRange ? "is-in-range" : "",
                    cell.date === today && !selected && !rangeEdge
                      ? "is-today"
                      : "",
                    selected || rangeEdge ? "is-selected" : "",
                  ].join(" ")}
                  onClick={() => props.onSelect(cell.date)}
                  data-testid={
                    props.testId && cell.inMonth
                      ? `${props.testId}-day-${cell.date}`
                      : undefined
                  }
                >
                  <span
                    className={`dp-day-num ${red ? "is-red" : ""} ${
                      cell.inMonth ? "" : "is-out"
                    }`}
                  >
                    {Number(cell.date.slice(8))}
                  </span>
                  {/* 이름이 없는 날도 자리는 남긴다 — 이름 있는 날만 키우면 그 주만
                      날짜 숫자가 위로 밀려 한 줄 안에서 높이가 어긋난다. */}
                  <span className="dp-day-holiday">{holiday ?? ""}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 달력 하나로 시작일과 종료일을 차례로 고른다. 시작일을 고르면 곧바로 종료일
 * 선택으로 넘어가, 좁은 화면에서도 피커가 둘로 갈라지지 않는다.
 */
export function DateRangePicker(props: {
  startDate: string;
  endDate: string;
  onChange: (startDate: string, endDate: string) => void;
  /**
   * 시작일만 옮겼을 때 부를 것. 주면 시작일 선택이 종료일을 건드리지 않는다.
   *
   * 휴가 폼이 이걸 준다 — 거기서는 길이를 종류별 개수가 정하므로, 시작일을
   * 옮기는 것은 휴가를 통째로 미는 일이지 기간을 다시 그리는 일이 아니다.
   * 주지 않으면 기존대로 종료일을 함께 보정한다(제한 기간 등록).
   */
  onChangeStart?: (startDate: string) => void;
  testId?: string;
}) {
  const [active, setActive] = useState<"start" | "end" | null>(null);
  const [month, setMonth] = useState(() =>
    initialMonth(props.startDate || props.endDate || undefined),
  );
  const validRange = Boolean(
    props.startDate && props.endDate && props.startDate <= props.endDate,
  );
  const duration = validRange
    ? inclusiveDays(props.startDate, props.endDate)
    : 0;

  const openField = (field: "start" | "end") => {
    if (field === "end" && !props.startDate) return;
    if (active === field) {
      setActive(null);
      return;
    }
    const value = field === "start" ? props.startDate : props.endDate;
    setMonth(initialMonth(value || props.startDate || undefined));
    setActive(field);
  };

  return (
    <div
      className="dp-root"
      data-testid={props.testId}
      // Esc는 달력만 닫는다. 막지 않으면 Modal이 document에 걸어 둔 keydown이
      // 받아서 작성 중인 휴가 폼째로 닫힌다.
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !active) return;
        event.stopPropagation();
        setActive(null);
      }}
    >
      <div className="dp-header">
        <span className="dp-title">휴가 기간</span>
        {duration > 0 && <span className="dp-duration">{duration}일</span>}
      </div>

      <div className="dp-inputs">
        <button
          type="button"
          className={`dp-input ${active === "start" ? "is-active" : ""}`}
          aria-expanded={active === "start"}
          aria-label={`시작일, ${props.startDate ? fmtDateK(props.startDate) : "날짜 선택"}`}
          onClick={() => openField("start")}
          data-testid={props.testId ? `${props.testId}-start` : undefined}
        >
          <span className="dp-input-label">시작일</span>
          <span
            className={`dp-input-value ${props.startDate ? "" : "is-placeholder"}`}
          >
            {props.startDate ? fmtDateShort(props.startDate) : "날짜 선택"}
          </span>
          {props.startDate && (
            <span className="dp-input-year">
              {props.startDate.slice(0, 4)}년
            </span>
          )}
        </button>

        <button
          type="button"
          className={`dp-input ${active === "end" ? "is-active" : ""}`}
          disabled={!props.startDate}
          aria-expanded={active === "end"}
          aria-label={`종료일, ${props.endDate ? fmtDateK(props.endDate) : "날짜 선택"}`}
          onClick={() => openField("end")}
          data-testid={props.testId ? `${props.testId}-end` : undefined}
        >
          <span className="dp-input-label">종료일</span>
          <span
            className={`dp-input-value ${props.endDate ? "" : "is-placeholder"}`}
          >
            {props.endDate ? fmtDateShort(props.endDate) : "날짜 선택"}
          </span>
          {props.endDate && (
            <span className="dp-input-year">{props.endDate.slice(0, 4)}년</span>
          )}
        </button>
      </div>

      {active && (
        <CalendarPanel
          month={month}
          value={active === "start" ? props.startDate : props.endDate}
          min={active === "end" ? props.startDate || undefined : undefined}
          rangeStart={props.startDate}
          rangeEnd={props.endDate}
          instruction={
            active === "start"
              ? "휴가가 시작하는 날을 선택해주세요."
              : "마지막 휴가 날짜를 선택해주세요."
          }
          onChangeMonth={setMonth}
          onSelect={(date) => {
            if (active === "start") {
              if (props.onChangeStart) {
                // 길이가 이미 정해져 있으므로 고를 것이 남지 않는다.
                props.onChangeStart(date);
                setMonth(date.slice(0, 7));
                setActive(null);
                return;
              }
              // 시작일이 종료일을 넘어서면 종료일을 함께 끌고 간다.
              const nextEnd =
                !props.endDate || props.endDate < date ? date : props.endDate;
              props.onChange(date, nextEnd);
              setMonth(date.slice(0, 7));
              setActive("end");
              return;
            }
            props.onChange(props.startDate || date, date);
            setActive(null);
          }}
          testId={props.testId ? `${props.testId}-calendar` : undefined}
        />
      )}
    </div>
  );
}
