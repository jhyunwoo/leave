/** 관리자 계정 생성·수정 입력. 서버 스키마는 worker/routes/admins.ts. */

import {
  CheckField,
  Field,
  SelectField,
  initialString,
  type InitialRecord,
} from "./fields";
import type { FormMode } from "./payloads";

const ROLE_OPTIONS = [
  ["admin", "관리자"],
  ["owner", "Owner"],
] as const;

export function AdminFields({
  mode,
  initial,
}: {
  mode: FormMode;
  initial?: InitialRecord;
}) {
  return (
    <>
      <div className="form-grid">
        {mode === "create" ? (
          <Field
            label="이메일"
            name="email"
            type="email"
            required
            initial={initial}
          />
        ) : (
          // 이메일은 감사 로그의 신원 스냅샷이라 만든 뒤 바꾸지 않는다.
          <div className="field">
            <span>이메일</span>
            <div className="read-only-field">
              {initialString(initial, "email")}
            </div>
          </div>
        )}
        <Field label="이름" name="name" required initial={initial} />
        <SelectField
          label="역할"
          name="role"
          initial={initial}
          options={ROLE_OPTIONS}
        />
      </div>
      {mode === "edit" ? (
        <CheckField
          name="active"
          label="활성 관리자 계정"
          defaultChecked={Boolean(initial?.active)}
        />
      ) : null}
    </>
  );
}
