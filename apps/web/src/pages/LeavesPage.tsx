import { useState } from "react";
import type { MyLeave } from "../api/queries";
import { useDeleteLeave, useMyLeaves } from "../api/queries";
import { LeaveFormModal } from "../components/LeaveFormModal";
import { fmtRange } from "../lib/format";

export function LeavesPage() {
  const leaves = useMyLeaves();
  const del = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);

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
          <p className="body-lg text-body" style={{ marginTop: "var(--sp-sm)" }}>
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

      {leaves.isPending ? (
        <div style={{ display: "flex", justifyContent: "center", padding: "var(--sp-3xl)" }}>
          <div className="spinner" aria-label="불러오는 중" />
        </div>
      ) : !leaves.data || leaves.data.leaves.length === 0 ? (
        <div className="card-sage" style={{ textAlign: "center", padding: "var(--sp-3xl)" }}>
          <p className="body-lg strong">아직 등록한 휴가가 없어요</p>
          <p className="body-sm text-body" style={{ marginTop: "var(--sp-sm)" }}>
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
