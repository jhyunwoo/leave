import { unitEventCreateSchema } from "@leave/shared";
import {
  useCreateUnitEvent,
  useDeleteUnitEvent,
  useUpdateUnitEvent,
  type UnitEvent,
} from "@leave/client";
import { useState } from "react";
import { Modal } from "./Modal";

export function UnitEventModal(props: {
  unitId: string;
  initialDate: string;
  event?: UnitEvent;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(props.event?.title ?? "");
  const [isHoliday, setIsHoliday] = useState(props.event?.isHoliday ?? false);
  const [startDate, setStartDate] = useState(
    props.event?.startDate ?? props.initialDate,
  );
  const [endDate, setEndDate] = useState(
    props.event?.endDate ?? props.initialDate,
  );
  const [startTime, setStartTime] = useState(props.event?.startTime ?? "");
  const [endTime, setEndTime] = useState(props.event?.endTime ?? "");
  const [details, setDetails] = useState(props.event?.details ?? "");
  const [error, setError] = useState<string | null>(null);
  const createEvent = useCreateUnitEvent(props.unitId);
  const updateEvent = useUpdateUnitEvent(props.unitId);
  const deleteEvent = useDeleteUnitEvent(props.unitId);
  const pending =
    createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const save = async () => {
    const parsed = unitEventCreateSchema.safeParse({
      title,
      isHoliday,
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      details: details || null,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "입력값을 확인해주세요");
      return;
    }
    try {
      if (props.event) {
        await updateEvent.mutateAsync({
          id: props.event.id,
          input: parsed.data,
          previous: props.event,
        });
      } else {
        await createEvent.mutateAsync(parsed.data);
      }
      props.onClose();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "부대 일정을 저장하지 못했어요",
      );
    }
  };

  return (
    <Modal
      title={props.event ? "부대 일정 수정" : "부대 일정 추가"}
      onClose={props.onClose}
    >
      <div style={{ display: "grid", gap: "var(--sp-lg)" }}>
        <label className="field">
          <span className="field-label">부대 일정명</span>
          <input
            className="input"
            autoFocus
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="field-label">일정 구분</legend>
          <div style={{ display: "flex", gap: "var(--sp-lg)" }}>
            <label className="check-field">
              <input
                type="radio"
                name="unit-event-kind"
                checked={!isHoliday}
                onChange={() => setIsHoliday(false)}
              />
              <span>평일</span>
            </label>
            <label className="check-field">
              <input
                type="radio"
                name="unit-event-kind"
                checked={isHoliday}
                onChange={() => setIsHoliday(true)}
              />
              <span style={{ color: "var(--negative)" }}>휴일</span>
            </label>
          </div>
          <small className="field-hint">
            휴일 일정은 달력에서 공휴일처럼 빨간색으로 표시돼요.
          </small>
        </fieldset>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">시작일</span>
            <input
              className="input"
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">종료일</span>
            <input
              className="input"
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </div>
        <div className="field-pair">
          <label className="field">
            <span className="field-label">시작 시간 (선택)</span>
            <input
              className="input"
              type="time"
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">종료 시간 (선택)</span>
            <input
              className="input"
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">상세 정보 (선택)</span>
          <textarea
            className="input"
            rows={4}
            maxLength={1000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </label>
        <p className="field-hint">
          저장하면 일정명과 상세 정보가 같은 부대의 모든 부대원에게 공유돼요.
        </p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div
          style={{
            display: "flex",
            gap: "var(--sp-sm)",
            justifyContent: "flex-end",
            flexWrap: "wrap",
          }}
        >
          {props.event ? (
            <button
              type="button"
              className="btn btn-danger"
              disabled={pending}
              onClick={() => {
                if (
                  window.confirm("모든 부대원의 달력에서 이 일정을 삭제할까요?")
                )
                  void deleteEvent
                    .mutateAsync(props.event!)
                    .then(props.onClose)
                    .catch((reason: unknown) =>
                      setError(
                        reason instanceof Error
                          ? reason.message
                          : "삭제하지 못했어요",
                      ),
                    );
              }}
            >
              삭제
            </button>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={props.onClose}
          >
            취소
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={() => void save()}
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
