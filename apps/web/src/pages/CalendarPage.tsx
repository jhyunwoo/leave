/**
 * 달력 화면 — 이 서비스의 첫 화면.
 *
 * 그룹에 속해 있으면 스크롤 달력과 하루 패널을, 아직 그룹이 없으면 참여 안내를
 * 보여준다. 날짜를 고르면 그날 기준으로 휴가 등록 모달이 열린다.
 */

import {
  cycleForDisplay,
  cycleUsedDays,
  diffDays,
  firstGrantDate,
  fmtRangeTiny,
  maxAllowedOut,
  todayInSeoul,
} from "@leave/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Navigate, useNavigate } from "react-router";
import type { LeaveResult, Me } from "@leave/client";
import { useCalendar, useLeaveBalances, useMyLeaves } from "@leave/client";
import type { CalendarScrollHandle } from "../components/calendar/CalendarScroll";
import { CalendarScroll } from "../components/calendar/CalendarScroll";
import { DayPanel } from "../components/calendar/DayPanel";
import {
  LazyLeaveFormModal,
  preloadLeaveFormModal,
} from "../components/LazyLeaveFormModal";
import { fmtDateShort } from "@leave/shared";
import { buildMyLeaveDayMap } from "@leave/client";

export function CalendarPage(props: { me: Me }) {
  const unit = props.me.unit;
  const today = todayInSeoul();
  const dischargeAt = props.me.user.dischargeAt;
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const scrollRef = useRef<CalendarScrollHandle>(null);
  const myLeaves = useMyLeaves();
  const balances = useLeaveBalances();
  const handleSelectDate = useCallback((date: string) => {
    setSelectedDate((current) => (current === date ? null : date));
  }, []);

  const myLeaveDays = useMemo(
    () => buildMyLeaveDayMap(myLeaves.data?.leaves),
    [myLeaves.data],
  );

  // 정기외박 주기는 프로필의 자동 적립 설정에서 파생한다(별도 API 없음).
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
  // 첫 적립 전에는 주기가 없다. 대신 첫 적립일을 알려준다. 다만 그 적립일이 전역일보다
  // 뒤면 끝내 받지 못하므로 기다리라고 하지 않는다.
  const pendingFirstGrant = useMemo(() => {
    const first = firstGrantDate(regularOvernight);
    if (!first || today >= first) return null;
    return first <= dischargeAt ? first : null;
  }, [regularOvernight, today, dischargeAt]);

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

  const allowed = maxAllowedOut(unit.maxLeaveCount);

  const onSaved = (result: LeaveResult) => {
    if (result.exceededDates.length > 0) {
      const list = result.exceededDates.map(fmtDateShort).join(", ");
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
          <h1 className="display-md">휴가 계획 달력</h1>
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
            onMouseEnter={preloadLeaveFormModal}
            onFocus={preloadLeaveFormModal}
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
            dischargeAt={dischargeAt}
            onSelectDate={handleSelectDate}
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
              <strong style={{ color: "var(--ink)" }}>{allowed}명</strong>
            </span>
            <span className="caption" style={{ color: "var(--negative-deep)" }}>
              ● 빨간 칸 = 최대 출타 인원 초과 · 빨간 날짜 = 주말·공휴일
            </span>
            <span className="caption" style={{ color: "var(--brand)" }}>
              ● 초록 칸 = 전역일
            </span>
          </div>
        </div>

        {selectedDate && panelCalendar.data && (
          <DayPanel
            calendar={panelCalendar.data}
            date={selectedDate}
            myUserId={props.me.user.id}
            cycle={cycleForDisplay(regularOvernight, selectedDate, dischargeAt)}
            dischargeAt={dischargeAt}
            onOpenLeave={(leaveId) => void navigate(`/leaves/${leaveId}`)}
            onPreloadAddLeave={preloadLeaveFormModal}
            onAddLeave={() => setFormOpen(true)}
          />
        )}
      </div>

      {formOpen && (
        <LazyLeaveFormModal
          initialDate={selectedDate ?? today}
          onClose={() => setFormOpen(false)}
          onSaved={onSaved}
        />
      )}

      {/* 토스트도 모달과 같은 이유로 body에 그린다 — 페이지 트리 안에 두면
          조상의 transform이 `position: fixed`의 기준을 가로채, 달력이 길어질수록
          토스트가 화면 아래로 내려가 보이지 않는다(components/Modal.tsx 주석). */}
      {toast &&
        createPortal(
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <path
                  d="M3 3l10 10M13 3 3 13"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>,
          document.body,
        )}

      <style>{`
        @media (max-width: 900px) {
          .cal-layout { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
