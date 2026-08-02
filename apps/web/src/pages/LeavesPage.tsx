import { BALANCE_LABELS, fmtRangeTiny, segmentBalanceKey } from "@leave/shared";
import { useState } from "react";
import { Link } from "react-router";
import type { MyLeave } from "../api/queries";
import { useDeleteLeave, useLeaveBalances, useMyLeaves } from "../api/queries";
import { LeaveFormModal } from "../components/LeaveFormModal";
import { fmtRange } from "../lib/format";

export function LeavesPage() {
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);

  // 주기 재원은 이월되지 않아 총량 개념이 달라 요약에서 뺀다.
  const holdings = (balances.data?.balances ?? [])
    .filter((item) => !item.cycleScoped)
    .reduce(
      (sum, item) => ({
        remaining: sum.remaining + item.remainingDays,
        expiringSoon: sum.expiringSoon + item.expiringSoonDays,
        expired: sum.expired + item.expiredDays,
      }),
      { remaining: 0, expiringSoon: 0, expired: 0 },
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
            <span className="caption" style={{ display: "block", marginTop: 2 }}>
              {holdings.expiringSoon > 0 || holdings.expired > 0
                ? [
                    holdings.expiringSoon > 0
                      ? `만료 임박 ${holdings.expiringSoon}일`
                      : null,
                    holdings.expired > 0 ? `소멸 ${holdings.expired}일` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "만기 기한과 정기외박 주기를 관리해요"}
            </span>
          </span>
          <span aria-hidden="true" style={{ fontSize: 24 }}>
            ›
          </span>
        </Link>
      )}

      {balances.data && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "var(--sp-sm)",
          }}
          aria-label="휴가 잔여량"
        >
          {balances.data.balances.map((item) => (
            <div
              key={item.key}
              className="card-sage"
              style={{ padding: "var(--sp-md)" }}
            >
              <p className="caption text-mute">{item.label}</p>
              <p className="display-xs" style={{ marginTop: 2 }}>
                {item.remainingDays}일
              </p>
              {/* 주기 재원은 이월되지 않아 총량·사용량이 이번 주기 기준이다. */}
              <p className="caption text-mute">
                {item.cycleScoped ? "이번 주기 " : ""}총 {item.totalDays} · 사용{" "}
                {item.usedDays}
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
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-md)",
          }}
        >
          {leaves.data.leaves.map((l) => (
            <li
              key={l.id}
              className="card"
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "var(--sp-lg)",
                flexWrap: "wrap",
              }}
            >
              <div style={{ minWidth: 0 }}>
                <p className="body-lg strong">{l.title}</p>
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
