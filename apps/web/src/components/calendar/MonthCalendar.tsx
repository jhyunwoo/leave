/**
 * 한 달치 달력 그리드.
 *
 * 사용처: CalendarScroll(웹 달력 화면).
 *
 * 셀 하나가 보여주는 것은 두 가지 중 하나다.
 *  - 내 휴가가 있는 날 → 재원 색 칩(확정/희망을 테두리로 구분)
 *  - 그 밖의 날       → 그룹 출타율 신호(여유·보통·임박·초과)
 *
 * 부대 통계(`days`·`unitEvents`)는 **없을 수 있다.** 부대에 가입하지 않은 사용자도
 * 달력을 쓰기 때문이다 — 그때는 출타율 칩과 부대 일정만 빠지고 내 휴가·개인 일정·
 * 전역일·주기 표시는 그대로 그린다. 그래서 이 컴포넌트는 부대 달력 응답 전체가
 * 아니라 필요한 조각만 받는다(응답 타입은 `unit`을 필수로 갖고 있어 빈 값을 만들 수 없다).
 *
 * 주기 표시가 재원마다 다르다.
 *  - 정기외박: 날짜 아래에 주기별 색 선. 주기 경계를 이어서 보여준다.
 *  - 외출: **주기 시작일 하루에만 마커.** 색 체계가 둘이 되면 어느 색이 무엇인지
 *    읽을 수 없어, 외출은 "이 날 새 주기가 열렸다"만 날짜 옆에 적는다.
 */
import {
  availabilitySignal,
  BALANCE_LABELS,
  cycleColor,
  getHoliday,
  isWeekend,
  outingBalanceKey,
  todayInSeoul,
  type OutingKind,
  type LeaveCycle,
  type RegularOvernightCycle,
} from "@leave/shared";
import { useMemo } from "react";
import type { CalendarDay, PersonalEvent, UnitEvent } from "@leave/client";
import { buildMonthGrid, WEEKDAYS } from "@leave/shared";
import type { MyLeaveDay } from "@leave/client";
import "./calendar.css";

/** 그 날짜에 열리는 외출 주기 하나. 갈래를 알아야 몇 회인지 말할 수 있다. */
export type OutingCycleStart = { kind: OutingKind; cycle: LeaveCycle };

