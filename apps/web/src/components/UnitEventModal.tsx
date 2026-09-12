/**
 * 웹 부대 일정 등록/수정 모달. 부대 관리자만 연다.
 *
 * 사용처: CalendarPage(날짜 상세의 "부대 일정 추가", 일정 줄 클릭).
 *
 * 개인 일정 모달과 같은 부품을 쓴다 — 기간은 휴가 등록과 같은 달력(DateRangePicker),
 * 시각은 드롭다운 선택기(TimeField). 같은 화면에서 번갈아 여는 두 폼이라 조작법이
 * 갈리면 그때마다 다시 익혀야 한다.
 *
 * 다른 것은 이 일정이 **남에게 보인다**는 점뿐이다. 휴일 구분은 부대원 모두의
 * 달력을 빨갛게 물들이므로 기간 위에 남겨 먼저 읽히게 한다.
 */

import { unitEventCreateSchema } from "@leave/shared";
import {
  useCreateUnitEvent,
  useDeleteUnitEvent,
  useUpdateUnitEvent,
  type UnitEvent,
} from "@leave/client";
import { useState } from "react";
import { DateRangePicker } from "./DateRangePicker";
import { Field } from "./Field";
import { Modal } from "./Modal";
import { TimeField } from "./TimeField";

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
  // 이미 시각이 붙어 있던 일정은 열자마자 그 값이 보여야 한다.
  const [timed, setTimed] = useState(
    Boolean(props.event?.startTime || props.event?.endTime),
  );
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
      // 스위치를 끈 채 저장하면 화면에 없는 시각이 따라가지 않는다.
      startTime: timed ? startTime || null : null,
      endTime: timed ? endTime || null : null,
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        style={{ display: "grid", gap: "var(--sp-lg)" }}
      >
        <Field label="부대 일정명">
          <input
            className="input"
            autoFocus
            maxLength={80}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 대대 전술훈련"
            data-testid="unit-event-title"
          />
        </Field>

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
          testId="unit-event-range"
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
              data-testid="unit-event-timed"
            />
            <span>
              <strong>시간 지정</strong>
              <small>끄면 날짜만 있는 하루 종일 일정으로 공유돼요.</small>
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
              testId="unit-event-start-time"
            />
            <TimeField
              label="종료 시간"
              value={endTime}
              onChange={setEndTime}
              optional
              testId="unit-event-end-time"
            />
          </div>
        ) : null}

        <Field label="상세 정보 (선택)">
          <textarea
            className="input"
            rows={4}
            maxLength={1000}
            value={details}
            onChange={(event) => setDetails(event.target.value)}
          />
        </Field>

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
            type="submit"
            className="btn btn-primary"
            disabled={pending}
            data-testid="unit-event-save"
          >
            {pending ? "저장 중…" : "저장"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
