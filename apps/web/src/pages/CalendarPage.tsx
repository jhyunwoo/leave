import {
  cycleFor,
  cycleUsedDays,
  diffDays,
  effectiveMemberCount,
  firstGrantDate,
  fmtRangeTiny,
  maxAllowedOut,
  todayInSeoul,
} from "@leave/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router";
import type { Me } from "../api/queries";
import { useCalendar, useLeaveBalances, useMyLeaves } from "../api/queries";
import type { CalendarScrollHandle } from "../components/calendar/CalendarScroll";
import { CalendarScroll } from "../components/calendar/CalendarScroll";
import { DayPanel } from "../components/calendar/DayPanel";
import { LeaveFormModal } from "../components/LeaveFormModal";
import { fmtDateShort } from "../lib/format";
import { buildMyLeaveDayMap } from "../lib/my-leave-days";

export function CalendarPage(props: { me: Me }) {
  const unit = props.me.unit;
  const today = todayInSeoul();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<CalendarScrollHandle>(null);
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();

  const myLeaveDays = useMemo(
    () => buildMyLeaveDayMap(myLeaves.data?.leaves),
    [myLeaves.data],
  );

  // 정기외박 주기는 프로필의 자동 적립 설정에서 파생한다(별도 API 없음).
  const regularOvernight = balances.data?.regularOvernight ?? null;
  const currentCycle = useMemo(
    () => cycleFor(regularOvernight, today),
    [regularOvernight, today],
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
  // 첫 적립 전에는 주기가 없다. 대신 첫 적립일을 알려준다.
  const pendingFirstGrant = useMemo(() => {
    const first = firstGrantDate(regularOvernight);
    return first && today < first ? first : null;
  }, [regularOvernight, today]);

  // 선택한 날짜가 속한 달의 달력(사이드 패널용). 스크롤 블록과 같은 캐시를 재사용한다.
  const selectedMonth = selectedDate ? selectedDate.slice(0, 7) : null;
  const panelCalendar = useCalendar(
    unit?.id ?? null,
    selectedMonth ?? today.slice(0, 7),
  );

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!unit) return <Navigate to="/units" replace />;

  const basis = effectiveMemberCount(unit.headcount, unit.memberCount);
  const allowed = maxAllowedOut(
    basis,
    {
      numerator: unit.maxLeaveNumerator,
      denominator: unit.maxLeaveDenominator,
    },
    unit.maxLeaveCount,
  );

  const onSaved = (exceededDates: string[]) => {
    if (exceededDates.length > 0) {
      const list = exceededDates.map(fmtDateShort).join(", ");
      setToast(
        `등록은 완료됐지만 ${list}에 최대 출타 인원을 초과해요. 해당 날짜의 부대원들에게 알림을 보냈어요.`,
      );
    } else {
      setToast(null);
    }
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
          <p className="eyebrow">{unit.name}</p>
          <h1 className="display-md" style={{ marginTop: 6 }}>
            부대 달력
          </h1>
        </div>
        <div
          style={{ display: "flex", gap: "var(--sp-sm)", alignItems: "center" }}
        >
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
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setFormOpen(true)}
          >
            휴가 등록
          </button>
        </div>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: selectedDate ? "1fr 340px" : "1fr",
          gap: "var(--sp-lg)",
          alignItems: "start",
        }}
        className="cal-layout"
      >
        <div className="card" style={{ padding: "var(--sp-md)" }}>
          {currentCycle ? (
            <p className="cal-cycle-banner">
              정기외박 {currentCycle.index}주기{" "}
              {fmtRangeTiny(currentCycle.start, currentCycle.end)} ·{" "}
              {currentCycle.grantDays}일 중 {cycleUsage}일 사용 · 잔여{" "}
              {Math.max(currentCycle.grantDays - cycleUsage, 0)}일 · 마감 D-
              {Math.max(diffDays(today, currentCycle.end), 0)}
            </p>
          ) : pendingFirstGrant ? (
            // 첫 적립 전에는 주기가 없다. 언제 1주기가 시작하는지만 알려준다.
            <p className="cal-cycle-banner is-pending">
              정기외박 첫 적립 {fmtDateShort(pendingFirstGrant)} · D-
              {Math.max(diffDays(today, pendingFirstGrant), 0)} · 그전에는 쓸 수
              있는 정기외박이 없어요
            </p>
          ) : null}
          <CalendarScroll
            ref={scrollRef}
            unitId={unit.id}
            selectedDate={selectedDate}
            myLeaveDays={myLeaveDays}
            regularOvernight={regularOvernight}
            currentCycle={currentCycle}
            onSelectDate={(d) =>
              setSelectedDate((cur) => (cur === d ? null : d))
            }
          />
          <div
            style={{
              display: "flex",
              gap: "var(--sp-lg)",
              marginTop: "var(--sp-md)",
              padding: "0 var(--sp-sm)",
              flexWrap: "wrap",
            }}
          >
            <span className="caption text-mute">
              하루 최대 출타{" "}
              <strong style={{ color: "var(--ink)" }}>
                {unit.maxLeaveCount != null
                  ? `${unit.maxLeaveCount}명 직접 지정`
                  : `${unit.maxLeaveNumerator}/${unit.maxLeaveDenominator}`}
              </strong>{" "}
              {unit.maxLeaveCount == null
                ? `(${unit.headcount != null ? "부대 인원" : "가입자"} ${basis}명 기준 ${allowed}명)`
                : null}
            </span>
            <span className="caption" style={{ color: "var(--negative-deep)" }}>
              ● 빨간 날 = 최대 출타 인원 초과 · 공휴일은 빨간 날짜
            </span>
          </div>
        </div>

        {selectedDate && panelCalendar.data && (
          <DayPanel
            calendar={panelCalendar.data}
            date={selectedDate}
            myUserId={props.me.user.id}
            cycle={cycleFor(regularOvernight, selectedDate)}
            onAddLeave={() => setFormOpen(true)}
          />
        )}
      </div>

      {formOpen && (
        <LeaveFormModal
          initialDate={selectedDate ?? today}
          onClose={() => setFormOpen(false)}
          onSaved={onSaved}
        />
      )}

      {toast && (
        <div
          role="status"
          style={{
            position: "fixed",
            bottom: "var(--sp-xl)",
            left: "50%",
            transform: "translateX(-50%)",
            maxWidth: 520,
            width: "calc(100% - 32px)",
            background: "var(--negative-bg)",
            color: "#fff",
            borderRadius: "var(--r-lg)",
            padding: "var(--sp-lg) var(--sp-xl)",
            boxShadow: "var(--shadow-toast)",
            display: "flex",
            gap: "var(--sp-md)",
            alignItems: "flex-start",
            animation: "toast-in 240ms var(--ease-out) both",
            zIndex: 60,
          }}
        >
          <span className="body-sm" style={{ flex: 1 }}>
            {toast}
          </span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="닫기"
            style={{
              background: "none",
              border: "none",
              color: "#fff",
              cursor: "pointer",
              padding: 0,
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M3 3l10 10M13 3 3 13"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="2"
              />
            </svg>
          </button>
        </div>
      )}

      <style>{`
        @media (max-width: 900px) {
          .cal-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
