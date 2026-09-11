/**
 * 외출 자동 적립 설정(웹) — 평일·주말 갈래마다 한 벌.
 * 사용처: 보유 휴가 화면(LeaveGrantsPage).
 *
 * 정기외박 설정과 나란히 놓이지만 입력이 하나 적다. 외출은 어느 군이든 "한 달에
 * 몇 번"으로 운영돼 주기 단위가 언제나 달이고, 일 단위를 고를 이유가 없다.
 * 대신 회당 값의 뜻이 다르다 — 외출은 당일 복귀라 **일수가 아니라 횟수**다.
 */

import { useState } from "react";
import type { LeaveGrantsPage } from "@leave/client";
import { useUpdateOuting } from "@leave/client";
import {
  BALANCE_LABELS,
  fmtDateShort,
  fmtRangeTiny,
  isValidISODate,
  outingBalanceKey,
  outingGuidance,
  OUTING_DEFAULTS,
  OUTING_SOURCES,
  type Branch,
  type OutingKind,
} from "@leave/shared";

type OutingFund = LeaveGrantsPage["outing"][number];

/** 주기(개월)의 허용 범위. 서버 스키마(outingConfigSchema)와 같은 값이어야 한다. */
const INTERVAL_LIMITS = { min: 1, max: 12 } as const;
const COUNT_LIMITS = { min: 1, max: 30 } as const;

export function OutingSettings(props: {
  branch: Branch;
  funds: readonly OutingFund[];
}) {
  const guidance = outingGuidance(props.branch);
  return (
    <section
      className="card-sage"
      style={{ padding: "var(--sp-lg)", display: "grid", gap: "var(--sp-lg)" }}
    >
      <div>
        <h2 className="body-lg strong">외출 자동 적립</h2>
        <p className="caption text-mute" style={{ marginTop: "var(--sp-xs)" }}>
          {guidance.summary} {guidance.detail}
        </p>
      </div>

      {props.funds.map((fund) => (
        <OutingKindFields key={fund.kind} branch={props.branch} fund={fund} />
      ))}

      <p className="caption text-mute">
        {guidance.disclaimer}{" "}
        {OUTING_SOURCES.map((source, index) => (
          <span key={source.url}>
            {index > 0 ? " · " : ""}
            <a href={source.url} target="_blank" rel="noreferrer noopener">
              {source.label}
            </a>
          </span>
        ))}
      </p>
    </section>
  );
}

function OutingKindFields(props: { branch: Branch; fund: OutingFund }) {
  const { fund } = props;
  const kind: OutingKind = fund.kind;
  const label = BALANCE_LABELS[outingBalanceKey(kind)];
  const preset = OUTING_DEFAULTS[props.branch][kind];
  const update = useUpdateOuting();

  const [enabled, setEnabled] = useState(fund.enabled);
  const [carryOver, setCarryOver] = useState(fund.carryOver);
  const [startDate, setStartDate] = useState(fund.startDate ?? "");
  // 숫자가 아니라 문자열로 들고 있다가 저장할 때 바꾼다. 숫자로 강제하면 마지막 한
  // 자를 지우는 순간 Number("")가 0이 되고 폴백이 1로 튄다(RegularOvernightSettings
  // 주석과 같은 이유).
  const [interval, setInterval] = useState(
    String(fund.intervalMonths ?? preset.intervalMonths),
  );
  const [count, setCount] = useState(
    String(fund.daysPerGrant ?? preset.countPerGrant),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const intervalValue = Number(interval);
  const countValue = Number(count);
  const intervalOk =
    Number.isInteger(intervalValue) &&
    intervalValue >= INTERVAL_LIMITS.min &&
    intervalValue <= INTERVAL_LIMITS.max;
  const countOk =
    Number.isInteger(countValue) &&
    countValue >= COUNT_LIMITS.min &&
    countValue <= COUNT_LIMITS.max;
  // 저장이 잠긴 이유를 항상 한 줄로 남긴다. 버튼만 잠그면 왜 안 되는지 알 수 없다.
  const blocker = !enabled
    ? null
    : !intervalOk || !countOk
      ? `주기는 ${INTERVAL_LIMITS.min}~${INTERVAL_LIMITS.max}개월, 회당 횟수는 ${COUNT_LIMITS.min}~${COUNT_LIMITS.max}회 사이로 입력해주세요.`
      : !isValidISODate(startDate)
        ? "주기 시작일을 선택해주세요."
        : null;

  const current = fund.cycles.find((cycle) => cycle.state === "current");

  const save = async () => {
    setMessage(null);
    setError(null);
    try {
      await update.mutateAsync(
        enabled
          ? {
              kind,
              enabled: true,
              startDate,
              // 외출은 언제나 달 단위다 — 일 단위 칸을 두지 않으므로 비워 보낸다.
              intervalDays: null,
              intervalMonths: intervalValue,
              daysPerGrant: countValue,
              carryOver,
            }
          : { kind, enabled: false },
      );
      setMessage(`${label} 적립 설정을 저장했어요.`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "잠시 후 다시 시도해주세요",
      );
    }
  };

  return (
    <div style={{ display: "grid", gap: "var(--sp-md)" }}>
      <label className="check-field">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
        />
        <span>
          <strong>{label}</strong>
          <small>
            {current
              ? `이번 주기 ${fmtRangeTiny(current.start, current.end)} · ${current.usedDays}/${current.grantDays}회 사용`
              : "한 주기를 채울 때마다 자동으로 쌓여요"}
            {fund.nextGrantDate
              ? ` · 다음 적립 ${fmtDateShort(fund.nextGrantDate)}`
              : ""}
          </small>
        </span>
      </label>

      {enabled && (
        <>
          <label className="check-field">
            <input
              type="checkbox"
              checked={carryOver}
              onChange={(event) => setCarryOver(event.target.checked)}
            />
            <span>
              <strong>주기가 끝나도 이월하기</strong>
              <small>부대가 안 쓴 외출을 다음 달로 넘겨주면 켜세요.</small>
            </span>
          </label>

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
              <span>주기 (개월)</span>
              <input
                className="input"
                type="number"
                min={INTERVAL_LIMITS.min}
                max={INTERVAL_LIMITS.max}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
              />
            </label>
            <label className="field">
              <span>회당 횟수</span>
              <input
                className="input"
                type="number"
                min={COUNT_LIMITS.min}
                max={COUNT_LIMITS.max}
                value={count}
                onChange={(event) => setCount(event.target.value)}
              />
            </label>
          </div>

          {blocker && (
            <small className="field-error" role="alert">
              {blocker}
            </small>
          )}
        </>
      )}

      <button
        type="button"
        className="btn btn-tertiary"
        disabled={update.isPending || blocker !== null}
        onClick={() => void save()}
      >
        {update.isPending ? "저장 중…" : `${label} 설정 저장`}
      </button>

      {message && <p className="field-success">{message}</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
