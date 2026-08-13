/**
 * 내 휴가 목록 화면.
 * 다가오는 일정과 지난 일정을 나누고, 재원별 잔여 요약을 함께 보여준다.
 */

import { BALANCE_LABELS, fmtRangeTiny, segmentBalanceKey } from "@leave/shared";
import { useState } from "react";
import { Link } from "react-router";
import type { MyLeave } from "@leave/client";
import { useDeleteLeave, useLeaveBalances, useMyLeaves } from "@leave/client";
import { LeaveFormModal } from "../components/LeaveFormModal";
import { fmtRange } from "@leave/shared";

export function LeavesPage() {
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);

  // 보유 휴가 화면과 같은 셈 — 주기 재원은 이번 주기 몫에 앞으로 받을 몫(upcomingDays)까지
  // 더한다. 다른 재원의 적립 예정분은 아직 확정이 아니라 여기 넣지 않는다.
  //
  // 남은 일수는 오늘까지 다녀온 몫만 뺀다(remainingAsOfTodayDays). 아직 가지 않은 계획을
  // 미리 빼면 통장에 있는 휴가보다 적게 보인다 — 계획은 아래 "계획 N일"로 따로 알린다.
  const holdings = (balances.data?.balances ?? []).reduce(
    (sum, item) => ({
      remaining:
        sum.remaining +
        item.remainingAsOfTodayDays +
        (item.cycleScoped ? item.upcomingDays : 0),
      planned: sum.planned + item.plannedDays,
      expiringSoon: sum.expiringSoon + item.expiringSoonDays,
      expired: sum.expired + item.expiredDays,
    }),
    { remaining: 0, planned: 0, expiringSoon: 0, expired: 0 },
  );
  const visibleBalances = (balances.data?.balances ?? []).filter(
    (item) =>
      item.totalDays > 0 ||
      item.usedDays > 0 ||
      item.remainingDays > 0 ||
      item.expiringSoonDays > 0 ||
      item.expiredDays > 0,
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
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          gap: "var(--sp-lg)",
        }}
      >
        <div>
          <h1 className="display-md">내 휴가</h1>
          <p
            className="body-lg text-body"
            style={{ marginTop: "var(--sp-sm)" }}
          >
            등록한 휴가를 고치거나 지울 수 있어요.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setCreating(true)}
        >
          휴가 등록
        </button>
      </header>

      {balances.data && (
        <Link
          to="/leaves/grants"
          className="card-sage"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--sp-md)",
            padding: "var(--sp-lg)",
            textDecoration: "none",
          }}
        >
          <span>
            <span className="caption text-mute" style={{ display: "block" }}>
              보유 휴가
            </span>
            <span
              className="display-xs"
              style={{ display: "block", marginTop: 2 }}
            >
              남은 {holdings.remaining}일
            </span>
            <span
              className="caption"
              style={{ display: "block", marginTop: 2 }}
            >
              {[
                holdings.planned > 0 ? `계획 ${holdings.planned}일` : null,
                holdings.expiringSoon > 0
                  ? `만료 임박 ${holdings.expiringSoon}일`
                  : null,
                holdings.expired > 0 ? `소멸 ${holdings.expired}일` : null,
              ]
                .filter(Boolean)
                .join(" · ") || "만기 기한과 정기외박 주기를 관리해요"}
            </span>
          </span>
          <span aria-hidden="true" style={{ fontSize: 24 }}>
            ›
          </span>
        </Link>
      )}

      {visibleBalances.length > 0 && (
        <section className="metric-strip" aria-label="휴가 잔여량">
          {visibleBalances.map((item) => (
            <div key={item.key} className="metric-strip__item">
              <p className="caption text-mute">{item.label}</p>
              <p className="display-xs" style={{ marginTop: 2 }}>
                {item.remainingAsOfTodayDays}일
              </p>
              {/* 주기 재원은 이월되지 않아 총량·사용량이 이번 주기 기준이다. */}
              <p className="caption text-mute">
                {item.cycleScoped ? "이번 주기 " : ""}총 {item.totalDays} · 사용{" "}
                {item.usedToDateDays}
                {item.plannedDays > 0 ? ` · 계획 ${item.plannedDays}` : ""}
              </p>
              {item.expiredDays > 0 && (
                <p className="caption" style={{ color: "#a72027" }}>
                  만료 {item.expiredDays}일
                </p>
              )}
            </div>
          ))}
        </section>
      )}

      {leaves.isPending ? (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            padding: "var(--sp-3xl)",
          }}
        >
          <div className="spinner" aria-label="불러오는 중" />
        </div>
      ) : !leaves.data || leaves.data.leaves.length === 0 ? (
        <div
          className="card-sage"
          style={{ textAlign: "center", padding: "var(--sp-3xl)" }}
        >
          <p className="body-lg strong">아직 등록한 휴가가 없어요</p>
          <p
            className="body-sm text-body"
            style={{ marginTop: "var(--sp-sm)" }}
          >
            휴가를 등록하면 부대 달력에 함께 표시돼요.
          </p>
        </div>
      ) : (
        <ul
          className="content-panel"
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
          }}
        >
          {leaves.data.leaves.map((l) => (
            <li
              key={l.id}
              className="content-row"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--sp-lg)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Link
                  to={`/leaves/${l.id}`}
                  className="body-lg strong"
                  style={{ textDecoration: "none" }}
                >
                  {l.title}
                </Link>
                <p className="body-sm text-body" style={{ marginTop: 2 }}>
                  {fmtRange(l.startDate, l.endDate)}
                </p>
                {l.reason && (
                  <p className="caption text-mute" style={{ marginTop: 4 }}>
                    {l.reason}
                  </p>
                )}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    marginTop: 8,
                  }}
                >
                  {l.segments.map((segment) => {
                    const key = segmentBalanceKey(segment);
                    return (
                      <span
                        key={`${key}-${segment.startDate}`}
                        className="badge"
                      >
                        {BALANCE_LABELS[key]}{" "}
                        {fmtRangeTiny(segment.startDate, segment.endDate)}
                      </span>
                    );
                  })}
                </div>
              </div>
              <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditing(l)}
                >
                  수정
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  disabled={del.isPending}
                  onClick={() => {
                    if (confirm(`"${l.title}" 휴가를 삭제할까요?`)) {
                      void del.mutateAsync(l.id);
                    }
                  }}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {(creating || editing) && (
        <LeaveFormModal
          editing={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => undefined}
        />
      )}
    </div>
  );
}