export function MonthCalendar(props: {
  month: string;
  /** 부대 일별 출타 통계. 부대가 없으면 넘기지 않는다 — 출타율 칩이 빠진다. */
  days?: CalendarDay[];
  /** 부대 관리자가 등록한 일정. 부대가 없으면 넘기지 않는다. */
  unitEvents?: UnitEvent[];
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
  /** 이 달에 **시작하는** 외출 주기들. 그 날짜에만 마커를 찍는다. */
  outingCycleStarts?: OutingCycleStart[];
  /** 내 전역일. 그날 칸에 배지를 달고, 다음 날부터는 주기 표시를 멈춘다. */
  dischargeAt?: string | null;
  personalEvents?: PersonalEvent[];
}) {
  const {
    month,
    days,
    unitEvents: allUnitEvents,
    selectedDate,
    onSelectDate,
    hideWeekdays,
    myLeaveDays,
    cycles,
    currentCycle,
    outingCycleStarts,
    dischargeAt,
    personalEvents,
  } = props;
  const today = todayInSeoul();
  const weeks = useMemo(() => buildMonthGrid(month), [month]);
  const statByDate = useMemo(
    () => new Map((days ?? []).map((d) => [d.date, d])),
    [days],
  );
  /** 날짜 → 그날 열리는 외출 주기들. 한 날에 두 갈래가 함께 열릴 수 있다. */
  const outingStartsByDate = useMemo(() => {
    const map = new Map<string, OutingCycleStart[]>();
    for (const entry of outingCycleStarts ?? []) {
      const list = map.get(entry.cycle.start);
      if (list) list.push(entry);
      else map.set(entry.cycle.start, [entry]);
    }
    return map;
  }, [outingCycleStarts]);
  return (
    <div className="cal" role="grid" aria-label={`${month} 부대 휴가 달력`}>
      {!hideWeekdays && (
        <div className="cal-weekdays" role="row">
          {WEEKDAYS.map((w, i) => (
            <div
              key={w}
              role="columnheader"
              className={`cal-weekday ${i === 0 || i === 6 ? "is-red" : ""}`}
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
            // 절대 인원 대신 상태 신호만 보여준다. 누가 나가는지도 드러내지 않는다.
            const signal = stat
              ? availabilitySignal(stat.count, stat.allowed)
              : null;
            const isToday = cell.date === today;
            const isSelected = cell.date === selectedDate;
            const exceeded = signal?.key === "exceeded";
            // 블랙아웃은 출타율과 무관하게 제한될 수 있는 날이다.
            const blocked = stat?.blocked ?? false;
            const dayNum = Number(cell.date.slice(8));
            const weekend = isWeekend(cell.date);
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            const unitEvents = cell.inMonth
              ? (allUnitEvents ?? []).filter(
                  (event) =>
                    event.startDate <= cell.date && cell.date <= event.endDate,
                )
              : [];
            const hasUnitHoliday = unitEvents.some((event) => event.isHoliday);
            const eventLabel = unitEvents.length
              ? `${unitEvents[0]!.title}${unitEvents.length > 1 ? ` +${unitEvents.length - 1}` : ""}`
              : null;
            const calendarLabel = [holiday, eventLabel]
              .filter(Boolean)
              .join(" · ");
            const mine = cell.inMonth ? myLeaveDays?.get(cell.date) : undefined;
            const personal = cell.inMonth
              ? (personalEvents?.filter(
                  (event) =>
                    event.startDate <= cell.date && cell.date <= event.endDate,
                ) ?? [])
              : [];
            const isDischarge =
              cell.inMonth && dischargeAt != null && cell.date === dischargeAt;
            // 전역한 뒤의 주기는 받을 일도 쓸 일도 없어 아예 그리지 않는다.
            const pastDischarge =
              dischargeAt != null && cell.date > dischargeAt;
            const inCycle =
              cell.inMonth &&
              !pastDischarge &&
              currentCycle != null &&
              currentCycle.start <= cell.date &&
              cell.date <= currentCycle.end;
            // 이 날이 속한 정기외박 주기. 칸 아래 얇은 색 선으로 표시한다.
            const cycle =
              cell.inMonth && !pastDischarge
                ? cycles?.find(
                    (c) => c.start <= cell.date && cell.date <= c.end,
                  )
                : undefined;
            // 이 날 열리는 외출 주기. 정기외박과 달리 기간을 칠하지 않고 시작일에만 찍는다.
            const outingStarts =
              cell.inMonth && !pastDischarge
                ? (outingStartsByDate.get(cell.date) ?? [])
                : [];
            const outingLabel = outingStarts
              .map(
                (entry) =>
                  `${BALANCE_LABELS[outingBalanceKey(entry.kind)]} ${entry.cycle.index}주기 시작 · ${entry.cycle.grantDays}회 적립`,
              )
              .join(", ");

            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                data-testid={`cal-cell-${cell.date}`}
                disabled={!cell.inMonth}
                aria-selected={isSelected}
                aria-label={
                  cell.inMonth
                    ? // 출타 관련 문구는 부대가 있을 때만 붙인다. 부대가 없으면
                      // 셀 자체에 출타 정보가 없으므로 "기준 미설정"이라고 말하면
                      // 설정만 하면 되는 것처럼 들린다.
                      `${dayNum}일${isDischarge ? ", 전역일" : ""}${holiday ? `, ${holiday}` : ""}${cycle ? `, 정기외박 ${cycle.index}주기` : ""}${outingLabel ? `, ${outingLabel}` : ""}${mine ? `, 내 ${BALANCE_LABELS[mine.key]} ${mine.isDraft ? "초안" : mine.isConfirmed ? "확정" : "희망"}` : ""}${unitEvents.length ? `, 부대 일정 ${unitEvents.map((event) => event.title).join(", ")}` : ""}${personal.length ? `, 개인 일정 ${personal.length}개` : ""}${
                        signal
                          ? `, ${
                              signal.percent == null
                                ? "출타 기준 미설정"
                                : `출타율 ${signal.percent}퍼센트, ${signal.label}`
                            }`
                          : ""
                      }${blocked ? ", 제한 가능 기간" : ""}`
                    : undefined
                }
                className={[
                  "cal-cell",
                  cell.inMonth ? "" : "is-out",
                  inCycle ? "is-in-cycle" : "",
                  exceeded ? "is-exceeded" : "",
                  isDischarge ? "is-discharge" : "",
                  isSelected ? "is-selected" : "",
                ].join(" ")}
                onClick={() => cell.inMonth && onSelectDate(cell.date)}
              >
                {/* 날짜 줄. 외출 주기 마커는 이 줄의 남는 오른쪽 자리를 쓴다 —
                    칸 높이(92px)가 꽉 차 있어 줄을 늘리면 그 달 마지막 주가 잘린다. */}
                <span className="cal-daynum-row">
                  <span
                    className={[
                      "cal-daynum",
                      isToday ? "is-today" : "",
                      (weekend || holiday || hasUnitHoliday) && cell.inMonth
                        ? "is-red"
                        : "",
                      exceeded ? "is-exceeded" : "",
                    ].join(" ")}
                  >
                    {dayNum}
                  </span>
                  {outingStarts.map((entry) => (
                    <span
                      key={entry.kind}
                      className="cal-outing-start"
                      data-balance={outingBalanceKey(entry.kind)}
                      title={outingLabel}
                    >
                      <i className="cal-outing-word">
                        {entry.kind === "weekend" ? "주말" : "외출"}
                      </i>
                      <b className="cal-outing-count">
                        +{entry.cycle.grantDays}
                      </b>
                    </span>
                  ))}
                  {/* 칸이 아주 좁으면(휴대폰) 알약 두 개가 들어갈 자리가 없다.
                      한쪽을 말없이 버리는 대신 갈래마다 점 하나로 줄인다 — 몇 개가
                      열렸는지는 남고, 횟수는 title·aria-label과 날짜 상세에 있다.
                      어느 쪽을 보여줄지는 CSS가 칸 너비로 고른다. */}
                  {outingStarts.length > 0 && (
                    <span className="cal-outing-dots" title={outingLabel}>
                      {outingStarts.map((entry) => (
                        <i
                          key={entry.kind}
                          className="cal-outing-dot"
                          data-balance={outingBalanceKey(entry.kind)}
                        />
                      ))}
                    </span>
                  )}
                </span>
                {/* 전역 배지와 공휴일 이름은 한 자리를 나눠 쓴다 — 칸 높이(92px)가
                    꽉 차 있어 줄을 늘리면 그 달 마지막 주가 잘린다. 겹치는 날에는
                    전역이 이기고, 공휴일 이름은 날짜 상세에서 그대로 보인다. */}
                {(isDischarge || calendarLabel) && (
                  <span
                    className={[
                      "cal-holiday",
                      isDischarge ? "is-discharge" : "",
                      !isDischarge && !holiday && !hasUnitHoliday
                        ? "is-unit-event"
                        : "",
                    ].join(" ")}
                    title={
                      isDischarge
                        ? "전역일"
                        : [holiday, ...unitEvents.map((event) => event.title)]
                            .filter(Boolean)
                            .join(", ")
                    }
                  >
                    {isDischarge ? "전역" : calendarLabel}
                  </span>
                )}
                {/* 내 휴가가 있는 날은 재원 칩을 먼저 깔고, */}
                {cell.inMonth && mine && (
                  <span
                    className={[
                      "cal-mine",
                      // 색만으로 구분하지 않도록 확정은 실선, 희망은 점선 테두리.
                      mine.isConfirmed ? "is-confirmed" : "is-tentative",
                      mine.isSegmentStart ? "" : "is-joined-left",
                      mine.isSegmentEnd ? "" : "is-joined-right",
                    ].join(" ")}
                    data-balance={mine.key}
                  >
                    {mine.isSegmentStart
                      ? `${mine.isDraft ? "초안 " : ""}${BALANCE_LABELS[mine.key]}`
                      : ""}
                  </span>
                )}
                {personal.length > 0 && (
                  <span
                    className="cal-personal"
                    title={personal.map((event) => event.title).join(", ")}
                  >
                    개인{personal.length > 1 ? ` ${personal.length}` : ""}
                  </span>
                )}
                {/* 혼잡도는 날짜를 열어보지 않아도 되게 늘 보여준다.
                    색만으로 구분하지 않도록 라벨과 비율을 함께 적는다. */}
                {cell.inMonth && blocked && (
                  <span className="cal-count is-blocked">제한</span>
                )}
                {cell.inMonth && signal && (
                  <span
                    className={[
                      "cal-count",
                      signal.percent === 0 ? "is-empty" : "",
                      signal.key === "near" ? "is-near" : "",
                      exceeded ? "is-exceeded" : "",
                    ].join(" ")}
                  >
                    {/* 좁은 화면에서는 칸이 47px까지 줄어 "여유 20%"가 통째로
                        잘린다. 낱말과 비율을 나눠 두고 CSS가 낱말만 감춘다 —
                        비율은 색이 아닌 정보라 그것만 남아도 색에만 기대지
                        않는다는 원칙은 지켜지고, 위 aria-label은 늘 온전하다.
                        비율이 없는 날은 낱말이 유일한 내용이라 그대로 둔다. */}
                    {signal.percent == null ? (
                      signal.label
                    ) : (
                      <>
                        <i className="cal-count-word">{signal.label}</i>
                        <b className="cal-count-pct">{signal.percent}%</b>
                      </>
                    )}
                  </span>
                )}
                {/* 주기 표시선 — 같은 주기는 같은 색으로 이어져 한 줄처럼 보인다. */}
                {cycle && (
                  <span
                    aria-hidden="true"
                    className={[
                      "cal-cycle-bar",
                      cell.date === cycle.start ? "is-cycle-start" : "",
                      // 전역일에서 잘린 주기도 뚝 끊기지 않고 둥글게 닫는다.
                      cell.date === cycle.end || isDischarge
                        ? "is-cycle-end"
                        : "",
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
