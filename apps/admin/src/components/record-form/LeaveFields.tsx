/**
 * 휴가 생성·수정 입력.
 *
 * 여기만 제어 컴포넌트다. 휴가는 "기간"이 아니라 "구간의 나열"로 저장되고
 * (8/2~8/5 연가 + 8/6~8/9 정기외박), 구간마다 **며칠 쓰는지**를 고르면 날짜가
 * 거기서 파생된다. 맞추는 규칙 자체는 @leave/shared의 draft 함수들이며
 * 앱이 쓰는 것과 같은 함수다 — 관리자가 만든 데이터도 앱에서 그대로 계산돼야 한다.
 *
 * 종료일 입력은 읽기 전용이 아니라 "총 일수를 이 날짜까지로 맞춘다"는 뜻이다.
 * 운영자는 보통 "언제까지"를 먼저 알고 오기 때문에 그 입구를 남겨 둔다.
 */

import { ArrowUp, ArrowDown, Trash2, Plus } from "lucide-react";

import {
  BALANCE_KEYS,
  BALANCE_LABELS,
  MAX_DATE_RANGE_DAYS,
  removeDraft,
  reorderDrafts,
  setDraftDays,
  type BalanceKey,
  type SegmentDraft,
} from "@leave/shared";
import { CheckField, Field, TextAreaField, type InitialRecord } from "./fields";

/** 구간 추가 버튼이 새로 만드는 구간의 기본 재원. */
const NEW_SEGMENT_KEY = "regular_overnight";

export function LeaveFields({
  initial,
  leaveStart,
  leaveEnd,
  onRangeChange,
  resolvedDrafts,
  onDraftsChange,
  sendNotifications,
  onSendNotificationsChange,
}: {
  initial?: InitialRecord;
  leaveStart: string;
  leaveEnd: string;
  onRangeChange: (start: string, end: string) => void;
  resolvedDrafts: {
    key: BalanceKey;
    startDate: string;
    endDate: string;
    days: number;
  }[];
  onDraftsChange: (update: (current: SegmentDraft[]) => SegmentDraft[]) => void;
  sendNotifications: boolean;
  onSendNotificationsChange: (value: boolean) => void;
}) {
  const rangeValid = Boolean(leaveStart) && resolvedDrafts.length > 0;

  return (
    <>
      <div className="form-grid">
        <Field label="사용자 ID" name="userId" required initial={initial} />
        <Field label="휴가 제목" name="title" required initial={initial} />
        <label className="field">
          <span>시작일</span>
          <input
            type="date"
            value={leaveStart}
            required
            // 길이는 구간 개수가 정한다. 시작일을 바꾸면 휴가가 통째로 움직인다.
            onChange={(event) => onRangeChange(event.target.value, "")}
          />
        </label>
        <label className="field">
          <span>종료일 (총 일수를 이 날짜까지로 맞춥니다)</span>
          <input
            type="date"
            value={leaveEnd}
            min={leaveStart || undefined}
            required
            onChange={(event) => onRangeChange(leaveStart, event.target.value)}
          />
        </label>
        <TextAreaField label="사유" name="reason" rows={4} initial={initial} />
      </div>

      <div className="field">
        <span>휴가 구간 — 언제부터 언제까지가 어떤 휴가인지</span>
        {rangeValid ? (
          <>
            {resolvedDrafts.map((draft, index) => (
              <div key={index} className="form-grid">
                <label className="field">
                  <span>재원</span>
                  <select
                    value={draft.key}
                    onChange={(event) => {
                      const key = event.target.value as BalanceKey;
                      onDraftsChange((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, key } : item,
                        ),
                      );
                    }}
                  >
                    {BALANCE_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {BALANCE_LABELS[key]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>
                    사용 일수 ({draft.startDate} ~ {draft.endDate})
                  </span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_DATE_RANGE_DAYS}
                    step={1}
                    value={draft.days}
                    onChange={(event) =>
                      onDraftsChange((current) =>
                        setDraftDays(
                          current,
                          index,
                          Number(event.target.value),
                        ),
                      )
                    }
                  />
                </label>
                <div className="field">
                  <span>순서</span>
                  <div>
                    <button
                      type="button"
                      className="button compact secondary"
                      disabled={index === 0}
                      onClick={() =>
                        onDraftsChange((current) =>
                          reorderDrafts(current, index, index - 1),
                        )
                      }
                    >
                      <ArrowUp size={17} aria-hidden="true" />
                      위로
                    </button>
                    <button
                      type="button"
                      className="button compact secondary"
                      disabled={index === resolvedDrafts.length - 1}
                      onClick={() =>
                        onDraftsChange((current) =>
                          reorderDrafts(current, index, index + 1),
                        )
                      }
                    >
                      <ArrowDown size={17} aria-hidden="true" />
                      아래로
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  className="button compact secondary"
                  disabled={resolvedDrafts.length <= 1}
                  onClick={() =>
                    onDraftsChange((current) => removeDraft(current, index))
                  }
                >
                  <Trash2 size={17} aria-hidden="true" />
                  구간 삭제
                </button>
              </div>
            ))}
            <button
              type="button"
              className="button compact secondary"
              onClick={() =>
                onDraftsChange((current) => [
                  ...current,
                  { key: NEW_SEGMENT_KEY, days: 1 },
                ])
              }
            >
              <Plus size={17} aria-hidden="true" />
              구간 추가
            </button>
          </>
        ) : (
          <span>시작일을 먼저 골라주세요.</span>
        )}
      </div>
      <CheckField
        label="변경 후 최대 출타 인원 초과 알림을 발송합니다"
        checked={sendNotifications}
        onChange={onSendNotificationsChange}
      />
    </>
  );
}
