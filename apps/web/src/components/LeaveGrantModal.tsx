/**
 * 적립분 추가·수정 모달(웹).
 * 사용처: 보유 휴가 화면(LeaveGrantsPage).
 */

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  leaveGrantCreateSchema,
  type BalanceKey,
} from "@leave/shared";
import { useState } from "react";
import type { LeaveGrantItem } from "@leave/client";
import { useCreateLeaveGrant, useUpdateLeaveGrant } from "@leave/client";
import { Modal } from "./Modal";

/**
 * 적립분 추가·수정. 재원은 수정할 때 바꿀 수 없다 — 옮기면 두 재원의 사용분 귀속이
 * 조용히 뒤집힌다. 만기는 선택이고 지난 날짜도 고를 수 있다(뒤늦게 장부를 맞추는 일이 흔하다).
 */
export function LeaveGrantModal(props: {
  editing: LeaveGrantItem | null;
  initialKey?: BalanceKey;
  lockedKey?: BalanceKey | null;
  onClose: () => void;
}) {
  const editing = props.editing;
  const create = useCreateLeaveGrant();
  const update = useUpdateLeaveGrant();

  const [balanceKey, setBalanceKey] = useState<BalanceKey>(
    editing?.balanceKey ?? props.initialKey ?? "award",
  );
  const [days, setDays] = useState(String(editing?.days ?? 1));
  const [hasExpiry, setHasExpiry] = useState(Boolean(editing?.expiresOn));
  const [expiresOn, setExpiresOn] = useState(editing?.expiresOn ?? "");
  const [grantedOn, setGrantedOn] = useState(editing?.grantedOn ?? "");
  const [note, setNote] = useState(editing?.note ?? "");
  const [error, setError] = useState<string | null>(null);

  const pending = create.isPending || update.isPending;

  const submit = async () => {
    setError(null);
    const input = {
      balanceKey,
      days: Number(days) || 0,
      expiresOn: hasExpiry && expiresOn ? expiresOn : null,
      grantedOn: grantedOn || null,
      note: note.trim() ? note.trim() : null,
    };
    const parsed = leaveGrantCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    if (hasExpiry && !expiresOn) {
      setError("만기 기한을 선택해주세요");
      return;
    }

    try {
      if (editing) {
        const { balanceKey: _ignored, ...rest } = parsed.data;
        await update.mutateAsync({ id: editing.id, input: rest });
      } else {
        await create.mutateAsync(parsed.data);
      }
      props.onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "저장하지 못했습니다",
      );
    }
  };

  return (
    <Modal
      title={editing ? "적립분 수정" : "적립분 추가"}
      onClose={props.onClose}
    >
      <div style={{ display: "grid", gap: "var(--sp-md)" }}>
        <div className="field">
          <span>재원</span>
          <div
            style={{ display: "flex", flexWrap: "wrap", gap: "var(--sp-xs)" }}
          >
            {BALANCE_KEYS.map((key) => {
              const selected = key === balanceKey;
              const disabled = Boolean(editing) || key === props.lockedKey;
              return (
                <button
                  key={key}
                  type="button"
                  className={`btn btn-sm ${selected ? "btn-primary" : "btn-secondary"}`}
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => setBalanceKey(key)}
                >
                  {BALANCE_LABELS[key]}
                </button>
              );
            })}
          </div>
          {editing && (
            <small className="text-mute">
              재원은 바꿀 수 없어요. 옮기려면 지우고 다시 만들어주세요.
            </small>
          )}
        </div>

        <label className="field">
          <span>일수</span>
          <input
            className="input"
            type="number"
            min={1}
            value={days}
            onChange={(event) => setDays(event.target.value)}
          />
        </label>

        <label className="check-field">
          <input
            type="checkbox"
            checked={hasExpiry}
            onChange={(event) => setHasExpiry(event.target.checked)}
          />
          <span>
            <strong>사용 만기 기한</strong>
            <small>끄면 만기 없이 언제든 쓸 수 있어요</small>
          </span>
        </label>
        {hasExpiry && (
          <label className="field">
            <span>만기 기한</span>
            <input
              className="input"
              type="date"
              value={expiresOn}
              onChange={(event) => setExpiresOn(event.target.value)}
            />
          </label>
        )}

        <label className="field">
          <span>부여일 (선택 · 이 날부터 사용)</span>
          <input
            className="input"
            type="date"
            value={grantedOn}
            onChange={(event) => setGrantedOn(event.target.value)}
          />
        </label>

        <label className="field">
          <span>메모 (선택)</span>
          <input
            className="input"
            type="text"
            maxLength={100}
            placeholder="예: 사격 우수"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div style={{ display: "flex", gap: "var(--sp-sm)" }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void submit()}
            style={{ flex: 1 }}
          >
            {pending ? "저장 중…" : editing ? "수정" : "추가"}
          </button>
          <button
            type="button"
            className="btn btn-tertiary"
            onClick={props.onClose}
          >
            취소
          </button>
        </div>
      </div>
    </Modal>
  );
}
