import { fmtRangeTiny, type BalanceKey } from "@leave/shared";
import { useState } from "react";
import { Link } from "react-router";
import type { LeaveGrantFund, LeaveGrantItem, Me } from "../api/queries";
import { useDeleteLeaveGrant, useLeaveGrants } from "../api/queries";
import { LeaveGrantModal } from "../components/LeaveGrantModal";
import { RegularOvernightSettings } from "../components/RegularOvernightSettings";
import { fmtDateShort } from "../lib/format";

/** 만기가 이 안으로 다가오면 임박으로 본다. */
const EXPIRING_SOON = 30;
/** 접었을 때 보여줄 지난 주기 수. */
const RECENT_PAST_CYCLES = 2;

type Editing = { grant: LeaveGrantItem } | { newKey: BalanceKey } | null;

export function LeaveGrantsPage(props: { me: Me }) {
  const page = useLeaveGrants();
  const del = useDeleteLeaveGrant();
  const [editing, setEditing] = useState<Editing>(null);
  const [showPastCycles, setShowPastCycles] = useState(false);

  if (page.isPending || !page.data) {
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

  const { totals, funds, regularOvernight } = page.data;
  const cycleKey = funds.find((fund) => fund.cycleScoped)?.key ?? null;
  const active = funds.filter(
    (fund) => !fund.cycleScoped && (fund.grants.length > 0 || fund.usedDays > 0),
  );
  const empty = funds.filter(
    (fund) =>
      !fund.cycleScoped && fund.grants.length === 0 && fund.usedDays === 0,
  );

  const removeGrant = (grant: LeaveGrantItem) => {
    const warning =
      grant.usedDays > 0
        ? `\n이미 ${grant.usedDays}일을 쓴 적립분이라, 지우면 그만큼 설명되지 않는 사용분이 생겨요.`
        : "";
    if (window.confirm(`${grant.days}일 적립분을 지울까요?${warning}`)) {
      void del.mutateAsync(grant.id);
    }
  };

  return (
    <div
      className="anim-rise"
      style={{
        maxWidth: 720,
        margin: "0 auto",
        padding: "var(--sp-lg) 0 var(--sp-3xl)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--sp-xl)",
      }}
    >
      <header>
        <Link to="/leaves" className="body-sm text-mute">
          ‹ 내 휴가
        </Link>
        <h1 className="display-md" style={{ marginTop: "var(--sp-xs)" }}>
          보유 휴가
        </h1>
      </header>

      <section className="card" style={{ display: "grid", gap: "var(--sp-sm)" }}>
        <p className="display-md" style={{ fontVariantNumeric: "tabular-nums" }}>
          남은 휴가 {totals.remainingDays}일
        </p>
        <p className="body-sm text-body">
          사용 {totals.usedDays}일 · 총 {totals.totalDays}일
        </p>

        <div
          style={{
            display: "flex",
            height: 8,
            borderRadius: 999,
            overflow: "hidden",
            background: "var(--surface-card, #f3f5f1)",
          }}
          aria-hidden="true"
        >
          {totals.usedDays > 0 && (
            <div style={{ flex: totals.usedDays, background: "#d8ddd5" }} />
          )}
          {totals.remainingDays > 0 && (
            <div style={{ flex: totals.remainingDays, background: "#9fe870" }} />
          )}
          {totals.expiredDays > 0 && (
            <div style={{ flex: totals.expiredDays, background: "#fff0f0" }} />
          )}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-xs)" }}>
          {totals.expiredDays > 0 && (
            <span className="badge badge-negative">
              소멸 {totals.expiredDays}일
            </span>
          )}
          {totals.upcomingDays > 0 && (
            <span className="badge">예정 {totals.upcomingDays}일</span>
          )}
        </div>

        {totals.unattributedDays > 0 && (
          <p className="field-error" role="alert">
            적립분으로 설명되지 않는 사용 {totals.unattributedDays}일이 있어요.
            적립분을 확인해주세요.
          </p>
        )}

        {/* 배분 규칙이 보이지 않으면 건별 사용 일수를 믿기 어렵다. */}
        <p className="caption text-mute">
          만기가 빠른 적립분부터 자동으로 차감돼요.
        </p>
      </section>

      {active.map((fund) => (
        <FundCard
          key={fund.key}
          fund={fund}
          onAdd={() => setEditing({ newKey: fund.key })}
          onEdit={(grant) => setEditing({ grant })}
          onDelete={removeGrant}
        />
      ))}

      {empty.length > 0 && (
        <section className="card" style={{ display: "grid", gap: "var(--sp-md)" }}>
          <h2 className="body-lg strong">다른 재원 추가</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-xs)" }}>
            {empty.map((fund) => (
              <button
                key={fund.key}
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setEditing({ newKey: fund.key })}
              >
                + {fund.label}
              </button>
            ))}
          </div>
        </section>
      )}

      {props.me.user.branch !== "army" && (
        <>
          <RegularOvernightSettings config={regularOvernight} />
          <CycleList
            cycles={regularOvernight.cycles}
            expanded={showPastCycles}
            onToggle={() => setShowPastCycles((open) => !open)}
          />
        </>
      )}

      {editing && (
        <LeaveGrantModal
          editing={"grant" in editing ? editing.grant : null}
          initialKey={"newKey" in editing ? editing.newKey : undefined}
          lockedKey={cycleKey}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function FundCard(props: {
  fund: LeaveGrantFund;
  onAdd: () => void;
  onEdit: (grant: LeaveGrantItem) => void;
  onDelete: (grant: LeaveGrantItem) => void;
}) {
  const { fund } = props;
  return (
    <section className="card" style={{ display: "grid", gap: "var(--sp-md)" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--sp-sm)",
        }}
      >
        <h2 className="body-lg strong">{fund.label}</h2>
        <span
          className="body-sm text-body"
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          잔여 {fund.remainingDays}일 / 총 {fund.totalDays}일
        </span>
      </div>

      {fund.unattributedDays > 0 && (
        <p className="field-error">
          설명되지 않는 사용 {fund.unattributedDays}일
        </p>
      )}

      {fund.grants.length === 0 ? (
        <p className="caption text-mute">
          적립분이 없는데 {fund.usedDays}일을 썼어요.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {fund.grants.map((grant) => (
            <GrantRow
              key={grant.id}
              grant={grant}
              onEdit={() => props.onEdit(grant)}
              onDelete={() => props.onDelete(grant)}
            />
          ))}
        </ul>
      )}

      <button
        type="button"
        className="btn btn-tertiary btn-sm"
        onClick={props.onAdd}
      >
        + 적립분 추가
      </button>
    </section>
  );
}

function GrantRow(props: {
  grant: LeaveGrantItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { grant } = props;
  const expired = grant.status === "expired";
  const soon =
    grant.status === "active" &&
    grant.daysUntilExpiry !== null &&
    grant.daysUntilExpiry <= EXPIRING_SOON;

  return (
    <li
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--sp-md)",
        padding: "var(--sp-sm) 0",
        borderTop: "1px solid var(--hairline, #d7dbd4)",
        opacity: expired ? 0.55 : 1,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p>
          <strong style={{ fontVariantNumeric: "tabular-nums" }}>
            {grant.days}일
          </strong>{" "}
          <span className="caption text-mute">
            {grant.expiresOn ? `만기 ${fmtDateShort(grant.expiresOn)}` : "만기 없음"}
            {grant.usedDays > 0 ? ` · 사용 ${grant.usedDays}일` : ""}
          </span>
        </p>
        <p style={{ marginTop: 2 }}>
          {expired ? (
            <span className="badge badge-negative">
              {grant.unusedDays > 0 ? `소멸 ${grant.unusedDays}일` : "만료됨"}
            </span>
          ) : grant.status === "future" ? (
            <span className="badge">{fmtDateShort(grant.grantedOn!)}부터</span>
          ) : soon ? (
            <span className="badge badge-negative">
              D-{grant.daysUntilExpiry} 만료 임박
            </span>
          ) : (
            <span className="badge">사용 가능</span>
          )}
        </p>
        {grant.note && (
          <p className="caption text-mute" style={{ marginTop: 2 }}>
            {grant.note}
          </p>
        )}
      </div>
      <div style={{ display: "flex", gap: "var(--sp-xs)" }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={props.onEdit}
        >
          수정
        </button>
        <button
          type="button"
          className="btn btn-danger btn-sm"
          onClick={props.onDelete}
        >
          삭제
        </button>
      </div>
    </li>
  );
}

function CycleList(props: {
  cycles: {
    index: number;
    start: string;
    end: string;
    grantDays: number;
    usedDays: number;
    remainingDays: number;
    state: "past" | "current" | "future";
    color: string;
  }[];
  expanded: boolean;
  onToggle: () => void;
}) {
  if (props.cycles.length === 0) return null;

  const past = props.cycles.filter((cycle) => cycle.state === "past");
  const rest = props.cycles.filter((cycle) => cycle.state !== "past");
  // 14일 주기로 21개월이면 40행이 넘는다. 기본은 최근 지난 주기만 편다.
  const hidden = Math.max(0, past.length - RECENT_PAST_CYCLES);
  const shown = props.expanded
    ? props.cycles
    : [...past.slice(-RECENT_PAST_CYCLES), ...rest];

  return (
    <section className="card" style={{ display: "grid", gap: "var(--sp-sm)" }}>
      <h2 className="body-lg strong">정기외박 주기</h2>

      {hidden > 0 && (
        <button
          type="button"
          className="btn btn-tertiary btn-sm"
          onClick={props.onToggle}
          style={{ justifySelf: "start" }}
        >
          {props.expanded ? "지난 주기 접기" : `지난 주기 ${hidden}개 보기`}
        </button>
      )}

      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {shown.map((cycle) => (
          <li
            key={cycle.start}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--sp-md)",
              padding: "var(--sp-sm)",
              borderRadius: "var(--radius-md, 12px)",
              background:
                cycle.state === "current" ? "var(--primary-pale, #e2f6d5)" : undefined,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 3,
                alignSelf: "stretch",
                borderRadius: 999,
                background: cycle.color,
              }}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p className="body-sm strong">{cycle.index}주기</p>
              <p className="caption text-mute">
                {fmtRangeTiny(cycle.start, cycle.end)}
              </p>
            </div>
            <div style={{ textAlign: "right" }}>
              {cycle.grantDays === 0 ? (
                <p className="caption text-mute">첫 적립 대기</p>
              ) : (
                <>
                  <p
                    className="body-sm strong"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {cycle.usedDays}/{cycle.grantDays}일
                  </p>
                  {cycle.state === "past" && cycle.remainingDays > 0 ? (
                    <p className="caption" style={{ color: "#a72027" }}>
                      소멸 {cycle.remainingDays}일
                    </p>
                  ) : (
                    <p className="caption text-mute">
                      잔여 {cycle.remainingDays}일
                    </p>
                  )}
                </>
              )}
            </div>
            {cycle.state === "current" && (
              <span className="badge">이번 주기</span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
