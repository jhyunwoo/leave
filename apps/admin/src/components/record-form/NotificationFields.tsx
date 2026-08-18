/** 알림 생성·수정 입력. 서버 스키마는 worker/routes/notifications.ts. */

import {
  CheckField,
  Field,
  TextAreaField,
  initialString,
  type InitialRecord,
} from "./fields";
import type { FormMode } from "./payloads";

export function NotificationFields({
  mode,
  initial,
  sendPush,
  onSendPushChange,
}: {
  mode: FormMode;
  initial?: InitialRecord;
  sendPush: boolean;
  onSendPushChange: (value: boolean) => void;
}) {
  const creating = mode === "create";
  return (
    <>
      <div className="form-grid">
        {/* 대상은 만든 뒤 바뀌지 않는다 — 다른 사람에게 간 알림이 되어 버린다. */}
        {creating ? (
          <Field
            label="대상 사용자 ID"
            name="userId"
            required
            initial={initial}
          />
        ) : null}
        <Field label="제목" name="title" required initial={initial} />
        <TextAreaField
          label="내용"
          name="body"
          rows={5}
          required
          initial={initial}
        />
        <Field label="연관 휴가 ID (선택)" name="leaveId" initial={initial} />
        <Field
          label="관련 날짜 (쉼표로 구분)"
          name="dates"
          defaultValue={
            Array.isArray(initial?.dates)
              ? initial.dates.join(", ")
              : initialString(initial, "dates")
          }
        />
      </div>
      {/* 같은 자리의 체크박스가 생성에서는 "푸시 발송", 수정에서는 "읽음 상태"다. */}
      {creating ? (
        <CheckField
          label="Expo 푸시도 함께 발송합니다"
          checked={sendPush}
          onChange={onSendPushChange}
        />
      ) : (
        <CheckField
          name="read"
          label="읽음 상태"
          defaultChecked={Boolean(initial?.read)}
        />
      )}
    </>
  );
}
