/**
 * 내 휴가 목록 화면.
 * 다가오는 일정과 지난 일정을 나누고, 재원별 잔여 요약을 함께 보여준다.
 */

import {
  BALANCE_LABELS,
  fmtRange,
  fmtRangeTiny,
  segmentBalanceKey,
  todayInSeoul,
} from "@leave/shared";
import { memo, useCallback, useMemo, useState } from "react";
import { Link } from "react-router";
import type { MyLeave } from "@leave/client";
import {
  partitionMyLeaves,
  useDeleteLeave,
  useLeaveBalances,
  useMyLeaves,
} from "@leave/client";
import {
  LazyLeaveFormModal,
  preloadLeaveFormModal,
} from "../components/LazyLeaveFormModal";
import { LeaveStatusControl } from "../components/LeaveStatusControl";

/**
 * A large leave history is uncommon but can otherwise mount hundreds of
 * interactive rows synchronously. Keep the first useful screen bounded and
 * let the user opt into each small batch; manual expansion is predictable on
 * slow CPUs and remains discoverable to keyboard and screen-reader users.
 */
const LEAVE_SECTION_PAGE_SIZE = 20;

export function LeavesPage() {
  const leaves = useMyLeaves();
  const balances = useLeaveBalances();
  const { mutateAsync: deleteLeave, isPending: deleting } = useDeleteLeave();
  const [editing, setEditing] = useState<MyLeave | null>(null);
  const [creating, setCreating] = useState(false);
  const today = todayInSeoul();

  // 보유 휴가 화면과 같은 셈 — 주기 재원은 이번 주기 몫에 앞으로 받을 몫까지 더한다.
  // 다른 재원의 적립 예정분은 아직 확정이 아니라 여기 넣지 않는다.
  //
  // 남은 일수는 오늘까지 다녀온 몫만 뺀다. 아직 가지 않은 계획을 미리 빼면 통장에 있는
  // 휴가보다 적게 보인다 — 계획은 아래 "계획 N일"로 따로 알린다. 그래서 이번 주기는
  // remainingAsOfTodayDays를, 앞으로 받을 몫도 계획을 뺀 upcomingDays가 아니라
  // upcomingAsOfTodayDays를 쓰고, 둘의 차이가 곧 미래 주기에 잡아 둔 계획이다.
  const holdings = (balances.data?.balances ?? []).reduce(
    (sum, item) => ({
      remaining:
        sum.remaining +
        item.remainingAsOfTodayDays +
        (item.cycleScoped ? item.upcomingAsOfTodayDays : 0),
      planned:
        sum.planned +
        item.plannedDays +
        (item.cycleScoped ? item.upcomingAsOfTodayDays - item.upcomingDays : 0),
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

  const sections = useMemo(
    () => partitionMyLeaves(leaves.data?.leaves, today),
    [leaves.data?.leaves, today],
  );
  const onDelete = useCallback(
    (leave: MyLeave) => {
      if (confirm(`"${leave.title}" 휴가를 삭제할까요?`)) {
        void deleteLeave(leave.id);
      }
    },
    [deleteLeave],
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
          onMouseEnter={preloadLeaveFormModal}
          onFocus={preloadLeaveFormModal}
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
              남은 휴가 {holdings.remaining}일
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--sp-xl)",
          }}
        >
          <LeaveSection
            id="upcoming-leaves"
            title="다가오는 휴가"
            leaves={sections.upcoming}
            deleting={deleting}
            onEdit={setEditing}
            onDelete={onDelete}
          />
          <LeaveSection
            id="past-leaves"
            title="지난 휴가"
            leaves={sections.past}
            deleting={deleting}
            onEdit={setEditing}
            onDelete={onDelete}
          />
        </div>
      )}

      {(creating || editing) && (
        <LazyLeaveFormModal
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

/** 목록의 한 줄. 다가오는 섹션과 지난 섹션이 같은 모양을 쓴다. */
function LeaveRow(props: {
  leave: MyLeave;
  deleting: boolean;
  onEdit: (leave: MyLeave) => void;
  onDelete: (leave: MyLeave) => void;
}) {
  const l = props.leave;
  return (
    <li className="content-row leave-row">
      <div className="leave-row__main">
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
            style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}
          >
            {l.segments.map((segment) => {
              const key = segmentBalanceKey(segment);
              return (
                <span key={`${key}-${segment.startDate}`} className="badge">
                  {BALANCE_LABELS[key]}{" "}
                  {fmtRangeTiny(segment.startDate, segment.endDate)}
                </span>
              );
            })}
          </div>
        </div>
        <div className="leave-row__actions">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onMouseEnter={preloadLeaveFormModal}
            onFocus={preloadLeaveFormModal}
            onClick={() => props.onEdit(l)}
          >
            수정
          </button>
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={props.deleting}
            onClick={() => props.onDelete(l)}
          >
            삭제
          </button>
        </div>
      </div>
      <LeaveStatusControl leave={l} />
    </li>
  );
}

/** 섹션 하나. 비어 있으면 아무것도 그리지 않는다. */
const LeaveSection = memo(function LeaveSection(props: {
  id: string;
  title: string;
  leaves: MyLeave[];
  deleting: boolean;
  onEdit: (leave: MyLeave) => void;
  onDelete: (leave: MyLeave) => void;
}) {
  const [visibleCount, setVisibleCount] = useState(LEAVE_SECTION_PAGE_SIZE);
  if (props.leaves.length === 0) return null;
  const visibleLeaves = props.leaves.slice(0, visibleCount);
  const remaining = props.leaves.length - visibleLeaves.length;
  const nextBatch = Math.min(LEAVE_SECTION_PAGE_SIZE, remaining);
  return (
    <section>
      <h2 className="body-lg strong" style={{ marginBottom: "var(--sp-sm)" }}>
        {props.title}{" "}
        <span className="caption text-mute">{props.leaves.length}건</span>
      </h2>
      <ul
        id={props.id}
        className="content-panel"
        style={{ listStyle: "none", margin: 0, padding: 0 }}
      >
        {visibleLeaves.map((leave) => (
          <LeaveRow
            key={leave.id}
            leave={leave}
            deleting={props.deleting}
            onEdit={props.onEdit}
            onDelete={props.onDelete}
          />
        ))}
      </ul>
      {remaining > 0 && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          aria-controls={props.id}
          aria-label={`${props.title} ${nextBatch}건 더 보기 · ${remaining}건 남음`}
          onClick={() =>
            setVisibleCount((count) => count + LEAVE_SECTION_PAGE_SIZE)
          }
          style={{ width: "100%", marginTop: "var(--sp-sm)" }}
        >
          {nextBatch}건 더 보기 · {remaining}건 남음
        </button>
      )}
    </section>
  );
});
