import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  balanceKeyToCategory,
  checkRegularOvernight,
  draftDaysByKey,
  draftsToSegments,
  fitDrafts,
  fmtDateShort,
  inclusiveDays,
  isRegularOvernightCycleBased,
  leaveCreateSchema,
  regularOvernightAvailableIn,
  regularOvernightBlockMessage,
  removeDraft,
  resolveDrafts,
  segmentBalanceKey,
  segmentsToDrafts,
  setDraftEnd,
  splitLastDraft,
  type BalanceKey,
  type LeaveCreateInput,
  type SegmentDraft,
  type SegmentLike,
} from "@leave/shared";
import { useMemo, useState } from "react";
import type { MyLeave } from "../api/queries";
import {
  useCreateLeave,
  useLeaveBalances,
  useMe,
  useMyLeaves,
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
  const me = useMe(true);
  const myLeaves = useMyLeaves();
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

  const regularConfig = balances.data?.regularOvernight ?? null;
  const cycleBased = isRegularOvernightCycleBased(regularConfig);
  const dischargeAt = me.data?.user.dischargeAt ?? "";

  // 이미 저장된 내 정기외박 구간. 수정 중이면 그 휴가 몫은 빼야 자기 자신과 부딪히지 않는다.
  const savedRegular = useMemo<SegmentLike[]>(
    () =>
      (myLeaves.data?.leaves ?? [])
        .filter((leave) => leave.id !== editing?.id)
        .flatMap((leave) => leave.segments),
    [myLeaves.data, editing],
  );

  // 폼이 이번에 정기외박으로 잡아둔 구간.
  const draftRegular = useMemo<SegmentLike[]>(
    () =>
      resolved
        .filter((draft) => draft.key === "regular_overnight")
        .map((draft) => ({
          ...balanceKeyToCategory(draft.key),
          startDate: draft.startDate,
          endDate: draft.endDate,
        })),
    [resolved],
  );

  // 주기 재원은 총합이 아니라 날짜가 속한 주기로 따진다.
  const regularBlock = useMemo(() => {
    if (!cycleBased || !dischargeAt || !draftRegular.length) return null;
    return checkRegularOvernight({
      config: regularConfig,
      existing: savedRegular,
      requested: draftRegular,
      dischargeAt,
    });
  }, [cycleBased, dischargeAt, regularConfig, savedRegular, draftRegular]);

  // 폼에서 이미 배정한 몫까지 뺀 실제 남은 일수.
  const availableByKey = useMemo(() => {
    const used = validRange ? draftDaysByKey(startDate, drafts) : new Map();
    const result = new Map(remainingByKey);
    for (const [key, days] of used) {
      result.set(key, (result.get(key) ?? 0) - days);
    }
    // 주기 재원은 스칼라 잔여가 "이번 주기" 값이라 미래 주기를 잘못 막는다.
    // 구간 행마다 그 날짜의 주기로 따로 계산한다(아래 rowAvailable).
    if (cycleBased) result.delete("regular_overnight");
    return result;
  }, [remainingByKey, validRange, startDate, drafts, cycleBased]);

  /** 이 구간 날짜가 속한 주기까지 반영한, 행 하나짜리 잔여 표. */
  const rowAvailable = (from: string, to: string) => {
    if (!cycleBased) return availableByKey;
    return new Map(availableByKey).set(
      "regular_overnight",
      regularOvernightAvailableIn({
        config: regularConfig,
        used: [...savedRegular, ...draftRegular],
        dischargeAt,
        from,
        to,
      }),
    );
  };

  const overused = [...availableByKey.entries()].filter(
    ([, remaining]) => remaining < 0,
  );
  const canSubmit =
    validRange &&
    drafts.length > 0 &&
    !overused.length &&
    !regularBlock &&
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
                const available = rowAvailable(draft.startDate, draft.endDate);
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
                          {BALANCE_LABELS[key]} (잔여 {available.get(key) ?? 0}
                          일)
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

          {(overused.length > 0 || regularBlock) && (
            <p
              className="field-error"
              role="alert"
              style={{ marginTop: "var(--sp-sm)" }}
            >
              {[
                ...overused.map(
                  ([key, remaining]) =>
                    `${BALANCE_LABELS[key]}를 ${-remaining}일 초과했어요`,
                ),
                ...(regularBlock
                  ? [regularOvernightBlockMessage(regularBlock)]
                  : []),
              ].join(", ")}
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
