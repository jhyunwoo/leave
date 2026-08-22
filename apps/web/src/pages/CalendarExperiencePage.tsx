import {
  buildMonthGrid,
  cycleForDisplay,
  cycleUsedDays,
  diffDays,
  firstGrantDate,
  fmtDateShort,
  fmtRangeTiny,
  getHoliday,
  isConfirmedLeaveStatus,
  isWeekend,
  maxAllowedOut,
  normalizeFriendIds,
  shiftMonth,
  splitMonth,
  todayInSeoul,
  WEEKDAYS,
} from "@leave/shared";
import {
  buildMyLeaveDayMap,
  useCalendar,
  useFriendCalendar,
  useFriends,
  useLeaveBalances,
  useMyLeaves,
  usePersonalEvents,
  type FriendCalendar,
  type LeaveResult,
  type Me,
  type PersonalEvent,
} from "@leave/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router";
import type { CalendarScrollHandle } from "../components/calendar/CalendarScroll";
import { CalendarScroll } from "../components/calendar/CalendarScroll";
import { DayPanel } from "../components/calendar/DayPanel";
import {
  LazyLeaveFormModal,
  preloadLeaveFormModal,
} from "../components/LazyLeaveFormModal";
import { Modal } from "../components/Modal";
import { PersonalEventModal } from "../components/PersonalEventModal";
import "../components/calendar/calendar.css";

function personColor(userId: string): string {
  let hash = 0;
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return `hsl(${hash} 58% 38%)`;
}

