/** 그룹 생성·수정 입력. 서버 스키마는 worker/routes/users-units.ts. */

import { Field, type InitialRecord } from "./fields";
import type { FormMode } from "./payloads";

export function UnitFields({
  mode,
  initial,
}: {
  mode: FormMode;
  initial?: InitialRecord;
}) {
  return (
    <div className="form-grid">
      <Field label="부대 이름" name="name" required initial={initial} />
      <Field label="설명" name="description" initial={initial} />
      <Field
        label="하루 최대 출타 인원"
        name="maxLeaveCount"
        type="number"
        min={0}
        required
        initial={initial}
      />
      {/* 생성자는 만든 뒤 바뀌지 않으므로 수정 화면에는 없다. */}
      {mode === "create" ? (
        <Field
          label="생성자 사용자 ID"
          name="creatorId"
          required
          initial={initial}
        />
      ) : null}
      <Field
        label="부대 관리자 사용자 ID"
        name="adminId"
        required
        initial={initial}
      />
    </div>
  );
}
