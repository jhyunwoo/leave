/**
 * 휴가 생성·수정 입력.
 *
 * 여기만 제어 컴포넌트다. 휴가는 "기간"이 아니라 "구간의 나열"로 저장되고
 * (8/2~8/5 연가 + 8/6~8/9 정기외박), 기간을 바꾸면 구간을 다시 맞춰야 하므로
 * 화면 상태가 필요하다. 맞추는 규칙 자체는 @leave/shared의 draft 함수들이며
 * 앱이 쓰는 것과 같은 함수다 — 관리자가 만든 데이터도 앱에서 그대로 계산돼야 한다.
 */

import {
  addDays,
  BALANCE_KEYS,
  BALANCE_LABELS,
  removeDraft,
  setDraftEnd,
  splitLastDraft,
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
  const rangeValid = Boolean(leaveStart && leaveEnd && leaveStart <= leaveEnd);
  const totalDays = resolvedDrafts.reduce((sum, draft) => sum + draft.days, 0);

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
            onChange={(event) => {
              const next = event.target.value;
              // 시작일이 종료일을 넘어서면 종료일도 같이 민다.
              onRangeChange(
                next,
                !leaveEnd || leaveEnd < next ? next : leaveEnd,
              );
            }}
          />
        </label>
        <label className="field">
          <span>종료일</span>
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
            {resolvedDrafts.map((draft, index) => {
              const isLast = index === resolvedDrafts.length - 1;
              // 뒤에 남은 구간 수만큼 최소 하루씩 남겨둬야 한다.
              const maxEnd = addDays(
                leaveEnd,
                -(resolvedDrafts.length - 1 - index),
              );
              return (
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
                      {draft.startDate} 부터 ({draft.days}일)
                    </span>
                    <input
                      type="date"
                      value={draft.endDate}
                      min={draft.startDate}
                      max={maxEnd}
                      // 마지막 구간의 끝은 항상 휴가의 끝이라 고를 수 없다.
                      disabled={isLast}
                      onChange={(event) =>
                        onDraftsChange((current) =>
                          setDraftEnd(
                            current,
                            index,
                            event.target.value,
                            leaveStart,
                            leaveEnd,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="btn-ghost"
                    disabled={resolvedDrafts.length <= 1}
                    onClick={() =>
                      onDraftsChange((current) =>
                        removeDraft(current, index, leaveStart, leaveEnd),
                      )
                    }
                  >
                    구간 삭제
                  </button>
                </div>
              );
            })}
            <button
              type="button"
              className="btn-ghost"
              // 하루짜리 구간조차 더 못 만들면 쪼갤 수 없다.
              disabled={totalDays <= resolvedDrafts.length}
              onClick={() =>
                onDraftsChange(
                  (current) =>
                    splitLastDraft(
                      current,
                      leaveStart,
                      leaveEnd,
                      NEW_SEGMENT_KEY,
                    ) ?? current,
                )
              }
            >
              구간 추가
            </button>
          </>
        ) : (
          <span>시작일과 종료일을 먼저 골라주세요.</span>
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
