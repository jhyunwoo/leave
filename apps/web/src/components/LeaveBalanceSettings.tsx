import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  type BalanceKey,
  type Branch,
} from "@leave/shared";
import { useState } from "react";
import {
  type LeaveBalanceSummary,
  useLeaveBalances,
  useUpdateLeaveBalances,
  useUpdateRegularOvernight,
} from "../api/queries";

export function LeaveBalanceSettings(props: { branch: Branch }) {
  const query = useLeaveBalances();
  if (query.isPending || !query.data) {
    return (
      <section className="card" aria-busy="true">
        <div className="spinner" aria-label="휴가 일수 불러오는 중" />
      </section>
    );
  }
  return (
    <LeaveBalanceSettingsForm branch={props.branch} summary={query.data} />
  );
}

function LeaveBalanceSettingsForm(props: {
  branch: Branch;
  summary: LeaveBalanceSummary;
}) {
  const updateBalances = useUpdateLeaveBalances();
  const updateRegular = useUpdateRegularOvernight();
  const [totals, setTotals] = useState(
    Object.fromEntries(
      props.summary.balances.map((item) => [item.key, item.totalDays]),
    ) as Record<BalanceKey, number>,
  );
  const config = props.summary.regularOvernight;
  const [regularEnabled, setRegularEnabled] = useState(config.enabled);
  const [startDate, setStartDate] = useState(config.startDate ?? "");
  const [intervalDays, setIntervalDays] = useState(config.intervalDays ?? 42);
  const [daysPerGrant, setDaysPerGrant] = useState(config.daysPerGrant ?? 3);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveTotals = async () => {
    setMessage(null);
    setError(null);
    try {
      await updateBalances.mutateAsync({ totals });
      setMessage("휴가 총량을 저장했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  const saveRegular = async () => {
    setMessage(null);
    setError(null);
    try {
      await updateRegular.mutateAsync(
        regularEnabled
          ? { enabled: true, startDate, intervalDays, daysPerGrant }
          : { enabled: false },
      );
      setMessage("정기외박 적립 설정을 저장했습니다.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <section className="card" style={{ display: "grid", gap: "var(--sp-xl)" }}>
      <div>
        <p className="eyebrow">휴가 관리</p>
        <h2 className="display-xs" style={{ marginTop: 4 }}>
          보유 휴가 일수
        </h2>
        <p className="body-sm text-body" style={{ marginTop: 6 }}>
          규정값은 기본 제안일 뿐이에요. 실제 부대에서 받은 일수로 모두 수정할
          수 있습니다.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: "var(--sp-md)",
        }}
      >
        {BALANCE_KEYS.map((key) => {
          const balance = props.summary.balances.find(
            (item) => item.key === key,
          );
          // 주기에서 파생하는 재원은 총량을 직접 고칠 수 없다(주기마다 새로 쌓인다).
          if (balance?.cycleScoped) {
            return (
              <label key={key} className="field">
                <span>
                  {BALANCE_LABELS[key]}
                  <span className="caption text-mute" style={{ marginLeft: 6 }}>
                    이번 주기 사용 {balance.usedDays}일
                  </span>
                </span>
                <input
                  className="input"
                  type="number"
                  value={balance.totalDays}
                  readOnly
                  disabled
                />
              </label>
            );
          }
          return (
            <label key={key} className="field">
              <span>
                {BALANCE_LABELS[key]}
                <span className="caption text-mute" style={{ marginLeft: 6 }}>
                  사용 {balance?.usedDays ?? 0}일
                </span>
              </span>
              <input
                className="input"
                type="number"
                min={balance?.usedDays ?? 0}
                max={999}
                value={totals[key]}
                onChange={(event) =>
                  setTotals((current) => ({
                    ...current,
                    [key]: Math.max(0, Number(event.target.value) || 0),
                  }))
                }
              />
            </label>
          );
        })}
      </div>
      <button
        type="button"
        className="btn btn-secondary"
        disabled={updateBalances.isPending}
        onClick={() => void saveTotals()}
      >
        {updateBalances.isPending ? "저장 중…" : "휴가 일수 저장"}
      </button>

      {props.branch !== "army" && (
        <div
          className="card-sage"
          style={{
            padding: "var(--sp-lg)",
            display: "grid",
            gap: "var(--sp-md)",
          }}
        >
          <label className="check-field">
            <input
              type="checkbox"
              checked={regularEnabled}
              onChange={(event) => setRegularEnabled(event.target.checked)}
            />
            <span>
              <strong>정기외박 자동 적립</strong>
              <small>
                한 주기를 채울 때마다 자동으로 쌓여요 · 현재 자동 적립{" "}
                {props.summary.balances.find(
                  (item) => item.key === "regular_overnight",
                )?.automaticDays ?? 0}
                일
                {config.nextGrantDate
                  ? ` · 다음 적립일 ${config.nextGrantDate}`
                  : ""}
              </small>
            </span>
          </label>
          {regularEnabled && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--sp-sm)",
              }}
            >
              <label className="field">
                <span>주기 시작일</span>
                <input
                  className="input"
                  type="date"
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                />
              </label>
              <label className="field">
                <span>주기 (일)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={intervalDays}
                  onChange={(event) =>
                    setIntervalDays(Number(event.target.value) || 1)
                  }
                />
              </label>
              <label className="field">
                <span>회당 적립</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={daysPerGrant}
                  onChange={(event) =>
                    setDaysPerGrant(Number(event.target.value) || 1)
                  }
                />
              </label>
            </div>
          )}
          <button
            type="button"
            className="btn btn-tertiary"
            disabled={updateRegular.isPending}
            onClick={() => void saveRegular()}
          >
            {updateRegular.isPending ? "저장 중…" : "정기외박 설정 저장"}
          </button>
        </div>
      )}

      {message && <p className="field-success">{message}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
