import { personalEventCreateSchema } from "@leave/shared";
import {
  useCreatePersonalEvent,
  useDeletePersonalEvent,
  useUpdatePersonalEvent,
  type PersonalEvent,
} from "@leave/client";
import { useState } from "react";
import { Modal } from "./Modal";

export function PersonalEventModal(props: {
  initialDate: string;
  event?: PersonalEvent;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(props.event?.title ?? "");
  const [startDate, setStartDate] = useState(
    props.event?.startDate ?? props.initialDate,
  );
  const [endDate, setEndDate] = useState(
    props.event?.endDate ?? props.initialDate,
  );
  const [startTime, setStartTime] = useState(props.event?.startTime ?? "");
  const [endTime, setEndTime] = useState(props.event?.endTime ?? "");
  const [note, setNote] = useState(props.event?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const createEvent = useCreatePersonalEvent();
  const updateEvent = useUpdatePersonalEvent();
  const deleteEvent = useDeletePersonalEvent();
  const pending =
    createEvent.isPending || updateEvent.isPending || deleteEvent.isPending;

  const save = async () => {
    const parsed = personalEventCreateSchema.safeParse({
      title,
      startDate,
      endDate,
      startTime: startTime || null,
      endTime: endTime || null,
      note: note || null,
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
        reason instanceof Error ? reason.message : "일정을 저장하지 못했어요",
      );
    }
  };

  return (
    <Modal
      title={props.event ? "개인 일정 수정" : "개인 일정 추가"}
      onClose={props.onClose}
    >
      <div style={{ display: "grid", gap: "var(--sp-lg)" }}>
        <label className="field">
          <span className="field-label">제목</span>
          <input
            className="input"
            autoFocus
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
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
          <span className="field-label">메모 (선택)</span>
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <p className="field-hint">
          개인 일정은 나만 볼 수 있고 휴가 집계나 잔여량에 영향을 주지 않아요.
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
                if (window.confirm("이 개인 일정을 삭제할까요?"))
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
