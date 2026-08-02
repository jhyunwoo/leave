import { useState } from "react";
import type { LeaveGrantsPage } from "../api/queries";
import { useUpdateRegularOvernight } from "../api/queries";

/**
 * 정기외박 자동 적립 설정. 잔여량이 이 설정에서 파생하므로 육군에서는 쓰지 않는다.
 * 예전에는 프로필의 휴가 총량 편집기 안에 있었고, 보유 휴가 화면으로 옮겨 왔다.
 */
export function RegularOvernightSettings(props: {
  config: LeaveGrantsPage["regularOvernight"];
}) {
  const update = useUpdateRegularOvernight();
  const [enabled, setEnabled] = useState(props.config.enabled);
  const [startDate, setStartDate] = useState(props.config.startDate ?? "");
  const [intervalDays, setIntervalDays] = useState(
    props.config.intervalDays ?? 42,
  );
  const [daysPerGrant, setDaysPerGrant] = useState(
    props.config.daysPerGrant ?? 3,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setMessage(null);
    setError(null);
    try {
      await update.mutateAsync(
        enabled
          ? { enabled: true, startDate, intervalDays, daysPerGrant }
          : { enabled: false },
      );
      setMessage("정기외박 적립 설정을 저장했어요.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <section
      className="card-sage"
      style={{ padding: "var(--sp-lg)", display: "grid", gap: "var(--sp-md)" }}
    >
      <label className="check-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>
          <strong>정기외박 자동 적립</strong>
          <small>
            한 주기를 채울 때마다 자동으로 쌓여요
            {props.config.nextGrantDate
              ? ` · 다음 적립일 ${props.config.nextGrantDate}`
              : ""}
          </small>
        </span>
      </label>

      {enabled && (
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

      {enabled && (
        <small className="caption text-mute">
          주기 시작일에서 {intervalDays}일이 지난 날 {daysPerGrant}일이 처음
          적립되면서 1주기가 시작돼요. 한 주기 몫은 다음 적립 전날까지 쓰고
          남으면 사라져요.
        </small>
      )}

      <button
        type="button"
        className="btn btn-tertiary"
        disabled={update.isPending}
        onClick={() => void save()}
      >
        {update.isPending ? "저장 중…" : "정기외박 설정 저장"}
      </button>

      {message && <p className="field-success">{message}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
