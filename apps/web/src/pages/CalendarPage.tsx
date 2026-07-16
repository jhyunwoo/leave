import { todayInSeoul } from "@leave/shared";
import { useEffect, useState } from "react";
import { Navigate } from "react-router";
import type { Me } from "../api/queries";
import { useCalendar } from "../api/queries";
import { DayPanel } from "../components/calendar/DayPanel";
import { MonthCalendar } from "../components/calendar/MonthCalendar";
import { LeaveFormModal } from "../components/LeaveFormModal";
import { fmtDateShort, splitMonth, shiftMonth } from "../lib/format";

export function CalendarPage(props: { me: Me }) {
  const unit = props.me.unit;
  const today = todayInSeoul();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const calendar = useCalendar(unit?.id ?? null, month);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 7000);
    return () => clearTimeout(t);
  }, [toast]);

  if (!unit) return <Navigate to="/units" replace />;

  const { year, monthNum } = splitMonth(month);

  const onSaved = (exceededDates: string[]) => {
    if (exceededDates.length > 0) {
      const list = exceededDates.map(fmtDateShort).join(", ");
      setToast(
        `등록은 완료됐지만 ${list}에 출타율이 초과돼요. 해당 날짜의 부대원들에게 알림을 보냈어요.`,
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
          padding: "var(--sp-2xl) 0 var(--sp-xl)",
        }}
      >
        <div>
          <p className="eyebrow">
            {unit.name} · {year}
          </p>
          <h1 className="display-xl" style={{ marginTop: 6 }}>
            {monthNum}월
          </h1>
        </div>
        <div style={{ display: "flex", gap: "var(--sp-sm)", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              setMonth(today.slice(0, 7));
              setSelectedDate(today);
            }}
          >
            오늘
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="이전 달"
            onClick={() => setMonth((m) => shiftMonth(m, -1))}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M10 3L5 8l5 5"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <button
            type="button"
            className="btn-icon"
            aria-label="다음 달"
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
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
        <div className="card">
          {calendar.isPending ? (
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                padding: "var(--sp-3xl)",
              }}
            >
              <div className="spinner" aria-label="불러오는 중" />
            </div>
          ) : calendar.isError ? (
            <p className="body-sm text-body" style={{ padding: "var(--sp-xl)" }}>
              달력을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.
            </p>
          ) : (
            <>
              <MonthCalendar
                calendar={calendar.data}
                selectedDate={selectedDate}
                onSelectDate={(d) =>
                  setSelectedDate((cur) => (cur === d ? null : d))
                }
              />
              <div
                style={{
                  display: "flex",
                  gap: "var(--sp-lg)",
                  marginTop: "var(--sp-lg)",
                  flexWrap: "wrap",
                }}
              >
                <span className="caption text-mute">
                  하루 최대 출타{" "}
                  <strong style={{ color: "var(--ink)" }}>
                    {unit.maxLeaveNumerator}/{unit.maxLeaveDenominator}
                  </strong>{" "}
                  (부대원 {unit.memberCount}명 기준{" "}
                  {Math.floor(
                    (unit.memberCount * unit.maxLeaveNumerator) /
                      unit.maxLeaveDenominator,
                  )}
                  명)
                </span>
                <span className="caption" style={{ color: "var(--negative-deep)" }}>
                  ● 빨간 날 = 출타율 초과
                </span>
              </div>
            </>
          )}
        </div>

        {selectedDate && calendar.data && (
          <DayPanel
            calendar={calendar.data}
            date={selectedDate}
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
            animation: "pop-in 0.3s cubic-bezier(0.2, 0.7, 0.2, 1) both",
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
            ✕
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