function PersonalItems(props: {
  events: PersonalEvent[];
  date: string;
  onEdit: (event: PersonalEvent) => void;
  onAdd: () => void;
}) {
  const events = props.events.filter(
    (event) => event.startDate <= props.date && props.date <= event.endDate,
  );
  return (
    <section
      className="card"
      style={{ padding: "var(--sp-lg)", display: "grid", gap: "var(--sp-sm)" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <h2 className="display-xs">개인 일정</h2>
        <button className="btn btn-secondary btn-sm" onClick={props.onAdd}>
          추가
        </button>
      </div>
      {events.length ? (
        events.map((event) => (
          <button
            type="button"
            key={event.id}
            className="btn btn-secondary"
            style={{
              justifyContent: "flex-start",
              whiteSpace: "normal",
              textAlign: "left",
            }}
            onClick={() => props.onEdit(event)}
          >
            <span aria-hidden="true">◇</span>
            <span>
              <strong>{event.title}</strong>
              {event.startTime ? (
                <span className="caption text-mute">
                  {" "}
                  · {event.startTime}
                  {event.endTime ? `–${event.endTime}` : ""}
                </span>
              ) : null}
            </span>
          </button>
        ))
      ) : (
        <p className="text-body">이 날의 개인 일정이 없어요.</p>
      )}
    </section>
  );
}

function ComparisonMonth(props: {
  month: string;
  calendar?: FriendCalendar;
  events: PersonalEvent[];
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const { year, monthNum } = splitMonth(props.month);
  const people = props.calendar?.people ?? [];
  const personById = new Map(people.map((person) => [person.userId, person]));
  return (
    <div>
      <h2 className="display-xs" style={{ marginBottom: "var(--sp-md)" }}>
        {year}년 {monthNum}월
      </h2>
      <div
        className="cal"
        role="grid"
        aria-label={`${year}년 ${monthNum}월 친구 달력`}
      >
        <div className="cal-weekdays" role="row">
          {WEEKDAYS.map((weekday, index) => (
            <div
              key={weekday}
              role="columnheader"
              className={`cal-weekday ${index === 0 || index === 6 ? "is-red" : ""}`}
            >
              {weekday}
            </div>
          ))}
        </div>
        {buildMonthGrid(props.month).map((week, index) => (
          <div className="cal-week" role="row" key={index}>
            {week.map((cell) => {
              const dayLeaves =
                props.calendar?.leaves.filter(
                  (leave) =>
                    leave.startDate <= cell.date && cell.date <= leave.endDate,
                ) ?? [];
              const personal = props.events.filter(
                (event) =>
                  event.startDate <= cell.date && cell.date <= event.endDate,
              );
              const uniquePeople = [
                ...new Set(dayLeaves.map((leave) => leave.userId)),
              ];
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
                          uniquePeople
                            .map((id) => personById.get(id)?.name)
                            .filter(Boolean)
                            .join(", ") || "없음"
                        }, 개인 일정 ${personal.length}개`
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
                    className={`cal-daynum ${(isWeekend(cell.date) || holiday) && cell.inMonth ? "is-red" : ""}`}
                  >
                    {Number(cell.date.slice(8))}
                  </span>
                  {holiday ? (
                    <span className="cal-holiday" title={holiday}>
                      {holiday}
                    </span>
                  ) : null}
                  <span
                    style={{
                      display: "flex",
                      gap: 3,
                      flexWrap: "wrap",
                      overflow: "hidden",
                      maxHeight: 36,
                    }}
                  >
                    {uniquePeople.slice(0, 4).map((userId) => {
                      const person = personById.get(userId);
                      return (
                        <span
                          key={userId}
                          title={person?.name}
                          style={{
                            minWidth: 22,
                            height: 22,
                            padding: "0 4px",
                            borderRadius: 11,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "white",
                            background: personColor(userId),
                            fontSize: 10,
                            fontWeight: 800,
                          }}
                        >
                          {person?.isViewer ? "나" : person?.name.slice(0, 1)}
                        </span>
                      );
                    })}
                    {uniquePeople.length > 4 ? (
                      <span className="caption">
                        +{uniquePeople.length - 4}
                      </span>
                    ) : null}
                  </span>
                  {personal.length ? (
                    <span className="cal-personal">
                      개인{personal.length > 1 ? ` ${personal.length}` : ""}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FriendSelector(props: {
  selected: string[];
  onSave: (ids: string[]) => void;
  onClose: () => void;
}) {
  const friends = useFriends();
  const [selection, setSelection] = useState(props.selected);
  return (
    <Modal title="달력에서 비교할 친구" onClose={props.onClose}>
      <div style={{ display: "grid", gap: "var(--sp-md)" }}>
        <strong aria-live="polite">{selection.length} / 10 선택</strong>
        {friends.isPending ? (
          <div className="spinner" aria-label="친구 불러오는 중" />
        ) : friends.data?.friends.length ? (
          friends.data.friends.map((friend) => {
            const checked = selection.includes(friend.userId);
            const disabled = selection.length >= 10 && !checked;
            return (
              <label
                key={friend.userId}
                className="check-field"
                aria-disabled={disabled}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  onChange={() =>
                    setSelection((current) =>
                      checked
                        ? current.filter((id) => id !== friend.userId)
                        : [...current, friend.userId],
                    )
                  }
                />
                <span>
                  <strong>{friend.name}</strong>
                  {disabled ? (
                    <small className="field-hint">
                      최대 10명까지 선택할 수 있어요
                    </small>
                  ) : null}
                </span>
              </label>
            );
          })
        ) : (
          <p className="text-body">
            먼저 친구 탭에서 친구 요청을 주고받아주세요.
          </p>
        )}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "var(--sp-sm)",
          }}
        >
          <button className="btn btn-secondary" onClick={props.onClose}>
            취소
          </button>
          <button
            className="btn btn-primary"
            disabled={selection.length === 0}
            onClick={() => props.onSave(normalizeFriendIds(selection))}
          >
            적용
          </button>
        </div>
      </div>
    </Modal>
  );
}

export function CalendarPage(props: { me: Me }) {
  const today = todayInSeoul();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const mode = params.get("mode") === "friends" ? "friends" : "unit";
  const selectedFriendIds = normalizeFriendIds(
    (params.get("friends") ?? "").split(","),
  );
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<PersonalEvent>();
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<CalendarScrollHandle>(null);
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();
  const eventMonth =
    mode === "friends" ? month : (selectedDate?.slice(0, 7) ?? month);
  const events = usePersonalEvents(eventMonth);
  const friendCalendar = useFriendCalendar(selectedFriendIds, month);
  const unit = props.me.unit;
  const dischargeAt = props.me.user.dischargeAt;
  const myLeaveDays = useMemo(
    () => buildMyLeaveDayMap(myLeaves.data?.leaves),
    [myLeaves.data],
  );
  const regularOvernight = balances.data?.regularOvernight ?? null;
  const currentCycle = useMemo(
    () => cycleForDisplay(regularOvernight, today, dischargeAt),
    [regularOvernight, today, dischargeAt],
  );
  const cycleUsage = useMemo(
    () =>
      currentCycle
        ? cycleUsedDays(
            currentCycle,
            (myLeaves.data?.leaves ?? []).flatMap((leave) => leave.segments),
          )
        : 0,
    [currentCycle, myLeaves.data],
  );
  const pendingFirstGrant = useMemo(() => {
    const first = firstGrantDate(regularOvernight);
    return first && today < first && first <= dischargeAt ? first : null;
  }, [regularOvernight, today, dischargeAt]);
  const selectedMonth = selectedDate?.slice(0, 7) ?? month;
  const panelCalendar = useCalendar(unit?.id ?? null, selectedMonth);
  const selectDate = useCallback(
    (date: string) =>
      setSelectedDate((current) => (current === date ? null : date)),
    [],
  );
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(timer);
  }, [toast]);
  const switchMode = (next: "unit" | "friends") => {
    const value = new URLSearchParams(params);
    if (next === "friends") value.set("mode", "friends");
    else value.delete("mode");
    setParams(value, { replace: true });
  };
  const saveFriends = (ids: string[]) => {
    const value = new URLSearchParams(params);
    value.set("mode", "friends");
    value.set("friends", ids.join(","));
    setParams(value);
    setSelectorOpen(false);
  };
  const openNewEvent = () => {
    setEditingEvent(undefined);
    setEventOpen(true);
  };

  return (
    <div className="anim-rise" style={{ paddingBottom: "var(--sp-3xl)" }}>
      <header
        style={{
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--sp-lg)",
          padding: "var(--sp-xl) 0 var(--sp-lg)",
        }}
      >
        <div>
          <h1 className="display-md">휴가 계획 달력</h1>
          <div
            role="group"
            aria-label="달력 보기"
            style={{
              display: "flex",
              gap: 4,
              marginTop: "var(--sp-md)",
              padding: 4,
              borderRadius: "var(--r-pill)",
              background: "var(--surface-strong)",
              width: "fit-content",
            }}
          >
            <button
              className={`btn btn-sm ${mode === "unit" ? "btn-primary" : "btn-secondary"}`}
              aria-pressed={mode === "unit"}
              onClick={() => switchMode("unit")}
            >
              부대
            </button>
            <button
              className={`btn btn-sm ${mode === "friends" ? "btn-primary" : "btn-secondary"}`}
              aria-pressed={mode === "friends"}
              onClick={() => switchMode("friends")}
            >
              친구
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-sm)", flexWrap: "wrap" }}>
          {mode === "unit" && unit ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSelectedDate(today);
                scrollRef.current?.scrollToToday();
              }}
            >
              오늘
            </button>
          ) : null}
          <button className="btn btn-secondary" onClick={openNewEvent}>
            개인 일정 추가
          </button>
          {mode === "unit" && unit ? (
            <button
              className="btn btn-primary"
              onMouseEnter={preloadLeaveFormModal}
              onFocus={preloadLeaveFormModal}
              onClick={() => setLeaveOpen(true)}
            >
              휴가 등록
            </button>
          ) : null}
          {mode === "friends" ? (
            <button
              className="btn btn-primary"
              onClick={() => setSelectorOpen(true)}
            >
              친구 선택 · {selectedFriendIds.length}/10
            </button>
          ) : null}
        </div>
      </header>

      {mode === "unit" ? (
        unit ? (
          <div
            className="cal-layout"
            style={{
              display: "grid",
              gridTemplateColumns: selectedDate
                ? "minmax(0, 1fr) 340px"
                : "minmax(0, 1fr)",
              gap: "var(--sp-lg)",
              alignItems: "start",
            }}
          >
            <div
              className="card"
              style={{ padding: "var(--sp-md)", minWidth: 0 }}
            >
              {currentCycle ? (
                <p className="cal-cycle-banner">
                  정기외박 {currentCycle.index}주기{" "}
                  {fmtRangeTiny(currentCycle.start, currentCycle.end)} ·{" "}
                  {currentCycle.grantDays}일 중 {cycleUsage}일 사용 · 잔여{" "}
                  {Math.max(currentCycle.grantDays - cycleUsage, 0)}일 · 마감 D-
                  {Math.max(diffDays(today, currentCycle.end), 0)}
                </p>
              ) : pendingFirstGrant ? (
                <p className="cal-cycle-banner is-pending">
                  정기외박 첫 적립 {fmtDateShort(pendingFirstGrant)} · D-
                  {Math.max(diffDays(today, pendingFirstGrant), 0)}
                </p>
              ) : null}
              <CalendarScroll
                ref={scrollRef}
                unitId={unit.id}
                selectedDate={selectedDate}
                myLeaveDays={myLeaveDays}
                regularOvernight={regularOvernight}
                currentCycle={currentCycle}
                dischargeAt={dischargeAt}
                onSelectDate={selectDate}
              />
              <div
                style={{
                  display: "flex",
                  gap: "var(--sp-lg)",
                  marginTop: "var(--sp-md)",
                  flexWrap: "wrap",
                }}
              >
                <span className="caption text-mute">
                  하루 최대 출타{" "}
                  <strong>{maxAllowedOut(unit.maxLeaveCount)}명</strong>
                </span>
                <span className="caption" style={{ color: "var(--brand)" }}>
                  ◇ 테두리 표시는 나만 보는 개인 일정
                </span>
              </div>
            </div>
            {selectedDate ? (
              <div style={{ display: "grid", gap: "var(--sp-md)" }}>
                <PersonalItems
                  events={events.data?.events ?? []}
                  date={selectedDate}
                  onAdd={openNewEvent}
                  onEdit={(event) => {
                    setEditingEvent(event);
                    setEventOpen(true);
                  }}
                />
                {panelCalendar.data ? (
                  <DayPanel
                    calendar={panelCalendar.data}
                    date={selectedDate}
                    myUserId={props.me.user.id}
                    cycle={cycleForDisplay(
                      regularOvernight,
                      selectedDate,
                      dischargeAt,
                    )}
                    dischargeAt={dischargeAt}
                    onOpenLeave={(leaveId) =>
                      void navigate(`/leaves/${leaveId}`)
                    }
                    onPreloadAddLeave={preloadLeaveFormModal}
                    onAddLeave={() => setLeaveOpen(true)}
                  />
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div
            className="card"
            style={{
              padding: "var(--sp-2xl)",
              display: "grid",
              gap: "var(--sp-lg)",
            }}
          >
            <h2 className="display-xs">소속 그룹이 없어요</h2>
            <p className="text-body">
              부대 통계는 그룹에 참여한 뒤 볼 수 있어요. 개인 일정과 친구 달력은
              지금 바로 사용할 수 있어요.
            </p>
            <div
              style={{ display: "flex", gap: "var(--sp-sm)", flexWrap: "wrap" }}
            >
              <button
                className="btn btn-primary"
                onClick={() => switchMode("friends")}
              >
                친구 달력 보기
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => void navigate("/units")}
              >
                그룹 참여
              </button>
              <button className="btn btn-secondary" onClick={openNewEvent}>
                개인 일정 추가
              </button>
            </div>
          </div>
        )
      ) : (
        <div style={{ display: "grid", gap: "var(--sp-lg)" }}>
          <div className="card" style={{ padding: "var(--sp-lg)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--sp-md)",
                marginBottom: "var(--sp-lg)",
              }}
            >
              <button
                className="btn btn-secondary btn-sm"
                aria-label="이전 달"
                onClick={() => setMonth((value) => shiftMonth(value, -1))}
              >
                ←
              </button>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setMonth(today.slice(0, 7))}
              >
                오늘
              </button>
              <button
                className="btn btn-secondary btn-sm"
                aria-label="다음 달"
                onClick={() => setMonth((value) => shiftMonth(value, 1))}
              >
                →
              </button>
            </div>
            {selectedFriendIds.length === 0 ? (
              <div style={{ padding: "var(--sp-2xl)", textAlign: "center" }}>
                <h2 className="display-xs">비교할 친구를 선택해주세요</h2>
                <p
                  className="text-body"
                  style={{ margin: "var(--sp-sm) 0 var(--sp-lg)" }}
                >
                  나의 공유 휴가와 개인 일정도 함께 표시돼요.
                </p>
                <button
                  className="btn btn-primary"
                  onClick={() => setSelectorOpen(true)}
                >
                  친구 선택
                </button>
              </div>
            ) : friendCalendar.isPending ? (
              <div className="spinner" aria-label="친구 달력 불러오는 중" />
            ) : friendCalendar.isError ? (
              <p className="field-error" role="alert">
                친구 달력을 불러오지 못했어요. 친구 관계나 차단 상태가 바뀌었을
                수 있어요.
              </p>
            ) : (
              <ComparisonMonth
                month={month}
                calendar={friendCalendar.data}
                events={events.data?.events ?? []}
                selectedDate={selectedDate}
                onSelectDate={selectDate}
              />
            )}
          </div>
          {friendCalendar.data ? (
            <div
              className="card"
              style={{
                padding: "var(--sp-lg)",
                display: "flex",
                gap: "var(--sp-md)",
                flexWrap: "wrap",
              }}
              aria-label="사람 구분"
            >
              {friendCalendar.data.people.map((person) => (
                <span
                  key={person.userId}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  <i
                    aria-hidden="true"
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 6,
                      background: personColor(person.userId),
                    }}
                  />
                  <strong>{person.isViewer ? "나" : person.name}</strong>
                </span>
              ))}
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <i
                  aria-hidden="true"
                  style={{
                    width: 12,
                    height: 12,
                    border: "2px solid var(--brand)",
                    transform: "rotate(45deg)",
                  }}
                />
                <strong>개인 일정</strong>
              </span>
            </div>
          ) : null}
          {selectedDate ? (
            <div
              className="cal-layout"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: "var(--sp-lg)",
              }}
            >
              <PersonalItems
                events={events.data?.events ?? []}
                date={selectedDate}
                onAdd={openNewEvent}
                onEdit={(event) => {
                  setEditingEvent(event);
                  setEventOpen(true);
                }}
              />
              <section
                className="card"
                style={{
                  padding: "var(--sp-lg)",
                  display: "grid",
                  gap: "var(--sp-sm)",
                }}
              >
                <h2 className="display-xs">공유 휴가</h2>
                {(() => {
                  const dayLeaves = (friendCalendar.data?.leaves ?? []).filter(
                    (leave) =>
                      leave.startDate <= selectedDate &&
                      selectedDate <= leave.endDate,
                  );
                  if (dayLeaves.length === 0)
                    return (
                      <p className="text-body">이 날의 공유 휴가가 없어요.</p>
                    );
                  return dayLeaves.map((leave) => {
                    const person = friendCalendar.data?.people.find(
                      (entry) => entry.userId === leave.userId,
                    );
                    return (
                      <div
                        key={leave.leaveId}
                        style={{
                          borderLeft: `4px solid ${personColor(leave.userId)}`,
                          padding: "var(--sp-sm) var(--sp-md)",
                        }}
                      >
                        <strong>
                          {person?.isViewer ? "나" : person?.name}
                        </strong>
                        <p className="caption text-mute">
                          {isConfirmedLeaveStatus(leave.status)
                            ? "확정 휴가"
                            : "공유 휴가"}
                        </p>
                      </div>
                    );
                  });
                })()}
              </section>
            </div>
          ) : null}
        </div>
      )}

      {leaveOpen ? (
        <LazyLeaveFormModal
          initialDate={selectedDate ?? today}
          onClose={() => setLeaveOpen(false)}
          onSaved={(result: LeaveResult) => {
            if (result.exceededDates.length)
              setToast(
                `${result.exceededDates.map(fmtDateShort).join(", ")}에 최대 출타 인원을 초과해요.`,
              );
          }}
        />
      ) : null}
      {eventOpen ? (
        <PersonalEventModal
          initialDate={selectedDate ?? `${month}-01`}
          event={editingEvent}
          onClose={() => {
            setEventOpen(false);
            setEditingEvent(undefined);
          }}
        />
      ) : null}
      {selectorOpen ? (
        <FriendSelector
          selected={selectedFriendIds}
          onSave={saveFriends}
          onClose={() => setSelectorOpen(false)}
        />
      ) : null}
      {toast
        ? createPortal(
            <div
              role="status"
              style={{
                position: "fixed",
                bottom: "var(--sp-xl)",
                left: "50%",
                transform: "translateX(-50%)",
                background: "var(--negative-bg)",
                color: "white",
                padding: "var(--sp-lg)",
                borderRadius: "var(--r-lg)",
                zIndex: 60,
              }}
            >
              {toast}
            </div>,
            document.body,
          )
        : null}
      <style>{`@media (max-width: 900px) { .cal-layout { grid-template-columns: minmax(0, 1fr) !important; } }`}</style>
    </div>
  );
}
