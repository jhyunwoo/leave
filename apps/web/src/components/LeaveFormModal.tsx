import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  draftDaysByKey,
  draftsToSegments,
  fitDrafts,
  fmtDateShort,
  inclusiveDays,
  leaveCreateSchema,
  removeDraft,
  resolveDrafts,
  segmentBalanceKey,
  segmentsToDrafts,
  setDraftEnd,
  splitLastDraft,
  type BalanceKey,
  type LeaveCreateInput,
  type SegmentDraft,
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
  const [drafts, setDrafts] = useState<SegmentDraft[]>(() =>
    editing?.segments.length
      ? segmentsToDrafts(editing.segments)
      : fitDrafts(
          [],
          editing?.startDate ?? props.initialDate ?? "",
          editing?.endDate ?? props.initialDate ?? "",
        ),
  );
  const [error, setError] = useState<string | null>(null);

  const create = useCreateLeave();
  const update = useUpdateLeave();
  const pending = create.isPending || update.isPending;
  const validRange = Boolean(startDate && endDate && startDate <= endDate);
  const duration = validRange ? inclusiveDays(startDate, endDate) : 0;
  const resolved = useMemo(
    () => (validRange ? resolveDrafts(startDate, drafts) : []),
    [validRange, startDate, drafts],
  );

  /** 기간이 바뀌면 구간을 다시 맞춰 항상 전체를 덮게 한다. */
  const applyRange = (nextStart: string, nextEnd: string) => {
    setStartDate(nextStart);
    setEndDate(nextEnd);
    setDrafts((current) => fitDrafts(current, nextStart, nextEnd));
  };

  const remainingByKey = useMemo(() => {
    const result = new Map<BalanceKey, number>(
      (balances.data?.balances ?? []).map((item) => [
        item.key,
        item.remainingDays,
      ]),
    );
    for (const segment of editing?.segments ?? []) {
      const key = segmentBalanceKey(segment);
      result.set(key, (result.get(key) ?? 0) + segment.days);
    }
    return result;
  }, [balances.data, editing]);

  // 폼에서 이미 배정한 몫까지 뺀 실제 남은 일수.
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    return result;
  }, [remainingByKey, validRange, startDate, drafts]);

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    title.trim().length > 0;

  const submit = async () => {
    const input: LeaveCreateInput = {
      title: title.trim(),
      segments: draftsToSegments(startDate, drafts),
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
                const next = event.target.value;
                applyRange(next, !endDate || endDate < next ? next : endDate);
              }}
            />
          </Field>
          <Field label="종료일">
            <input
              className="input"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) => applyRange(startDate, event.target.value)}
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
              <p className="body-sm strong">휴가 구간</p>
              <p className="caption text-mute">
                언제부터 언제까지가 어떤 휴가인지 나눠서 지정하세요.
              </p>
            </div>
            <p className="body-sm strong" style={{ whiteSpace: "nowrap" }}>
              {duration}일
            </p>
          </div>

          {validRange ? (
            <div style={{ display: "grid", gap: "var(--sp-sm)" }}>
              {resolved.map((draft, index) => {
                const isLast = index === resolved.length - 1;
                // 뒤에 남은 구간 수만큼 최소 하루씩 남겨둬야 한다.
                const maxEnd = addDays(endDate, -(resolved.length - 1 - index));
                return (
                  <div
                    key={index}
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "minmax(0, 1fr) minmax(0, 1fr) auto auto",
                      alignItems: "center",
                      gap: "var(--sp-sm)",
                    }}
                  >
                    <select
                      className="input"
                      value={draft.key}
                      aria-label={`${index + 1}번째 구간 휴가 재원`}
                      onChange={(event) =>
                        setDrafts((current) =>
                          current.map((item, i) =>
                            i === index
                              ? {
                                  ...item,
                                  key: event.target.value as BalanceKey,
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      {BALANCE_KEYS.map((key) => (
                        <option key={key} value={key}>
                          {BALANCE_LABELS[key]} (잔여{" "}
                          {availableByKey.get(key) ?? 0}일)
                        </option>
                      ))}
                    </select>

                    {isLast ? (
                      <span className="caption text-mute">
                        {fmtDateShort(draft.startDate)} –{" "}
                        {fmtDateShort(draft.endDate)}
                      </span>
                    ) : (
                      <input
                        className="input"
                        type="date"
                        value={draft.endDate}
                        min={draft.startDate}
                        max={maxEnd}
                        aria-label={`${index + 1}번째 구간 종료일`}
                        onChange={(event) =>
                          setDrafts((current) =>
                            setDraftEnd(
                              current,
                              index,
                              event.target.value,
                              startDate,
                              endDate,
                            ),
                          )
                        }
                      />
                    )}

                    <span
                      className="body-sm strong"
                      style={{ whiteSpace: "nowrap" }}
                    >
                      {draft.days}일
                    </span>

                    <button
                      type="button"
                      className="btn btn-secondary"
                      disabled={resolved.length <= 1}
                      aria-label={`${index + 1}번째 구간 삭제`}
                      onClick={() =>
                        setDrafts((current) =>
                          removeDraft(current, index, startDate, endDate),
                        )
                      }
                    >
                      ✕
                    </button>
                  </div>
                );
              })}

              <button
                type="button"
                className="btn btn-secondary"
                disabled={duration <= drafts.length}
                onClick={() =>
                  setDrafts((current) => {
                    const next = splitLastDraft(
                      current,
                      startDate,
                      endDate,
                      "regular_overnight",
                    );
                    return next ?? current;
                  })
                }
              >
                구간 추가
              </button>
            </div>
          ) : (
            <p className="caption text-mute">
              시작일과 종료일을 먼저 골라주세요.
            </p>
          )}

          {overused.length > 0 && (
            <p
              className="field-error"
              role="alert"
              style={{ marginTop: "var(--sp-sm)" }}
            >
              {overused
                .map(
                  ([key, remaining]) =>
                    `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
                )
                .join(", ")}
            </p>
          )}
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
            disabled={pending || !canSubmit}
          >
            {pending ? "저장 중…" : editing ? "변경사항 저장" : "휴가 등록"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
