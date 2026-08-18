/** 사용자 생성·수정 입력. 서버 스키마는 worker/routes/users-units.ts. */

import { CheckField, Field, SelectField, type InitialRecord } from "./fields";
import type { FormMode } from "./payloads";

const BRANCH_OPTIONS = [
  ["army", "육군"],
  ["navy", "해군"],
  ["air_force", "공군"],
] as const;

const RANK_OPTIONS = [
  ["private", "이병"],
  ["private_first", "일병"],
  ["corporal", "상병"],
  ["sergeant", "병장"],
] as const;

export function UserFields({
  mode,
  initial,
}: {
  mode: FormMode;
  initial?: InitialRecord;
}) {
  const creating = mode === "create";
  return (
    <>
      <div className="form-grid">
        <Field
          label="이메일"
          name="email"
          type="email"
          required
          initial={initial}
        />
        {/* 비밀번호는 절대 초기값으로 깔지 않는다(initial을 넘기지 않는 이유). */}
        <Field
          label={creating ? "임시 비밀번호" : "새 비밀번호 (선택)"}
          name="password"
          type="password"
          minLength={12}
          required={creating}
          initial={undefined}
        />
        <Field label="이름" name="name" required initial={initial} />
        <SelectField
          label="군 종류"
          name="branch"
          initial={initial}
          options={BRANCH_OPTIONS}
        />
        <Field
          label="입대일"
          name="enlistedAt"
          type="date"
          required
          initial={initial}
        />
        <Field
          label="전역 예정일"
          name="dischargeAt"
          type="date"
          required
          initial={initial}
        />
        <SelectField
          label="가입 계급"
          name="signupRank"
          initial={initial}
          options={RANK_OPTIONS}
        />
        <Field label="부대 ID (선택)" name="unitId" initial={initial} />
      </div>
      <CheckField
        name={creating ? "dataConsent" : "consented"}
        label={
          creating
            ? "사용자의 개인정보 수집 동의를 확인했습니다"
            : "개인정보 수집 동의 상태"
        }
        defaultChecked={creating ? false : Boolean(initial?.consentedAt)}
      />
    </>
  );
}
