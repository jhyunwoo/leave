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
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  leaveCreateSchema,
  monthsSpanning,
  recommendDateRanges,
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
  type LeaveStatus,
  type SegmentDraft,
  type SegmentLike,
} from "@leave/shared";
import { useMemo, useState } from "react";
import type { MyLeave } from "../api/queries";
import {
  useCalendarDays,
  useCreateLeave,
  useLeaveBalances,
  useMe,
  useMyLeaves,
  useUpdateLeave,
} from "../api/queries";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { OfficialDisclaimer } from "./OfficialDisclaimer";

/** 대안 날짜를 찾을 때 선택 구간 앞뒤로 살펴보는 일수. */
const RECOMMENDATION_RADIUS_DAYS = 14;

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
  // 새 계획의 기본은 "희망"(익명 집계 반영). 초안은 나만 보고 집계에서 빠진다.
  const [status, setStatus] = useState<LeaveStatus>(editing?.status ?? "shared");
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

  // 추천은 선택 구간 밖 ±RECOMMENDATION_RADIUS_DAYS까지 살펴보므로, 그 범위가
  // 걸치는 달을 모두 받아야 월초·월말 후보가 빠지지 않는다.
  const calendarMonths = useMemo(() => {
    if (!startDate) return [];
    const end = endDate && endDate >= startDate ? endDate : startDate;
    return monthsSpanning(
      addDays(startDate, -RECOMMENDATION_RADIUS_DAYS),
      addDays(end, RECOMMENDATION_RADIUS_DAYS),
    );
  }, [startDate, endDate]);
  const calendar = useCalendarDays(me.data?.unit?.id ?? null, calendarMonths);

  /** 이 계획을 더했을 때 구간 안에서 가장 붐비는 날의 비율. */
  const selectedSimulation = useMemo(() => {
    if (!validRange || calendar.days.length === 0) return null;
    const stats = new Map(calendar.days.map((day) => [day.date, day]));
    let peak = 0;
    let exceeded = false;
    for (let index = 0; index < duration; index += 1) {
      const stat = stats.get(addDays(startDate, index));
      if (!stat || stat.allowed <= 0) return null;
      const countAfter = stat.count + (editing ? 0 : 1);
      peak = Math.max(peak, Math.round((countAfter / stat.allowed) * 100));
      exceeded ||= countAfter > stat.allowed;
    }
    return { peak, exceeded };
  }, [calendar.days, duration, editing, startDate, validRange]);

  /** 선택 구간이 블랙아웃에 걸리면 저장 전에 알려야 한다. */
  const blackoutWarning = useMemo(() => {
    if (!validRange) return false;
    const blocked = new Set(
      calendar.days.filter((day) => day.blocked).map((day) => day.date),
    );
    for (let index = 0; index < duration; index += 1) {
      if (blocked.has(addDays(startDate, index))) return true;
    }
    return false;
  }, [calendar.days, duration, startDate, validRange]);

  const recommendations = useMemo(() => {
    if (!validRange || calendar.days.length === 0) return [];
    return recommendDateRanges({
      days: calendar.days.map((day) => ({
        date: day.date,
        count: day.count + (editing ? 0 : 1),
        allowed: day.allowed,
      })),
      selectedStart: startDate,
      durationDays: duration,
      radiusDays: RECOMMENDATION_RADIUS_DAYS,
    });
  }, [calendar.days, duration, editing, startDate, validRange]);

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
      status,
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

        <Field
          label="계획 상태"
          hint={
            status === "draft"
              ? "초안은 나만 볼 수 있고 그룹 집계에 들어가지 않아요."
              : isConfirmedLeaveStatus(status)
                ? "확정된 일정이에요. 달력에서 희망 일정과 구분해 보여줍니다."
                : "희망 일정으로 익명 집계에 반영돼요. 누구인지는 드러나지 않습니다."
          }
        >
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as LeaveStatus)}
            data-testid="leave-status"
          >
            {(
              [
                "draft",
                "shared",
                "requested",
                "approved",
                "rejected",
                "cancelled",
                "completed",
              ] as const
            ).map((value) => (
              <option key={value} value={value}>
                {LEAVE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        {blackoutWarning && (
          <p
            className="caption strong"
            style={{
              padding: "var(--sp-md)",
              borderRadius: "var(--r-md)",
              border: "1px solid var(--warning)",
              color: "var(--warning-content)",
            }}
            role="status"
          >
            이 기간에는 제한 기간(검열·훈련)이 등록돼 있어요. 출타율과 무관하게
            지휘관이 휴가를 제한할 수 있습니다.
          </p>
        )}

        <OfficialDisclaimer />

        <section className="card-sage" style={{ padding: "var(--sp-lg)" }}>
          <p className="caption text-mute">이 계획을 더하면</p>
          <p className="body-sm strong" style={{ marginTop: 2 }}>
            {selectedSimulation
              ? `${
                  selectedSimulation.exceeded
                    ? "초과"
                    : selectedSimulation.peak >= 80
                      ? "임박"
                      : selectedSimulation.peak >= 50
                        ? "보통"
                        : "여유"
                } · 구간 최고 ${selectedSimulation.peak}%`
              : "기준을 불러오는 중이거나 설정되지 않았어요"}
          </p>
          {recommendations.length > 0 && (
            <div style={{ marginTop: "var(--sp-md)" }}>
              <p className="caption text-mute">더 여유로운 인접 날짜</p>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "var(--sp-sm)",
                  marginTop: "var(--sp-sm)",
                }}
              >
                {recommendations.map((range) => (
                  <button
                    key={`${range.startDate}-${range.endDate}`}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => applyRange(range.startDate, range.endDate)}
                  >
                    {fmtDateShort(range.startDate)} ~{" "}
                    {fmtDateShort(range.endDate)} · 최고 {range.peakPercent}%
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

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
