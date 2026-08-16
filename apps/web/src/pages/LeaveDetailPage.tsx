/**
 * 휴가 상세 화면.
 * 구간별 재원과 기간, 그 기간의 그룹 출타 현황을 함께 보여주고 수정·삭제를 제공한다.
 */

import {
  availabilitySignal,
  BALANCE_LABELS,
  cycleForDisplay,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  monthsSpanning,
  segmentBalanceKey,
} from "@leave/shared";
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import {
  useCalendar,
  useCalendarDays,
  useDeleteLeave,
  useLeaveBalances,
  useMyLeaves,
  type Me,
} from "@leave/client";
import { DayRoster } from "../components/calendar/DayRoster";
import { LeaveFormModal } from "../components/LeaveFormModal";
import { OfficialDisclaimer } from "../components/OfficialDisclaimer";
import { fmtDateK, fmtDateShort, fmtRange } from "@leave/shared";

/**
 * 내 휴가 한 건의 상세.
 *
 * 알림에서 들어오면 `?date=`로 어느 초과일 때문에 왔는지가 함께 넘어온다.
 * 알림이 들고 있는 leaveId는 초과를 유발한 "남의" 휴가라 이동에 쓸 수 없다 —
 * 알림 화면이 초과일을 덮는 내 휴가를 먼저 찾아 이 화면으로 넘긴다.
 */
