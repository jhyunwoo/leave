import {
  allocationBalanceKey,
  BALANCE_KEYS,
  BALANCE_LABELS,
  inclusiveDays,
  leaveCreateSchema,
  type BalanceKey,
  type LeaveAllocationInput,
  type LeaveCreateInput,
} from "@leave/shared";
import { useMemo, useState } from "react";
import type { MyLeave } from "../api/queries";
import {
  useCreateLeave,
  useLeaveBalances,
  useUpdateLeave,
} from "../api/queries";
import { Field } from "./Field";
import { Modal } from "./Modal";

function allocationForKey(key: BalanceKey, days: number): LeaveAllocationInput {
  if (key === "regular_overnight") {
    return { category: "overnight", overnightKind: "regular", days };
  }
  if (key === "other_overnight") {
    return { category: "overnight", overnightKind: "other", days };
  }
  return { category: key, days };
}

function initialAmounts(editing: MyLeave | null): Record<BalanceKey, number> {
  const result = Object.fromEntries(
    BALANCE_KEYS.map((key) => [key, 0]),
  ) as Record<BalanceKey, number>;
  for (const allocation of editing?.allocations ?? []) {
    result[allocationBalanceKey(allocation)] = allocation.days;
  }
  return result;
}

export function LeaveFormModal(props: {
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
  onSaved: (exceededDates: string[]) => void;
}) {
  const editing = props.editing ?? null;
  const balances = useLeaveBalances();
  const [title, setTitle] = useState(editing?.title ?? "");
  const [startDate, setStartDate] = useState(
    editing?.startDate ?? props.initialDate ?? "",
  );
  const [endDate, setEndDate] = useState(
    editing?.endDate ?? props.initialDate ?? "",
  );
  const [reason, setReason] = useState(editing?.reason ?? "");
  const [amounts, setAmounts] = useState(() => initialAmounts(editing));
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLeave();
  const update = useUpdateLeave();
  const pending = create.isPending || update.isPending;
  const duration =
    startDate && endDate && startDate <= endDate
      ? inclusiveDays(startDate, endDate)
      : 0;
  const allocated = Object.values(amounts).reduce((sum, days) => sum + days, 0);
  const remainingByKey = useMemo(() => {
    const result = new Map(
      (balances.data?.balances ?? []).map((item) => [
        item.key,
        item.remainingDays,
      ]),
    );
    for (const allocation of editing?.allocations ?? []) {
      const key = allocationBalanceKey(allocation);
      result.set(key, (result.get(key) ?? 0) + allocation.days);
    }
    return result;
  }, [balances.data, editing]);

  const submit = async () => {
    const allocations = BALANCE_KEYS.filter((key) => amounts[key] > 0).map(
      (key) => allocationForKey(key, amounts[key]),
    );
    const input: LeaveCreateInput = {
      title: title.trim(),
      startDate,
      endDate,
      allocations,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    const parsed = leaveCreateSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    setError(null);
    try {
      const result = editing
        ? await update.mutateAsync({ id: editing.id, input: parsed.data })
        : await create.mutateAsync(parsed.data);
      props.onSaved(result.exceededDates);
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다");
    }
  };

  return (
    <Modal title={editing ? "휴가 수정" : "휴가 등록"} onClose={props.onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--sp-lg)",
        }}
      >
        <Field label="휴가 제목">
          <input
            className="input"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 제주도 가족여행"
            autoFocus
          />
        </Field>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--sp-md)",
          }}
        >
          <Field label="시작일">
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(event) => {
                setStartDate(event.target.value);
                if (!endDate || endDate < event.target.value) {
                  setEndDate(event.target.value);
                }
              }}
            />
          </Field>
          <Field label="종료일">
            <input
              className="input"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        <section className="card-sage" style={{ padding: "var(--sp-lg)" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "var(--sp-md)",
              marginBottom: "var(--sp-md)",
            }}
          >
            <div>
              <p className="body-sm strong">휴가 재원 배분</p>
              <p className="caption text-mute">
                일정에 어떤 휴가를 며칠씩 쓰는지 입력하세요.
              </p>
            </div>
            <p
              className="body-sm strong"
              style={{
                color:
                  duration > 0 && allocated === duration
                    ? "var(--positive-deep, #246b3b)"
                    : "var(--negative-deep, #a72027)",
                whiteSpace: "nowrap",
              }}
            >
              {allocated} / {duration}일
            </p>
          </div>
          <div style={{ display: "grid", gap: "var(--sp-sm)" }}>
            {BALANCE_KEYS.map((key) => {
              const available = remainingByKey.get(key) ?? 0;
              return (
                <label
                  key={key}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 92px",
                    alignItems: "center",
                    gap: "var(--sp-md)",
                  }}
                >
                  <span>
                    <span className="body-sm strong">
                      {BALANCE_LABELS[key]}
                    </span>
                    <span
                      className="caption text-mute"
                      style={{ marginLeft: 8 }}
                    >
                      사용 가능 {available}일
                    </span>
                  </span>
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={Math.max(available, amounts[key])}
                    value={amounts[key]}
                    aria-label={`${BALANCE_LABELS[key]} 사용 일수`}
                    onChange={(event) =>
                      setAmounts((current) => ({
                        ...current,
                        [key]: Math.max(0, Number(event.target.value) || 0),
                      }))
                    }
                  />
                </label>
              );
            })}
          </div>
        </section>

        <Field label="사유 (선택)">
          <textarea
            className="input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="사유를 남기면 부대원들이 함께 볼 수 있어요"
            rows={3}
          />
        </Field>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div style={{ display: "flex", gap: "var(--sp-md)" }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ flex: 1 }}
            onClick={props.onClose}
          >
            취소
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            style={{ flex: 2 }}
            disabled={pending || allocated !== duration}
          >
            {pending ? "저장 중…" : editing ? "변경사항 저장" : "휴가 등록"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
