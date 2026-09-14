/**
 * 웹 개인 일정 등록/수정 모달.
 *
 * 사용처: CalendarPage(날짜 상세의 "개인 일정 추가", 일정 줄 클릭).
 *
 * 날짜는 휴가 등록과 같은 기간 선택기를 쓴다(DateRangePicker). `<input type="date">`
 * 두 개였을 때는 같은 달력 화면에서 연 폼인데도 공휴일이 보이지 않았고, 기간이
 * 며칠인지도 두 값을 눈으로 빼야 알 수 있었다.
 *
 * 시간은 기본적으로 없는 값이다 — 대부분의 개인 일정은 하루 단위라 시·분을 물어
 * 봐야 빈칸 두 개만 남는다. 그래서 "시간 지정"을 켠 사람에게만 시각 선택기를
 * 보여주고, 끄면 저장 전에 값을 비운다.
 */

import { personalEventCreateSchema } from "@leave/shared";
import {
  useCreatePersonalEvent,
  useDeletePersonalEvent,
  useUpdatePersonalEvent,
  type PersonalEvent,
} from "@leave/client";
import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";

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
  // 이미 시각이 붙어 있던 일정은 열자마자 그 값이 보여야 한다.
  const [timed, setTimed] = useState(
    Boolean(props.event?.startTime || props.event?.endTime),
  );
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
      // 스위치를 끈 채 저장하면 화면에 없는 시각이 따라가지 않는다.
      startTime: timed ? startTime || null : null,
      endTime: timed ? endTime || null : null,
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        style={{ display: "grid", gap: "var(--sp-lg)" }}
      >
        <Field label="제목">
          <input
            className="input"
            autoFocus
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 외박 중 병원 진료"
            data-testid="personal-event-title"
          />
        </Field>

        <DateRangePicker
          startDate={startDate}
          endDate={endDate}
          onChange={(start, end) => {
            setStartDate(start);
            setEndDate(end);
          }}
          label="일정 기간"
          startInstruction="일정이 시작하는 날을 선택해주세요."
          endInstruction="일정의 마지막 날을 선택해주세요."
          testId="personal-event-range"
        />

        <div className="field">
          <label className="check-field">
            <input
              type="checkbox"
              checked={timed}
              onChange={(event) => {
                const next = event.target.checked;
                setTimed(next);
                if (!next) {
                  setStartTime("");
                  setEndTime("");
                }
              }}
              data-testid="personal-event-timed"
            />
            <span>
              <strong>시간 지정</strong>
              <small>끄면 날짜만 있는 하루 종일 일정으로 저장돼요.</small>
            </span>
          </label>
        </div>

        {timed ? (
          <div className="tf-pair">
            <TimeField
              label="시작 시간"
              value={startTime}
              onChange={setStartTime}
              optional
              defaultTime="09:00"
              testId="personal-event-start-time"
            />
            <TimeField
              label="종료 시간"
              value={endTime}
              onChange={setEndTime}
              optional
              // 시작을 이미 골랐으면 거기서 시작한다 — 굴릴 거리가 짧다.
              defaultTime={startTime || "18:00"}
              testId="personal-event-end-time"
            />
          </div>
        ) : null}

        <Field label="메모 (선택)">
          <textarea
            className="input"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </Field>

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
            type="submit"
            className="btn btn-primary"
            disabled={pending}
            data-testid="personal-event-save"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
