import {
  buildMonthGrid,
  getHoliday,
  isWeekend,
  personalEventCellLabel,
  type ISODate,
} from "@leave/shared";
import {
  friendDayPeople,
  useFriendCalendar,
  usePersonalEvents,
  type FriendCalendar,
  type FriendDayPerson,
  type PersonalEvent,
} from "@leave/client";
import {
  forwardRef,
  memo,
  type CSSProperties,
  useCallback,
  useMemo,
} from "react";
import { MonthScroll, type CalendarScrollHandle } from "./CalendarScroll";

export function friendPersonColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 58% 38%)`;
}

export const FriendCalendarLegend = memo(function FriendCalendarLegend(props: {
  people: FriendCalendar["people"];
}) {
  return (
    <div className="friend-calendar-legend" aria-label="사람 구분">
      {props.people.map((person) => (
        <span key={person.userId} className="friend-calendar-legend-item">
          <i
            aria-hidden="true"
            className="friend-calendar-legend-dot"
            style={{ background: friendPersonColor(person.userId) }}
          />
          <strong>{person.isViewer ? "나" : person.name}</strong>
          {/* 공유를 끈 친구의 칸은 비어 있다. "휴가 없음"으로 읽히지 않게 밝혀 둔다. */}
          {person.leaveScheduleShared ? null : (
            <span className="caption text-mute">· 비공개</span>
          )}
        </span>
      ))}
      <span className="friend-calendar-legend-item">
        <i aria-hidden="true" className="friend-calendar-legend-outing" />
        <strong>외출</strong>
      </span>
      <span className="friend-calendar-legend-item">
        <i aria-hidden="true" className="friend-calendar-legend-personal" />
        <strong>개인 일정</strong>
      </span>
    </div>
  );
});

const FriendCalendarScrollImpl = forwardRef<
  CalendarScrollHandle,
  {
    friendIds: readonly string[];
    people: FriendCalendar["people"];
    selectedDate: ISODate | null;
    onSelectDate: (date: ISODate) => void;
  }
>(function FriendCalendarScroll(props, ref) {
  const renderMonth = useCallback(
    (month: string) => (
      <FriendMonthBlock
        friendIds={props.friendIds}
        month={month}
        selectedDate={
          props.selectedDate?.slice(0, 7) === month ? props.selectedDate : null
        }
        onSelectDate={props.onSelectDate}
      />
    ),
    [props.friendIds, props.onSelectDate, props.selectedDate],
  );

  return (
    <MonthScroll
      ref={ref}
      renderMonth={renderMonth}
      topContent={<FriendCalendarLegend people={props.people} />}
    />
  );
});

export const FriendCalendarScroll = memo(FriendCalendarScrollImpl);

const FriendMonthBlock = memo(function FriendMonthBlock(props: {
  friendIds: readonly string[];
  month: string;
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
}) {
  const calendar = useFriendCalendar(props.friendIds, props.month);
  const personalEvents = usePersonalEvents(props.month);

  if (calendar.isPending) {
    return (
      <div
        className="cal-month-loading"
        style={
          {
            "--cal-rows": buildMonthGrid(props.month).length,
          } as CSSProperties
        }
      >
        <div className="spinner" role="status" aria-label="불러오는 중" />
      </div>
    );
  }
  if (calendar.isError || !calendar.data) {
    return (
      <p className="cal-month-error">
        이 달을 불러오지 못했어요. 친구 관계를 확인해주세요.
      </p>
    );
  }

  return (
    <FriendMonthGrid
      month={props.month}
      calendar={calendar.data}
      events={personalEvents.data?.events ?? []}
      selectedDate={props.selectedDate}
      onSelectDate={props.onSelectDate}
    />
  );
});

const FriendMonthGrid = memo(function FriendMonthGrid(props: {
  month: string;
  calendar: FriendCalendar;
  events: PersonalEvent[];
  selectedDate: ISODate | null;
  onSelectDate: (date: ISODate) => void;
}) {
  const weeks = useMemo(() => buildMonthGrid(props.month), [props.month]);
  const personById = useMemo(
    () =>
      new Map(
        props.calendar.people.map((person) => [person.userId, person] as const),
      ),
    [props.calendar.people],
  );
  const leavesByDate = useMemo(() => {
    const result = new Map<ISODate, FriendDayPerson[]>();
    for (const cell of weeks.flat()) {
      if (!cell.inMonth) continue;
      result.set(cell.date, friendDayPeople(props.calendar.leaves, cell.date));
    }
    return result;
  }, [props.calendar.leaves, weeks]);
  const eventsByDate = useMemo(() => {
    const result = new Map<ISODate, PersonalEvent[]>();
    for (const cell of weeks.flat()) {
      if (!cell.inMonth) continue;
      result.set(
        cell.date,
        props.events.filter(
          (event) => event.startDate <= cell.date && cell.date <= event.endDate,
        ),
      );
    }
    return result;
  }, [props.events, weeks]);

  return (
    <div className="cal" role="grid" aria-label={`${props.month} 친구 달력`}>
      {weeks.map((week, index) => (
        <div className="cal-week" role="row" key={index}>
          {week.map((cell) => {
            const people = leavesByDate.get(cell.date) ?? [];
            const personal = eventsByDate.get(cell.date) ?? [];
            const holiday = cell.inMonth ? getHoliday(cell.date) : null;
            return (
              <button
                key={cell.date}
                type="button"
                role="gridcell"
                disabled={!cell.inMonth}
                aria-selected={props.selectedDate === cell.date}
                aria-label={
                  cell.inMonth
                    ? `${Number(cell.date.slice(8))}일, 휴가 ${
                        people
                          .map((person) => {
                            const name = personById.get(person.userId)?.name;
                            if (!name) return null;
                            // 외출도 같은 목록에 두되 무엇으로 나가는지는 밝힌다.
                            return person.kind === "outing"
                              ? `${name}(외출)`
                              : name;
                          })
                          .filter(Boolean)
                          .join(", ") || "없음"
                      }${personal.length ? `, 개인 일정 ${personal.map((event) => event.title).join(", ")}` : ""}`
                    : undefined
                }
                className={[
                  "cal-cell",
                  cell.inMonth ? "" : "is-out",
                  props.selectedDate === cell.date ? "is-selected" : "",
                ].join(" ")}
                onClick={() => cell.inMonth && props.onSelectDate(cell.date)}
              >
                <span
                  className={`cal-daynum ${
                    (isWeekend(cell.date) || holiday) && cell.inMonth
                      ? "is-red"
                      : ""
                  }`}
                >
                  {Number(cell.date.slice(8))}
                </span>
                {holiday ? (
                  <span className="cal-holiday" title={holiday}>
                    {holiday}
                  </span>
                ) : null}
                <span className="friend-calendar-people">
                  {people.slice(0, 4).map(({ userId, kind }) => {
                    const person = personById.get(userId);
                    const color = friendPersonColor(userId);
                    const outing = kind === "outing";
                    return (
                      <span
                        key={userId}
                        title={
                          person && outing
                            ? `${person.name} 외출`
                            : person?.name
                        }
                        className={`friend-calendar-person${outing ? " is-outing" : ""}`}
                        style={
                          outing
                            ? { borderColor: color, color }
                            : { background: color }
                        }
                      >
                        {person?.isViewer ? "나" : person?.name.slice(0, 1)}
                      </span>
                    );
                  })}
                  {people.length > 4 ? (
                    <span className="caption">+{people.length - 4}</span>
                  ) : null}
                </span>
                {personal.length ? (
                  <span
                    className="cal-personal"
                    title={personal.map((event) => event.title).join(", ")}
                  >
                    {personalEventCellLabel(personal)}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
});