export function LeaveDetailPage(props: { me: Me }) {
  const { leaveId } = useParams<{ leaveId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState(false);
  // 알림에서 온 날짜를 우선 보여준다. 없으면 아래에서 첫 초과일로 채운다.
  const [pickedDate, setPickedDate] = useState<string | null>(
    searchParams.get("date"),
  );

  const leave = leaves.data?.leaves.find((l) => l.id === leaveId) ?? null;
  const unitId = props.me.unit?.id ?? null;

  const months = useMemo(
    () => (leave ? monthsSpanning(leave.startDate, leave.endDate) : []),
    [leave],
  );
  const spanDays = useCalendarDays(unitId, months);

  // 이 휴가 기간 안에서 지금도 초과인 날짜들. 알림 이후 남이 계획을 물리면 사라진다.
  const exceededDates = useMemo(() => {
    if (!leave) return [];
    return spanDays.days
      .filter(
        (day) =>
          day.exceeded &&
          leave.startDate <= day.date &&
          day.date <= leave.endDate,
      )
      .map((day) => day.date);
  }, [spanDays.days, leave]);

  const selectedDate =
    pickedDate ?? exceededDates[0] ?? leave?.startDate ?? null;
  // 휴가를 못 찾으면 볼 날짜도 없다. unitId를 비워 빈 달 조회가 나가지 않게 한다.
  const dayCalendar = useCalendar(
    selectedDate ? unitId : null,
    selectedDate ? selectedDate.slice(0, 7) : "",
  );

  if (leaves.isPending) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "var(--sp-3xl)",
        }}
      >
        <div className="spinner" aria-label="불러오는 중" />
      </div>
    );
  }

  // 알림을 받은 뒤 계획을 지웠거나 기간을 바꾼 경우.
  if (!leave || !selectedDate) {
    return (
      <div
        className="card-sage anim-rise"
        style={{
          maxWidth: 640,
          margin: "0 auto",
          textAlign: "center",
          padding: "var(--sp-3xl)",
        }}
      >
        <p className="body-lg strong">휴가를 찾을 수 없어요</p>
        <p className="body-sm text-body" style={{ marginTop: "var(--sp-sm)" }}>
          이미 삭제했거나 기간을 바꾼 계획일 수 있어요.
        </p>
        <Link
          to="/leaves"
          className="btn btn-primary"
          style={{ marginTop: "var(--sp-lg)" }}
        >
          내 휴가로 가기
        </Link>
      </div>
    );
  }

  const stat = dayCalendar.data?.days.find((d) => d.date === selectedDate);
  const signal = stat ? availabilitySignal(stat.count, stat.allowed) : null;
  const blackout = dayCalendar.data?.blackouts.find(
    (b) => b.startDate <= selectedDate && selectedDate <= b.endDate,
  );
  // 달력과 같은 규칙으로 자른다 — 같은 날에 두 화면이 다른 말을 하면 안 된다.
  const cycle = cycleForDisplay(
    balances.data?.regularOvernight ?? null,
    selectedDate,
    props.me.user.dischargeAt,
  );

  return (
    <div
      className="anim-rise"
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "var(--sp-lg) 0 var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-xl)",
      }}
    >
      <header>
        <Link to="/leaves" className="caption text-mute">
          ‹ 내 휴가
        </Link>
        <h1 className="display-md" style={{ marginTop: "var(--sp-sm)" }}>
          {leave.title}
        </h1>
        <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
          {fmtRange(leave.startDate, leave.endDate)}
        </p>
        {leave.reason && (
          <p className="caption text-mute" style={{ marginTop: 4 }}>
            {leave.reason}
          </p>
        )}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginTop: "var(--sp-md)",
          }}
        >
          {!isConfirmedLeaveStatus(leave.status) && (
            <span className="badge">{LEAVE_STATUS_LABELS[leave.status]}</span>
          )}
          {leave.segments.map((segment) => {
            const key = segmentBalanceKey(segment);
            return (
              <span key={`${key}-${segment.startDate}`} className="badge">
                {BALANCE_LABELS[key]}{" "}
                {fmtRangeTiny(segment.startDate, segment.endDate)}
              </span>
            );
          })}
        </div>
        <div
          style={{
            display: "flex",
            gap: "var(--sp-sm)",
            marginTop: "var(--sp-lg)",
          }}
        >
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setEditing(true)}
          >
            수정
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={del.isPending}
            onClick={() => {
              if (!confirm(`"${leave.title}" 휴가를 삭제할까요?`)) return;
              // 삭제하면 이 화면이 가리킬 대상이 사라지므로 목록으로 되돌아간다.
              void del.mutateAsync(leave.id).then(
                () => navigate("/leaves"),
                () => alert("삭제하지 못했어요. 잠시 후 다시 시도해주세요."),
              );
            }}
          >
            삭제
          </button>
        </div>
      </header>

      <section
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-md)",
        }}
      >
        <h2 className="display-xs">최대 출타 인원 초과</h2>
        {spanDays.isPending ? (
          <div className="spinner" aria-label="불러오는 중" />
        ) : exceededDates.length === 0 ? (
          <p className="body-sm text-body">
            지금은 이 휴가 기간에 초과된 날짜가 없어요. 다른 사람이 계획을
            바꾸면 알림을 받은 뒤에도 해소될 수 있어요.
          </p>
        ) : (
          <>
            <p className="body-sm text-body">
              날짜를 고르면 그날 함께 나가는 사람을 볼 수 있어요.
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {exceededDates.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`badge ${d === selectedDate ? "badge-negative" : ""}`}
                  aria-pressed={d === selectedDate}
                  onClick={() => setPickedDate(d)}
                  style={{
                    cursor: "pointer",
                    border: "1px solid var(--negative)",
                  }}
                >
                  {fmtDateShort(d)}
                </button>
              ))}
            </div>
          </>
        )}
      </section>

      <section
        className="card"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
        }}
      >
        <div>
          <p className="eyebrow">선택한 날짜</p>
          <h2 className="display-xs" style={{ marginTop: 4 }}>
            {fmtDateK(selectedDate)}
          </h2>
        </div>

        {stat && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-sm)",
              flexWrap: "wrap",
            }}
          >
            <span
              className={`badge ${stat.exceeded ? "badge-negative" : "badge-positive"}`}
            >
              {signal?.percent == null
                ? "기준 미설정"
                : `${signal.label} ${signal.percent}%`}
            </span>
            <span className="caption text-body">
              {stat.count}명 / 기준 {stat.allowed}명
            </span>
          </div>
        )}

        {blackout && (
          <div
            className="card-sage"
            style={{
              padding: "var(--sp-md)",
              border: "1px solid var(--warning)",
            }}
          >
            <p
              className="body-sm strong"
              style={{ color: "var(--warning-content)" }}
            >
              제한 가능 기간
            </p>
            <p className="caption text-body" style={{ marginTop: 2 }}>
              {blackout.reason ?? "관리자가 등록한 기간입니다."} 출타율과
              무관하게 지휘관이 휴가를 제한할 수 있어요.
            </p>
          </div>
        )}

        {cycle && (
          <p className="caption text-body">
            정기외박 {cycle.index}주기 {fmtRangeTiny(cycle.start, cycle.end)}{" "}
            안에 속한 날이에요.
          </p>
        )}

        <OfficialDisclaimer />

        {dayCalendar.data ? (
          <DayRoster
            attendees={dayCalendar.data.attendees}
            date={selectedDate}
            myUserId={props.me.user.id}
          />
        ) : (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: "var(--sp-2xl)",
            }}
          >
            <div className="spinner" aria-label="불러오는 중" />
          </div>
        )}
      </section>

      {editing && (
        <LeaveFormModal
          editing={leave}
          onClose={() => setEditing(false)}
          onSaved={(result) => {
            // 앞 휴가에 흡수되면 이 화면이 가리키던 휴가가 사라진다. 합쳐진 쪽으로 옮긴다.
            if (result.leave.id !== leaveId) {
              navigate(`/leaves/${result.leave.id}`, { replace: true });
            }
          }}
        />
      )}
    </div>
  );
}
