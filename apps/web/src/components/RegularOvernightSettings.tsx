/**
 * 정기외박 자동 적립 설정(웹).
 * 사용처: 보유 휴가 화면(LeaveGrantsPage).
 */

import { useState } from "react";
import type { LeaveGrantsPage } from "@leave/client";
import { useUpdateRegularOvernight } from "@leave/client";
import { REGULAR_OVERNIGHT_DEFAULTS, isValidISODate } from "@leave/shared";

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
  // 주기·회당은 숫자가 아니라 문자열로 들고 있다가 저장할 때 바꾼다. 숫자로
  // 강제하면 마지막 한 자를 지우는 순간 Number("")가 0이 되고 폴백이 걸려 1로
  // 튄다 — 42를 지우고 30을 넣으려던 사람이 130을 얻는다. 빈 칸이라는 중간
  // 상태를 허용해야 "다 지우고 새로 입력"이 성립한다.
  const [intervalDays, setIntervalDays] = useState(
    String(
      props.config.intervalDays ?? REGULAR_OVERNIGHT_DEFAULTS.intervalDays,
    ),
  );
  const [daysPerGrant, setDaysPerGrant] = useState(
    String(
      props.config.daysPerGrant ?? REGULAR_OVERNIGHT_DEFAULTS.daysPerGrant,
    ),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const interval = Number(intervalDays);
  const perGrant = Number(daysPerGrant);
  // 서버 스키마(regularOvernightConfigSchema)와 같은 범위를 미리 막아 준다.
  // 상태를 되돌리는 대신 저장을 잠그는 쪽이라 입력 도중에는 아무것도 건드리지 않는다.
  const intervalOk =
    Number.isInteger(interval) && interval >= 1 && interval <= 365;
  const perGrantOk =
    Number.isInteger(perGrant) && perGrant >= 1 && perGrant <= 30;
  // 저장이 잠긴 이유를 항상 한 줄로 남긴다. 버튼만 잠그면 왜 안 되는지 알 수 없다.
  const blocker = !enabled
    ? null
    : !intervalOk || !perGrantOk
      ? "주기는 1~365일, 회당 적립은 1~30일 사이로 입력해주세요."
      : !isValidISODate(startDate)
        ? "주기 시작일을 선택해주세요."
        : null;

  const save = async () => {
    setMessage(null);
    setError(null);
    try {
      await update.mutateAsync(
        enabled
          ? {
              enabled: true,
              startDate,
              intervalDays: interval,
              daysPerGrant: perGrant,
            }
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
        <div className="field-trio">
          <label className="field field-wide">
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
              max={365}
              value={intervalDays}
              onChange={(event) => setIntervalDays(event.target.value)}
            />
          </label>
          <label className="field">
            <span>회당 적립 (일)</span>
            <input
              className="input"
              type="number"
              min={1}
              max={30}
              value={daysPerGrant}
              onChange={(event) => setDaysPerGrant(event.target.value)}
            />
          </label>
        </div>
      )}

      {/* 값이 비면 "주기 시작일에서 일이 지난 날"이 되므로, 안내 문장은 두 값이
          다 성립할 때만 보여준다. 아닐 때는 같은 자리에 저장이 잠긴 이유를 적는다. */}
      {enabled &&
        (blocker ? (
          <small className="field-error" role="alert">
            {blocker}
          </small>
        ) : (
          <small className="caption text-mute">
            주기 시작일에서 {interval}일이 지난 날 {perGrant}일이 처음
            적립되면서 1주기가 시작돼요. 한 주기 몫은 다음 적립 전날까지 쓰고
            남으면 사라져요.
          </small>
        ))}

      <button
        type="button"
        className="btn btn-tertiary"
        disabled={update.isPending || blocker !== null}
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
