/**
 * 웹 휴가 등록/수정 모달.
 *
 * 사용처: CalendarPage(날짜 클릭), LeavesPage(등록/수정 버튼).
 *
 * 폼의 규칙(구간 재배치·잔여 계산·정기외박 주기 검사·대안 날짜 추천)은 전부
 * `useLeaveForm`에 있고, 이 파일은 그 결과를 HTML로 그리기만 한다. 같은 규칙을
 * 네이티브 앱도 쓴다(apps/native/src/components/leave-form-modal.tsx).
 */
import { useLeaveForm, type MyLeave } from "@leave/client";
import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  fmtDateShort,
  fmtRangeTiny,
  isConfirmedLeaveStatus,
  LEAVE_STATUS_LABELS,
  removeDraft,
  setDraftEnd,
  splitLastDraft,
  type BalanceKey,
  type LeaveStatus,
} from "@leave/shared";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { OfficialDisclaimer } from "./OfficialDisclaimer";

/** 웹에서 사용자가 직접 고를 수 있는 계획 상태. */
const STATUS_OPTIONS = [
  "draft",
  "shared",
  "requested",
  "approved",
  "rejected",
  "cancelled",
  "completed",
] as const satisfies readonly LeaveStatus[];

/** 계획 상태가 무슨 뜻인지 한 줄로 설명한다. */
function statusHint(status: LeaveStatus): string {
  if (status === "draft") {
    return "초안은 나만 볼 수 있고 그룹 집계와 출타 명단에 들어가지 않아요.";
  }
  if (isConfirmedLeaveStatus(status)) {
    return "확정된 일정이에요. 달력 출타 명단에 이름과 함께 보이고, 희망 일정과 구분해 표시됩니다.";
  }
  return "희망 일정이에요. 달력 출타 명단에 이름과 함께 같은 그룹 구성원에게 보여요.";
}

export function LeaveFormModal(props: {
  initialDate?: string;
  editing?: MyLeave | null;
  onClose: () => void;
  onSaved: (exceededDates: string[]) => void;
}) {
  const form = useLeaveForm({
    initialDate: props.initialDate,
    editing: props.editing,
  });
  const { editing, startDate, endDate, duration, resolved, validRange } = form;

  const save = async () => {
    const result = await form.submit();
    if (!result) return;
    props.onSaved(result.exceededDates);
    props.onClose();
  };

  return (
    <Modal title={editing ? "휴가 수정" : "휴가 등록"} onClose={props.onClose}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
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
            value={form.title}
            onChange={(event) => form.setTitle(event.target.value)}
            placeholder="예: 제주도 가족여행"
            autoFocus
          />
        </Field>
        <div className="field-pair">
          <Field label="시작일">
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(event) => {
                // 시작일이 종료일을 넘어서면 종료일을 함께 끌고 간다.
                const next = event.target.value;
                form.applyRange(
                  next,
                  !endDate || endDate < next ? next : endDate,
                );
              }}
            />
          </Field>
          <Field label="종료일">
            <input
              className="input"
              type="date"
              value={endDate}
              min={startDate || undefined}
              onChange={(event) =>
                form.applyRange(startDate, event.target.value)
              }
            />
          </Field>
        </div>

        <Field label="계획 상태" hint={statusHint(form.status)}>
          <select
            className="input"
            value={form.status}
            onChange={(e) => form.setStatus(e.target.value as LeaveStatus)}
            data-testid="leave-status"
          >
            {STATUS_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {LEAVE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </Field>

        {form.blackoutWarning && (
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
            {form.selectedSimulation
              ? `${form.selectedSimulation.label} · 구간 최고 ${form.selectedSimulation.peak}%`
              : "기준을 불러오는 중이거나 설정되지 않았어요"}
          </p>
          {form.recommendations.length > 0 && (
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
                {form.recommendations.map((range) => (
                  <button
                    key={`${range.startDate}-${range.endDate}`}
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      form.applyRange(range.startDate, range.endDate)
                    }
                  >
                    {fmtRangeTiny(range.startDate, range.endDate)} · 최고{" "}
                    {range.peakPercent}%
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
                const available = form.rowAvailable(
                  draft.startDate,
                  draft.endDate,
                );
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
                        form.setDrafts((current) =>
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

                    {/* 마지막 구간의 종료일은 전체 종료일에 묶여 있어 고칠 수 없다. */}
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
                          form.setDrafts((current) =>
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
                        form.setDrafts((current) =>
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
                disabled={duration <= form.drafts.length}
                onClick={() =>
                  form.setDrafts(
                    (current) =>
                      splitLastDraft(
                        current,
                        startDate,
                        endDate,
                        "regular_overnight",
                      ) ?? current,
                  )
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

          {form.balanceBlockMessage && (
            <p
              className="field-error"
              role="alert"
              style={{ marginTop: "var(--sp-sm)" }}
            >
              {form.balanceBlockMessage}
            </p>
          )}
        </section>

        <Field label="사유 (선택)">
          <textarea
            className="input"
            value={form.reason}
            onChange={(event) => form.setReason(event.target.value)}
            placeholder="사유를 남기면 부대원들이 함께 볼 수 있어요"
            rows={3}
          />
        </Field>
        {form.error && (
          <p className="field-error" role="alert">
            {form.error}
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
            disabled={form.pending || !form.canSubmit}
          >
            {form.pending
              ? "저장 중…"
              : editing
                ? "변경사항 저장"
                : "휴가 등록"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
